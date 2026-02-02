const test = require('node:test');
const assert = require('node:assert');
const { Chess } = require('chess.js');

require('../engine.js');

const { evaluateBoard } = global;

test('endgame king activity is rewarded', () => {
  const activeKing = new Chess('8/8/8/3k4/8/3K4/8/8 w - - 0 1');
  const passiveKing = new Chess('8/8/8/3k4/8/8/8/4K3 w - - 0 1');
  const activeScore = evaluateBoard(activeKing);
  const passiveScore = evaluateBoard(passiveKing);
  assert.ok(activeScore > passiveScore, 'expected active king to score higher');
});

test('passed pawns are valued more than blocked pawns', () => {
  const passedPawn = new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  const blockedPawn = new Chess('4k3/8/8/8/8/4p3/4P3/4K3 w - - 0 1');
  const passedScore = evaluateBoard(passedPawn);
  const blockedScore = evaluateBoard(blockedPawn);
  assert.ok(passedScore > blockedScore, 'expected passed pawn to score higher');
});
