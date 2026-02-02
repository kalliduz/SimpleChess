(() => {
  const root = typeof self !== "undefined" ? self : globalThis;
  if (root.evaluateBoard && root.PIECES && root.PIECE_VALUE) {
    return;
  }

  const PIECES = {
    w: {
      p: "♙",
      r: "♖",
      n: "♘",
      b: "♗",
      q: "♕",
      k: "♔",
    },
    b: {
      p: "♟",
      r: "♜",
      n: "♞",
      b: "♝",
      q: "♛",
      k: "♚",
    },
  };

  const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  function evaluateBoard(chess) {
    let score = 0;
    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const val = PIECE_VALUE[piece.type];
        score += piece.color === "w" ? val : -val;
      }
    }
    return score;
  }

  root.PIECES = PIECES;
  root.PIECE_VALUE = PIECE_VALUE;
  root.evaluateBoard = evaluateBoard;
})();
