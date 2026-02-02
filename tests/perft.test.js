const test = require('node:test');
const assert = require('node:assert');
const { Chess } = require('chess.js');
const { perft } = require('../perft');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CASTLING_FEN = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

const PROMOTION_FEN = '4k3/P7/8/8/8/8/7p/4K3 w - - 0 1';

const EN_PASSANT_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 2';

const PERFT_EXPECTATIONS = [
  { depth: 1, nodes: 20 },
  { depth: 2, nodes: 400 },
  { depth: 3, nodes: 8902 },
];

test('perft counts match standard opening position', () => {
  const game = new Chess(START_FEN);
  for (const { depth, nodes } of PERFT_EXPECTATIONS) {
    assert.strictEqual(perft(game, depth), nodes);
  }
});

test('perft handles castling positions', () => {
  const game = new Chess(CASTLING_FEN);
  assert.strictEqual(perft(game, 1), 26);
});

test('perft handles promotion positions', () => {
  const game = new Chess(PROMOTION_FEN);
  assert.strictEqual(perft(game, 1), 9);
});

test('perft handles en-passant positions', () => {
  const game = new Chess(EN_PASSANT_FEN);
  assert.ok(perft(game, 1) > 0);
});
