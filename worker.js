let workerScope = typeof self !== "undefined" ? self : null;

if (!workerScope) {
  const { parentPort } = require("node:worker_threads");
  const { Chess } = require("chess.js");

  workerScope = {
    postMessage: (message) => parentPort.postMessage(message),
    onmessage: null,
    Chess,
  };

  parentPort.on("message", (data) => {
    if (typeof workerScope.onmessage === "function") {
      workerScope.onmessage({ data });
    }
  });

  global.self = workerScope;
  require("./engine.js");
  require("./perft.js");
} else {
  importScripts("chess.js");
  importScripts("engine.js");
  importScripts("perft.js");
}

const ChessEngine = typeof workerScope.Chess === "function" ? workerScope.Chess : workerScope.Chess?.Chess;
const evaluateBoard = workerScope.evaluateBoard;
const PIECE_VALUE = workerScope.PIECE_VALUE;
const perft = workerScope.perft;
if (!ChessEngine) {
  throw new Error("Chess library failed to load inside the worker.");
}
if (!evaluateBoard) {
  throw new Error("Evaluation function failed to load inside the worker.");
}

let activeToken = null;
let cancelled = false;
let game = null;
let searchTimer = null;

const TT_SIZE = 1 << 20;
const transpositionTable = new Array(TT_SIZE);
const killerMoves = [];
const historyHeuristic = new Map();
const TT_FLAG = {
  EXACT: 0,
  LOWER: 1,
  UPPER: 2,
};

const OPENING_BOOK = {
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e4", "d4", "c4", "Nf3"],
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -": ["e5", "c5", "e6", "c6"],
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["Nf3", "Nc3", "Bc4"],
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["Nf3", "d4", "Nc3"],
};

const ZOBRIST = (() => {
  let seed = 0x9e3779b9;
  const rand32 = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const pieces = new Uint32Array(64 * 12);
  for (let i = 0; i < pieces.length; i += 1) {
    pieces[i] = rand32();
  }
  const castling = new Uint32Array(16);
  for (let i = 0; i < castling.length; i += 1) {
    castling[i] = rand32();
  }
  const ep = new Uint32Array(8);
  for (let i = 0; i < ep.length; i += 1) {
    ep[i] = rand32();
  }
  return {
    pieces,
    side: rand32(),
    castling,
    ep,
  };
})();

const PIECE_ORDER = ["p", "n", "b", "r", "q", "k"];

function pieceIndex(piece) {
  const base = PIECE_ORDER.indexOf(piece.type);
  if (base < 0) return 0;
  return base + (piece.color === "w" ? 0 : 6);
}

function ttKey(chess) {
  const board = chess.board();
  let key = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const idx = (row * 8 + col) * 12 + pieceIndex(piece);
      key ^= ZOBRIST.pieces[idx];
    }
  }
  const fenParts = chess.fen().split(" ");
  const castling = fenParts[2];
  let castlingIndex = 0;
  if (castling.includes("K")) castlingIndex |= 1;
  if (castling.includes("Q")) castlingIndex |= 2;
  if (castling.includes("k")) castlingIndex |= 4;
  if (castling.includes("q")) castlingIndex |= 8;
  key ^= ZOBRIST.castling[castlingIndex];
  const epSquare = fenParts[3];
  if (epSquare && epSquare !== "-") {
    const file = epSquare.charCodeAt(0) - "a".charCodeAt(0);
    if (file >= 0 && file < 8) {
      key ^= ZOBRIST.ep[file];
    }
  }
  if (fenParts[1] === "w") {
    key ^= ZOBRIST.side;
  }
  return key >>> 0;
}

function ttGet(key) {
  const idx = key & (TT_SIZE - 1);
  const entry = transpositionTable[idx];
  if (entry && entry.key === key) return entry;
  return null;
}

function ttSet(key, entry) {
  const idx = key & (TT_SIZE - 1);
  const existing = transpositionTable[idx];
  if (!existing || entry.depth >= existing.depth) {
    transpositionTable[idx] = { ...entry, key };
  }
}

function isCancelled(token, timeBudget) {
  return cancelled || token !== activeToken || (timeBudget && timeBudget.expired());
}

function moveKey(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function applyMove(chess, move) {
  const payload = move.promotion ? { from: move.from, to: move.to, promotion: move.promotion } : { from: move.from, to: move.to };
  try {
    return chess.move(payload);
  } catch {
    return null;
  }
}

function getHistoryScore(move) {
  return historyHeuristic.get(moveKey(move)) || 0;
}

function addHistoryScore(move, depth) {
  const key = moveKey(move);
  const current = historyHeuristic.get(key) || 0;
  historyHeuristic.set(key, current + depth * depth);
}

function recordKillerMove(ply, move) {
  if (!killerMoves[ply]) {
    killerMoves[ply] = [];
  }
  const slot = killerMoves[ply];
  const key = moveKey(move);
  if (slot[0] !== key) {
    slot[1] = slot[0];
    slot[0] = key;
  }
}

function seeValue(move) {
  if (!move.captured) return 0;
  const capturedValue = PIECE_VALUE[move.captured] || 0;
  const moverValue = PIECE_VALUE[move.piece] || 0;
  return capturedValue - moverValue;
}

function scoreMove(move, ttBestMove, ply) {
  let score = 0;
  if (ttBestMove && moveKey(move) === ttBestMove) {
    score += 100000;
  }
  if (move.captured) {
    const capturedValue = PIECE_VALUE[move.captured] || 0;
    const moverValue = PIECE_VALUE[move.piece] || 0;
    score += 10000 + capturedValue * 10 - moverValue;
  }
  if (move.promotion) {
    score += 9000 + (PIECE_VALUE[move.promotion] || 0);
  }
  const killers = killerMoves[ply];
  if (killers) {
    const key = moveKey(move);
    if (killers[0] === key) score += 8000;
    else if (killers[1] === key) score += 7000;
  }
  score += getHistoryScore(move);
  return score;
}

function orderMoves(moves, ttBestMove, ply) {
  if (moves.length <= 1) return moves;
  return moves
    .map((move) => ({ move, score: scoreMove(move, ttBestMove, ply) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function inCheck(chess) {
  if (typeof chess.isCheck === "function") return chess.isCheck();
  if (typeof chess.inCheck === "function") return chess.inCheck();
  return false;
}

function isPassedPawnMove(move, chess) {
  if (move.piece !== "p") return false;
  const board = chess.board();
  const target = chess.get(move.to);
  if (!target || target.type !== "p" || target.color !== move.color) return false;
  const forward = move.color === "w" ? -1 : 1;
  const toCoords = { row: 8 - Number(move.to[1]), col: move.to.charCodeAt(0) - 97 };
  for (let dc = -1; dc <= 1; dc += 1) {
    const file = toCoords.col + dc;
    if (file < 0 || file > 7) continue;
    for (let r = toCoords.row + forward; r >= 0 && r < 8; r += forward) {
      const piece = board[r][file];
      if (piece && piece.type === "p" && piece.color !== move.color) {
        return false;
      }
    }
  }
  return true;
}

function isRecapture(move, prevMove) {
  if (!prevMove) return false;
  return move.captured && move.to === prevMove.to;
}

function makeNullMove(chess) {
  const fen = chess.fen();
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  parts[4] = "0";
  const moveCount = Number(parts[5]);
  parts[5] = Number.isNaN(moveCount) ? parts[5] : String(moveCount + 1);
  chess.load(parts.join(" "));
  return fen;
}

function restoreFen(chess, fen) {
  chess.load(fen);
}

function gamePhase(chess) {
  const board = chess.board();
  let phase = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      if (piece.type === "n" || piece.type === "b") phase += 1;
      else if (piece.type === "r") phase += 2;
      else if (piece.type === "q") phase += 4;
    }
  }
  return phase;
}

function findBookMove(chess) {
  const key = chess.fen().split(" ").slice(0, 4).join(" ");
  const options = OPENING_BOOK[key];
  if (!options || !options.length) return null;
  const moves = chess.moves({ verbose: true });
  for (const san of options) {
    const match = moves.find((move) => move.san === san || move.san?.replace(/[+#]$/, "") === san);
    if (match) return match;
  }
  return null;
}

function createSearchStats() {
  return {
    nodes: 0,
    qnodes: 0,
    ttHits: 0,
    ttStores: 0,
    ttCuts: 0,
    nullPrunes: 0,
    lmrReductions: 0,
    lmpCuts: 0,
    seePrunes: 0,
    orderingCuts: 0,
  };
}

function quiescence(alpha, beta, maximizing, token, stats, timeBudget) {
  if (isCancelled(token, timeBudget)) return { score: maximizing ? -Infinity : Infinity, timeout: true };
  stats.qnodes += 1;
  const standPat = evaluateBoard(game);
  if (maximizing) {
    if (standPat >= beta) return { score: standPat };
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return { score: standPat };
    if (standPat < beta) beta = standPat;
  }

  const moves = game.moves({ verbose: true }).filter((move) => move.captured || move.promotion);
  const ordered = orderMoves(moves, null, 0);
  for (const move of ordered) {
    const delta = seeValue(move);
    if (maximizing && standPat + delta + 50 < alpha) continue;
    if (!maximizing && standPat - delta - 50 > beta) continue;
    if (!applyMove(game, move)) continue;
    const { score, timeout } = quiescence(alpha, beta, !maximizing, token, stats, timeBudget);
    game.undo();
    if (timeout) return { score, timeout };
    if (maximizing) {
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    } else {
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
  }
  return { score: maximizing ? alpha : beta };
}

function minimax(depth, alpha, beta, maximizing, token, ply, prevMove, stats, timeBudget, extensionsUsed) {
  if (isCancelled(token, timeBudget)) return { score: maximizing ? -Infinity : Infinity, timeout: true };
  stats.nodes += 1;

  const inCheckNow = inCheck(game);
  let extension = 0;
  if (inCheckNow && extensionsUsed < 1) {
    extension = 1;
  }
  depth += extension;

  const alphaOrig = alpha;
  const betaOrig = beta;
  const key = ttKey(game);
  const ttEntry = ttGet(key);
  if (ttEntry && ttEntry.depth >= depth) {
    stats.ttHits += 1;
    if (ttEntry.flag === TT_FLAG.EXACT) {
      return { score: ttEntry.score, line: ttEntry.line || [] };
    }
    if (ttEntry.flag === TT_FLAG.LOWER) {
      alpha = Math.max(alpha, ttEntry.score);
    } else if (ttEntry.flag === TT_FLAG.UPPER) {
      beta = Math.min(beta, ttEntry.score);
    }
    if (alpha >= beta) {
      stats.ttCuts += 1;
      return { score: ttEntry.score, line: ttEntry.line || [] };
    }
  }

  if (game.isCheckmate()) {
    return { score: maximizing ? -Infinity : Infinity };
  }
  if (
    game.isStalemate() ||
    game.isDraw() ||
    game.isInsufficientMaterial() ||
    game.isThreefoldRepetition()
  ) {
    return { score: 0 };
  }
  if (depth <= 0) {
    return quiescence(alpha, beta, maximizing, token, stats, timeBudget);
  }

  if (!inCheckNow && depth >= 3 && gamePhase(game) > 6) {
    const nullFen = makeNullMove(game);
    const { score: nullScore, timeout } = minimax(
      depth - 1 - 2,
      maximizing ? beta - 1 : alpha,
      maximizing ? beta : alpha + 1,
      !maximizing,
      token,
      ply + 1,
      prevMove,
      stats,
      timeBudget,
      extensionsUsed
    );
    restoreFen(game, nullFen);
    if (timeout) return { score: nullScore, timeout };
    if (maximizing && nullScore >= beta) {
      stats.nullPrunes += 1;
      return { score: beta };
    }
    if (!maximizing && nullScore <= alpha) {
      stats.nullPrunes += 1;
      return { score: alpha };
    }
  }

  const moves = orderMoves(game.moves({ verbose: true }), ttEntry?.bestMove, ply);
  if (moves.length === 0) {
    return { score: evaluateBoard(game) };
  }

  let bestLine = [];
  let bestScore = maximizing ? -Infinity : Infinity;
  let timedOut = false;

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    const quiet = !move.captured && !move.promotion && !move.flags?.includes("e");

    if (depth <= 2 && quiet && index > (depth === 1 ? 3 : 5) && !inCheckNow) {
      stats.lmpCuts += 1;
      continue;
    }

    if (move.captured && depth <= 2 && seeValue(move) < -50) {
      stats.seePrunes += 1;
      continue;
    }

    if (!applyMove(game, move)) continue;
    const givesCheck = inCheck(game);
    const recapture = isRecapture(move, prevMove);
    const passedPawn = isPassedPawnMove(move, game) && gamePhase(game) <= 6;
    let nextDepth = depth - 1;
    if (givesCheck || recapture || passedPawn) {
      nextDepth += 1;
    }

    let reduction = 0;
    if (quiet && !givesCheck && depth >= 3 && index > 3 && !inCheckNow) {
      reduction = Math.min(2, Math.floor((index - 2) / 3));
    }
    if (reduction > 0) {
      stats.lmrReductions += 1;
    }

    let scoreResult;
    if (index === 0) {
      scoreResult = minimax(
        nextDepth,
        alpha,
        beta,
        !maximizing,
        token,
        ply + 1,
        move,
        stats,
        timeBudget,
        extensionsUsed + extension
      );
    } else {
      scoreResult = minimax(
        nextDepth - reduction,
        alpha,
        alpha + 1,
        !maximizing,
        token,
        ply + 1,
        move,
        stats,
        timeBudget,
        extensionsUsed + extension
      );
      if (!scoreResult.timeout) {
        const pvScore = maximizing ? scoreResult.score : scoreResult.score;
        const needsFull = maximizing ? pvScore > alpha && pvScore < beta : pvScore < beta && pvScore > alpha;
        if (needsFull) {
          scoreResult = minimax(
            nextDepth,
            alpha,
            beta,
            !maximizing,
            token,
            ply + 1,
            move,
            stats,
            timeBudget,
            extensionsUsed + extension
          );
        }
      }
    }

    game.undo();

    if (scoreResult.timeout) {
      timedOut = true;
      break;
    }

    const score = scoreResult.score;
    const line = scoreResult.line || [];

    if (maximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestLine = [move, ...line];
      }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestLine = [move, ...line];
      }
      beta = Math.min(beta, bestScore);
    }

    if (beta <= alpha) {
      stats.orderingCuts += 1;
      if (!move.captured) {
        recordKillerMove(ply, move);
        addHistoryScore(move, depth);
      }
      break;
    }
  }

  const flag =
    bestScore <= alphaOrig ? TT_FLAG.UPPER : bestScore >= betaOrig ? TT_FLAG.LOWER : TT_FLAG.EXACT;
  ttSet(key, { depth, score: bestScore, flag, line: bestLine, bestMove: moveKey(bestLine[0] || {}) });
  stats.ttStores += 1;
  return { score: bestScore, line: bestLine, timeout: timedOut };
}

function rootSearch(depth, maximizing, token, stats, timeBudget) {
  const key = ttKey(game);
  const ttEntry = ttGet(key);
  const moves = orderMoves(game.moves({ verbose: true }), ttEntry?.bestMove, 0);
  let alpha = -Infinity;
  let beta = Infinity;
  const results = [];
  for (const move of moves) {
    if (isCancelled(token, timeBudget)) return { moves: results, timeout: true };
    if (!applyMove(game, move)) continue;
    const { score, timeout, line } = minimax(depth - 1, alpha, beta, !maximizing, token, 1, move, stats, timeBudget, 0);
    game.undo();
    if (timeout || isCancelled(token, timeBudget)) return { moves: results, timeout: true };
    const totalLine = [move, ...(line || [])];
    const displayScore = maximizing ? score : -score;
    results.push({ score, displayScore, line: totalLine });
    if (maximizing) {
      alpha = Math.max(alpha, score);
    } else {
      beta = Math.min(beta, score);
    }
  }
  if (results.length) {
    ttSet(key, {
      depth,
      score: results[0].score,
      flag: TT_FLAG.EXACT,
      line: results[0].line,
      bestMove: moveKey(results[0].line?.[0] || {}),
    });
    stats.ttStores += 1;
  }
  results.sort((a, b) => b.displayScore - a.displayScore);
  return { moves: results, timeout: false };
}

function clearSearchTimer() {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

workerScope.onmessage = (event) => {
  const { type, token, fen, color, maxDepth, timeLimitMs, perftDepth } = event.data;
  if (type === "cancel") {
    cancelled = true;
    activeToken = null;
    clearSearchTimer();
    return;
  }

  if (type === "perft") {
    game = new ChessEngine(fen);
    const nodes = perft(game, perftDepth);
    workerScope.postMessage({ type: "perft", token, nodes, depth: perftDepth });
    return;
  }

  if (type === "search") {
    cancelled = true;
    clearSearchTimer();

    activeToken = token;
    cancelled = false;
    game = new ChessEngine(fen);
    transpositionTable.fill(null);
    killerMoves.length = 0;
    historyHeuristic.clear();
    const maximizing = color === "w";
    const stats = createSearchStats();
    const start = Date.now();
    const timeBudget = timeLimitMs
      ? {
          expired: () => Date.now() - start >= timeLimitMs,
        }
      : null;

    let depth = 1;
    let best = [];
    let lastScore = 0;
    const bookMove = findBookMove(game);
    if (bookMove) {
      const line = [bookMove];
      workerScope.postMessage({
        type: "update",
        token,
        depth: 1,
        lines: [{ score: 0, displayScore: 0, line }],
        stats: { ...stats, nodes: 1, nps: 0, eval: 0, book: true },
      });
      if (!timeLimitMs && maxDepth === 1) {
        workerScope.postMessage({ type: "done", token, depth: 1, lines: [{ score: 0, displayScore: 0, line }], stats });
        return;
      }
    }

    const iterate = () => {
      if (isCancelled(token, timeBudget)) {
        workerScope.postMessage({ type: "done", token, depth: depth - 1, lines: best.slice(0, 5), stats });
        return;
      }
      const aspiration = Math.max(30, Math.floor(Math.abs(lastScore) * 0.15));
      let alpha = lastScore - aspiration;
      let beta = lastScore + aspiration;
      let result = rootSearch(depth, maximizing, token, stats, timeBudget);
      if (isCancelled(token, timeBudget)) {
        workerScope.postMessage({ type: "done", token, depth: depth - 1, lines: best.slice(0, 5), stats });
        return;
      }
      if (!result.timeout && result.moves.length) {
        let bestScore = result.moves[0].score;
        if (bestScore <= alpha || bestScore >= beta) {
          alpha = -Infinity;
          beta = Infinity;
          result = rootSearch(depth, maximizing, token, stats, timeBudget);
          if (result.moves.length) {
            bestScore = result.moves[0].score;
          }
        }
        best = result.moves;
        lastScore = bestScore;
        const elapsed = Math.max(1, Date.now() - start);
        const nps = Math.floor((stats.nodes + stats.qnodes) / (elapsed / 1000));
        if (isCancelled(token, timeBudget)) {
          workerScope.postMessage({ type: "done", token, depth: depth - 1, lines: best.slice(0, 5), stats });
          return;
        }
        setTimeout(() => {
          if (isCancelled(token, timeBudget)) {
            return;
          }
          workerScope.postMessage({
            type: "update",
            token,
            depth,
            lines: best.slice(0, 5),
            stats: {
              ...stats,
              nps,
              eval: maximizing ? lastScore : -lastScore,
            },
          });
        }, 0);
      }

      if (maxDepth && depth >= maxDepth) {
        workerScope.postMessage({ type: "done", token, depth, lines: best.slice(0, 5), stats });
        return;
      }
      depth += 1;
      searchTimer = setTimeout(iterate, 50);
    };

    iterate();
  }
};
