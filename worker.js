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
} else {
  importScripts("chess.js");
  importScripts("engine.js");
}

const ChessEngine = typeof workerScope.Chess === "function" ? workerScope.Chess : workerScope.Chess?.Chess;
const evaluateBoard = workerScope.evaluateBoard;
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
const transpositionTable = new Map();
const killerMoves = [];
const historyHeuristic = new Map();
const MAX_TT_ENTRIES = 50000;
const TT_FLAG = {
  EXACT: 0,
  LOWER: 1,
  UPPER: 2,
};

function isCancelled(token) {
  return cancelled || token !== activeToken;
}

function moveKey(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function getHistoryScore(move) {
  return historyHeuristic.get(moveKey(move)) || 0;
}

function addHistoryScore(move, depth) {
  const key = moveKey(move);
  const current = historyHeuristic.get(key) || 0;
  historyHeuristic.set(key, current + depth * depth);
}

function ttKey(chess) {
  return chess.fen().split(" ").slice(0, 4).join(" ");
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

function pruneTranspositionTable() {
  if (transpositionTable.size <= MAX_TT_ENTRIES) return;
  const extra = transpositionTable.size - MAX_TT_ENTRIES;
  const keys = transpositionTable.keys();
  for (let i = 0; i < extra; i += 1) {
    const next = keys.next();
    if (next.done) break;
    transpositionTable.delete(next.value);
  }
}

function minimax(depth, alpha, beta, maximizing, token, ply) {
  if (isCancelled(token)) return { score: maximizing ? -Infinity : Infinity, timeout: true };

  const alphaOrig = alpha;
  const betaOrig = beta;
  const key = ttKey(game);
  const ttEntry = transpositionTable.get(key);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_FLAG.EXACT) {
      return { score: ttEntry.score, line: ttEntry.line || [] };
    }
    if (ttEntry.flag === TT_FLAG.LOWER) {
      alpha = Math.max(alpha, ttEntry.score);
    } else if (ttEntry.flag === TT_FLAG.UPPER) {
      beta = Math.min(beta, ttEntry.score);
    }
    if (alpha >= beta) {
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
  if (depth === 0) return { score: evaluateBoard(game) };

  const moves = orderMoves(game.moves({ verbose: true }), ttEntry?.bestMove, ply);
  if (moves.length === 0) {
    return { score: evaluateBoard(game) };
  }

  let bestLine = [];
  if (maximizing) {
    let best = -Infinity;
    let timedOut = false;
    for (const move of moves) {
      if (isCancelled(token)) return { score: best, line: bestLine, timeout: true };
      game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, false, token, ply + 1);
      game.undo();
      if (timeout) timedOut = true;
      if (score > best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) {
        if (!move.captured) {
          recordKillerMove(ply, move);
          addHistoryScore(move, depth);
        }
        break;
      }
    }
    const flag =
      best <= alphaOrig ? TT_FLAG.UPPER : best >= betaOrig ? TT_FLAG.LOWER : TT_FLAG.EXACT;
    transpositionTable.set(key, { depth, score: best, flag, line: bestLine, bestMove: moveKey(bestLine[0] || {}) });
    pruneTranspositionTable();
    return { score: best, line: bestLine, timeout: timedOut };
  } else {
    let best = Infinity;
    let timedOut = false;
    for (const move of moves) {
      if (isCancelled(token)) return { score: best, line: bestLine, timeout: true };
      game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, true, token, ply + 1);
      game.undo();
      if (timeout) timedOut = true;
      if (score < best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) {
        if (!move.captured) {
          recordKillerMove(ply, move);
          addHistoryScore(move, depth);
        }
        break;
      }
    }
    const flag =
      best <= alphaOrig ? TT_FLAG.UPPER : best >= betaOrig ? TT_FLAG.LOWER : TT_FLAG.EXACT;
    transpositionTable.set(key, { depth, score: best, flag, line: bestLine, bestMove: moveKey(bestLine[0] || {}) });
    pruneTranspositionTable();
    return { score: best, line: bestLine, timeout: timedOut };
  }
}

function rootSearch(depth, maximizing, token) {
  const key = ttKey(game);
  const ttEntry = transpositionTable.get(key);
  const moves = orderMoves(game.moves({ verbose: true }), ttEntry?.bestMove, 0);
  let alpha = -Infinity;
  let beta = Infinity;
  const results = [];
  for (const move of moves) {
    if (isCancelled(token)) return { moves: results, timeout: true };
    game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    const { score, timeout, line } = minimax(depth - 1, alpha, beta, !maximizing, token, 1);
    game.undo();
    if (timeout || isCancelled(token)) return { moves: results, timeout: true };
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
    transpositionTable.set(key, {
      depth,
      score: results[0].score,
      flag: TT_FLAG.EXACT,
      line: results[0].line,
      bestMove: moveKey(results[0].line?.[0] || {}),
    });
    pruneTranspositionTable();
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
  const { type, token, fen, color } = event.data;
  if (type === "cancel") {
    cancelled = true;
    activeToken = null;
    clearSearchTimer();
    return;
  }

  if (type === "search") {
    // Stop any in-flight search immediately before starting a new one.
    cancelled = true;
    clearSearchTimer();

    activeToken = token;
    cancelled = false;
    game = new ChessEngine(fen);
    transpositionTable.clear();
    killerMoves.length = 0;
    historyHeuristic.clear();
    const maximizing = color === "w";
    let depth = 1;
    let best = [];

    const iterate = () => {
      if (isCancelled(token)) return;
      const { moves, timeout } = rootSearch(depth, maximizing, token);
      if (isCancelled(token)) return;
      if (!timeout && moves.length) {
        best = moves;
        workerScope.postMessage({ type: "update", token, depth, lines: best.slice(0, 5) });
      }
      depth += 1;
      searchTimer = setTimeout(iterate, 0);
    };

    iterate();
  }
};
