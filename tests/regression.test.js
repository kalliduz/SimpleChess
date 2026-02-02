const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function runSearch({ fen, color, depth, timeout = 5000 }) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '..', 'worker.js');
    const worker = new Worker(workerPath);
    const token = `search-${Date.now()}-${Math.random()}`;

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('search timeout'));
    }, timeout);

    worker.on('message', (message) => {
      if (message?.token !== token || message?.type !== 'done') return;
      clearTimeout(timer);
      worker.terminate();
      resolve(message);
    });

    worker.postMessage({
      type: 'search',
      token,
      fen,
      color,
      maxDepth: depth,
      timeLimitMs: 0,
    });
  });
}

test('regression: PV line for starting position is stable', async () => {
  const result = await runSearch({ fen: START_FEN, color: 'w', depth: 1 });
  const best = result.lines?.[0]?.line?.[0];
  assert.ok(best, 'expected a best move');
  assert.strictEqual(best.from, 'e2');
  assert.strictEqual(best.to, 'e4');
});

test('regression: PV moves are legal', async () => {
  const result = await runSearch({ fen: START_FEN, color: 'w', depth: 2 });
  const line = result.lines?.[0]?.line;
  assert.ok(line?.length, 'expected a PV line');

  const { Chess } = require('chess.js');
  const game = new Chess(START_FEN);
  for (const move of line) {
    const made = game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    assert.ok(made, `illegal move in PV: ${move.from}-${move.to}`);
  }
});
