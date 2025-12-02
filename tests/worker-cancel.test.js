const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function waitForUpdate(worker, token, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off('message', handler);
      reject(new Error('timeout'));
    }, timeout);

    const handler = (message) => {
      if (message?.token !== token || message?.type !== 'update') return;
      clearTimeout(timer);
      worker.off('message', handler);
      resolve(message);
    };

    worker.on('message', handler);
  });
}

function waitForNoFurtherUpdates(worker, token, timeout = 500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off('message', handler);
      resolve();
    }, timeout);

    const handler = (message) => {
      if (message?.token === token && message?.type === 'update') {
        clearTimeout(timer);
        worker.off('message', handler);
        reject(new Error('received stale update'));
      }
    };

    worker.on('message', handler);
  });
}

test('perma analysis cancels cleanly and restarts from new position', async (t) => {
  const workerPath = path.join(__dirname, '..', 'worker.js');
  const worker = new Worker(workerPath);

  t.after(() => {
    worker.terminate();
  });

  const token1 = 'token-1';
  const token2 = 'token-2';

  worker.postMessage({ type: 'search', token: token1, fen: START_FEN, color: 'w' });
  await waitForUpdate(worker, token1);

  worker.postMessage({ type: 'cancel', token: token1 });
  await waitForNoFurtherUpdates(worker, token1);

  worker.postMessage({ type: 'search', token: token2, fen: AFTER_E4_FEN, color: 'b' });
  const update2 = await waitForUpdate(worker, token2);

  assert.ok(update2.lines?.length, 'expected new search to produce principal variation');
  assert.ok(update2.depth >= 1, 'expected depth to be tracked');
  const firstMove = update2.lines[0]?.line?.[0];
  assert.strictEqual(firstMove?.color, 'b', 'expected analysis to restart from new FEN with correct side to move');
});
