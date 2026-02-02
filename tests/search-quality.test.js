const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

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

test('finds a mate-in-one tactical solution', async () => {
  const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
  const result = await runSearch({ fen, color: 'w', depth: 2 });
  const best = result.lines?.[0]?.line?.[0];
  assert.ok(best, 'expected a best move');
  const { Chess } = require('chess.js');
  const game = new Chess(fen);
  game.move({ from: best.from, to: best.to, promotion: best.promotion || 'q' });
  assert.ok(game.isCheckmate(), 'expected the best move to deliver mate');
});

test('finds a strong response when in check', async () => {
  const fen = '4k3/8/8/8/4q3/8/4Q3/4K3 w - - 0 1';
  const result = await runSearch({ fen, color: 'w', depth: 2 });
  const best = result.lines?.[0]?.line?.[0];
  assert.ok(best, 'expected a best move');
  const { Chess } = require('chess.js');
  const game = new Chess(fen);
  game.move({ from: best.from, to: best.to, promotion: best.promotion || 'q' });
  assert.ok(!game.isCheck(), 'expected the move to resolve check');
});
