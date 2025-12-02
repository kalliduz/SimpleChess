importScripts("engine.js");

let activeToken = null;
let cancelled = false;

function minimax(depth, alpha, beta, maximizing, deadline) {
  if (cancelled) return { score: maximizing ? -Infinity : Infinity, timeout: true };
  if (performance.now() > deadline) return { score: maximizing ? -Infinity : Infinity, timeout: true };

  const result = game.result();
  if (result) {
    if (result === "1/2-1/2") return { score: 0 };
    return { score: result === "1-0" ? Infinity : -Infinity };
  }
  if (depth === 0) return { score: evaluate(game) };

  const moves = game.generateMoves();
  if (moves.length === 0) {
    return { score: evaluate(game) };
  }

  let bestLine = [];
  if (maximizing) {
    let best = -Infinity;
    let timedOut = false;
    for (const move of moves) {
      if (cancelled) return { score: best, line: bestLine, timeout: true };
      game.makeMove(move);
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
      game.makeMove(move);
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
  const moves = game.generateMoves();
  let alpha = -Infinity;
  let beta = Infinity;
  const results = [];
  for (const move of moves) {
    if (cancelled) return { moves: results, timeout: true };
    game.makeMove(move);
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

let game = null;

self.onmessage = (event) => {
  const { type, token, state, timeMs, color } = event.data;
  if (type === "cancel") {
    if (token === activeToken) cancelled = true;
    return;
  }

  if (type === "search") {
    activeToken = token;
    cancelled = false;
    game = new GameState(state);
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
