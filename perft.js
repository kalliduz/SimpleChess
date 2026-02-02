(() => {
  function perft(chess, depth) {
    if (depth === 0) return 1;
    const moves = chess.moves({ verbose: true });
    let nodes = 0;
    for (const move of moves) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      nodes += perft(chess, depth - 1);
      chess.undo();
    }
    return nodes;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { perft };
  }
  if (typeof self !== 'undefined') {
    self.perft = perft;
  }
})();
