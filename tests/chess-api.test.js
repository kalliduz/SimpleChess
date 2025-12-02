const test = require('node:test');
const assert = require('assert');
const { Chess } = require('chess.js');

test('uses modern chess.js API names', () => {
  const game = new Chess();

  assert.strictEqual(typeof game.isCheckmate, 'function');
  assert.strictEqual(typeof game.isStalemate, 'function');
  assert.strictEqual(typeof game.isDraw, 'function');
  assert.strictEqual(typeof game.isInsufficientMaterial, 'function');
  assert.strictEqual(typeof game.isThreefoldRepetition, 'function');
  assert.strictEqual(game.inCheckmate, undefined);
});

test('detects checkmate and stalemate positions', () => {
  const mateGame = new Chess();
  ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'].forEach((move) => mateGame.move(move));
  assert.ok(mateGame.isCheckmate());
  assert.ok(mateGame.isGameOver());

  const stalemateGame = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.ok(stalemateGame.isStalemate());
  assert.ok(stalemateGame.isDraw());
});
