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

function isCancelled(token) {
  return cancelled || token !== activeToken;
}

function minimax(depth, alpha, beta, maximizing, token) {
  if (isCancelled(token)) return { score: maximizing ? -Infinity : Infinity, timeout: true };

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

  const moves = game.moves({ verbose: true });
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
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, false, token);
      game.undo();
      if (timeout) timedOut = true;
      if (score > best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, line: bestLine, timeout: timedOut };
  } else {
    let best = Infinity;
    let timedOut = false;
    for (const move of moves) {
      if (isCancelled(token)) return { score: best, line: bestLine, timeout: true };
      game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, true, token);
      game.undo();
      if (timeout) timedOut = true;
      if (score < best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return { score: best, line: bestLine, timeout: timedOut };
  }
}

function rootSearch(depth, maximizing, token) {
  const moves = game.moves({ verbose: true });
  let alpha = -Infinity;
  let beta = Infinity;
  const results = [];
  for (const move of moves) {
    if (isCancelled(token)) return { moves: results, timeout: true };
    game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    const { score, timeout, line } = minimax(depth - 1, alpha, beta, !maximizing, token);
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
