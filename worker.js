importScripts("chess.js");
importScripts("engine.js");

const ChessEngine = typeof self.Chess === "function" ? self.Chess : self.Chess?.Chess;
if (!ChessEngine) {
  throw new Error("Chess library failed to load inside the worker.");
}

let activeToken = null;
let cancelled = false;
let game = null;

function minimax(depth, alpha, beta, maximizing, deadline) {
  if (cancelled) return { score: maximizing ? -Infinity : Infinity, timeout: true };
  if (performance.now() > deadline) return { score: maximizing ? -Infinity : Infinity, timeout: true };

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
      if (cancelled) return { score: best, line: bestLine, timeout: true };
      game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, false, deadline);
      game.undo();
      if (timeout) timedOut = true;
      if (score > best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
      if (performance.now() > deadline) {
        timedOut = true;
        break;
      }
    }
    return { score: best, line: bestLine, timeout: timedOut };
  } else {
    let best = Infinity;
    let timedOut = false;
    for (const move of moves) {
      if (cancelled) return { score: best, line: bestLine, timeout: true };
      game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      const { score, timeout, line } = minimax(depth - 1, alpha, beta, true, deadline);
      game.undo();
      if (timeout) timedOut = true;
      if (score < best) {
        best = score;
        bestLine = [move, ...(line || [])];
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
      if (performance.now() > deadline) {
        timedOut = true;
        break;
      }
    }
    return { score: best, line: bestLine, timeout: timedOut };
  }
}

function rootSearch(depth, maximizing, deadline) {
  const moves = game.moves({ verbose: true });
  let alpha = -Infinity;
  let beta = Infinity;
  const results = [];
  for (const move of moves) {
    if (cancelled) return { moves: results, timeout: true };
    game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    const { score, timeout, line } = minimax(depth - 1, alpha, beta, !maximizing, deadline);
    game.undo();
    if (timeout) return { moves: results, timeout: true };
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

self.onmessage = (event) => {
  const { type, token, fen, timeMs, color } = event.data;
  if (type === "cancel") {
    if (token === activeToken) cancelled = true;
    return;
  }

  if (type === "search") {
    activeToken = token;
    cancelled = false;
    game = new ChessEngine(fen);
    const maximizing = color === "w";
    const deadline = performance.now() + timeMs;
    let depth = 1;
    let best = [];
    while (!cancelled && performance.now() < deadline) {
      const { moves, timeout } = rootSearch(depth, maximizing, deadline);
      if (cancelled) break;
      if (!timeout && moves.length) {
        best = moves;
        self.postMessage({ type: "update", token, depth, lines: best.slice(0, 5) });
      }
      depth += 1;
    }
    if (!cancelled) {
      self.postMessage({ type: "done", token, depth: depth - 1, lines: best.slice(0, 5) });
    }
  }
};
