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

class GameState {
  constructor(state) {
    if (state) {
      this.board = state.board.map((row) => row.map((p) => (p ? { ...p } : null)));
      this.turn = state.turn;
      this.castling = JSON.parse(JSON.stringify(state.castling));
      this.enPassant = state.enPassant ? { ...state.enPassant } : null;
      this.halfmove = state.halfmove;
      this.fullmove = state.fullmove;
      this.history = [];
      return;
    }
    this.board = this.createStartBoard();
    this.turn = "w";
    this.castling = { w: { k: true, q: true }, b: { k: true, q: true } };
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
  }

  createStartBoard() {
    const emptyRank = Array(8).fill(null);
    const board = [];
    const backRank = (color) => [
      { type: "r", color },
      { type: "n", color },
      { type: "b", color },
      { type: "q", color },
      { type: "k", color },
      { type: "b", color },
      { type: "n", color },
      { type: "r", color },
    ];
    const pawnRank = (color) => Array.from({ length: 8 }, () => ({ type: "p", color }));
    board.push(backRank("b"));
    board.push(pawnRank("b"));
    for (let i = 0; i < 4; i++) board.push([...emptyRank]);
    board.push(pawnRank("w"));
    board.push(backRank("w"));
    return board;
  }

  cloneBoard(board) {
    return board.map((row) => row.map((p) => (p ? { ...p } : null)));
  }

  reset() {
    this.board = this.createStartBoard();
    this.turn = "w";
    this.castling = { w: { k: true, q: true }, b: { k: true, q: true } };
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
  }

  inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  kingPosition(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === "k" && p.color === color) return { r, c };
      }
    }
    return null;
  }

  squareAttacked(r, c, byColor) {
    const dir = byColor === "w" ? -1 : 1;
    // Pawn attacks
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (this.inBounds(rr, cc)) {
        const p = this.board[rr][cc];
        if (p && p.color === byColor && p.type === "p") return true;
      }
    }
    // Knights
    const knightMoves = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dr, dc] of knightMoves) {
      const rr = r + dr;
      const cc = c + dc;
      if (this.inBounds(rr, cc)) {
        const p = this.board[rr][cc];
        if (p && p.color === byColor && p.type === "n") return true;
      }
    }
    // Sliding attacks
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dr, dc] of directions) {
      let rr = r + dr;
      let cc = c + dc;
      while (this.inBounds(rr, cc)) {
        const p = this.board[rr][cc];
        if (p) {
          if (p.color === byColor) {
            if (dr === 0 || dc === 0) {
              if (p.type === "r" || p.type === "q") return true;
            }
            if (dr !== 0 && dc !== 0) {
              if (p.type === "b" || p.type === "q") return true;
            }
          }
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    // King
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (this.inBounds(rr, cc)) {
          const p = this.board[rr][cc];
          if (p && p.color === byColor && p.type === "k") return true;
        }
      }
    }
    return false;
  }

  inCheck(color) {
    const king = this.kingPosition(color);
    if (!king) return false;
    return this.squareAttacked(king.r, king.c, color === "w" ? "b" : "w");
  }

  generateMoves(color = this.turn) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece || piece.color !== color) continue;
        switch (piece.type) {
          case "p":
            this.pawnMoves(r, c, piece, moves);
            break;
          case "n":
            this.knightMoves(r, c, piece, moves);
            break;
          case "b":
            this.slidingMoves(r, c, piece, moves, [
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ]);
            break;
          case "r":
            this.slidingMoves(r, c, piece, moves, [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]);
            break;
          case "q":
            this.slidingMoves(r, c, piece, moves, [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ]);
            break;
          case "k":
            this.kingMoves(r, c, piece, moves);
            break;
        }
      }
    }
    const legal = [];
    for (const m of moves) {
      this.makeMove(m);
      if (!this.inCheck(color)) legal.push(m);
      this.undo();
    }
    return legal;
  }

  pawnMoves(r, c, piece, moves) {
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    const promotionRow = piece.color === "w" ? 0 : 7;
    const one = { r: r + dir, c };
    if (this.inBounds(one.r, one.c) && !this.board[one.r][one.c]) {
      moves.push({ from: { r, c }, to: one, piece, promotion: one.r === promotionRow });
      const two = { r: r + dir * 2, c };
      if (r === startRow && !this.board[two.r][two.c]) {
        moves.push({ from: { r, c }, to: two, piece, double: true });
      }
    }
    for (const dc of [-1, 1]) {
      const target = { r: r + dir, c: c + dc };
      if (!this.inBounds(target.r, target.c)) continue;
      const capture = this.board[target.r][target.c];
      if (capture && capture.color !== piece.color) {
        moves.push({ from: { r, c }, to: target, piece, captured: capture, promotion: target.r === promotionRow });
      }
      if (this.enPassant && this.enPassant.r === target.r && this.enPassant.c === target.c) {
        moves.push({
          from: { r, c },
          to: target,
          piece,
          captured: { type: "p", color: piece.color === "w" ? "b" : "w" },
          enPassant: true,
        });
      }
    }
  }

  knightMoves(r, c, piece, moves) {
    const deltas = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dr, dc] of deltas) {
      const rr = r + dr;
      const cc = c + dc;
      if (!this.inBounds(rr, cc)) continue;
      const target = this.board[rr][cc];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { r, c }, to: { r: rr, c: cc }, piece, captured: target || null });
      }
    }
  }

  slidingMoves(r, c, piece, moves, directions) {
    for (const [dr, dc] of directions) {
      let rr = r + dr;
      let cc = c + dc;
      while (this.inBounds(rr, cc)) {
        const target = this.board[rr][cc];
        if (!target) {
          moves.push({ from: { r, c }, to: { r: rr, c: cc }, piece });
        } else {
          if (target.color !== piece.color) {
            moves.push({ from: { r, c }, to: { r: rr, c: cc }, piece, captured: target });
          }
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }

  kingMoves(r, c, piece, moves) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (!this.inBounds(rr, cc)) continue;
        const target = this.board[rr][cc];
        if (!target || target.color !== piece.color) {
          moves.push({ from: { r, c }, to: { r: rr, c: cc }, piece, captured: target || null });
        }
      }
    }
    const color = piece.color;
    const homeRow = color === "w" ? 7 : 0;
    if (r !== homeRow || c !== 4) return;
    if (this.inCheck(color)) return;
    if (this.castling[color].k && !this.board[homeRow][5] && !this.board[homeRow][6]) {
      if (!this.squareAttacked(homeRow, 5, color === "w" ? "b" : "w") && !this.squareAttacked(homeRow, 6, color === "w" ? "b" : "w")) {
        moves.push({ from: { r, c }, to: { r: homeRow, c: 6 }, piece, castle: "k" });
      }
    }
    if (this.castling[color].q && !this.board[homeRow][1] && !this.board[homeRow][2] && !this.board[homeRow][3]) {
      if (!this.squareAttacked(homeRow, 2, color === "w" ? "b" : "w") && !this.squareAttacked(homeRow, 3, color === "w" ? "b" : "w")) {
        moves.push({ from: { r, c }, to: { r: homeRow, c: 2 }, piece, castle: "q" });
      }
    }
  }

  makeMove(move) {
    const { from, to, piece } = move;
    const capturedPiece = move.enPassant ? this.board[from.r][to.c] : this.board[to.r][to.c];
    const prevState = {
      move,
      captured: capturedPiece,
      castling: JSON.parse(JSON.stringify(this.castling)),
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
    };
    this.history.push(prevState);

    this.halfmove = capturedPiece || piece.type === "p" ? 0 : this.halfmove + 1;
    if (piece.color === "b") this.fullmove += 1;

    this.board[from.r][from.c] = null;

    if (move.castle === "k") {
      this.board[to.r][to.c] = piece;
      const rookFrom = { r: to.r, c: 7 };
      const rookTo = { r: to.r, c: 5 };
      this.board[rookTo.r][rookTo.c] = this.board[rookFrom.r][rookFrom.c];
      this.board[rookFrom.r][rookFrom.c] = null;
    } else if (move.castle === "q") {
      this.board[to.r][to.c] = piece;
      const rookFrom = { r: to.r, c: 0 };
      const rookTo = { r: to.r, c: 3 };
      this.board[rookTo.r][rookTo.c] = this.board[rookFrom.r][rookFrom.c];
      this.board[rookFrom.r][rookFrom.c] = null;
    } else if (move.enPassant) {
      this.board[to.r][to.c] = piece;
      this.board[from.r][to.c] = null;
    } else {
      this.board[to.r][to.c] = { ...piece };
    }

    if (move.promotion) {
      this.board[to.r][to.c].type = "q";
    }

    if (piece.type === "k") {
      this.castling[piece.color] = { k: false, q: false };
    }
    if (piece.type === "r") {
      if (from.r === 7 && from.c === 0) this.castling.w.q = false;
      if (from.r === 7 && from.c === 7) this.castling.w.k = false;
      if (from.r === 0 && from.c === 0) this.castling.b.q = false;
      if (from.r === 0 && from.c === 7) this.castling.b.k = false;
    }
    if (capturedPiece && capturedPiece.type === "r") {
      if (to.r === 7 && to.c === 0) this.castling.w.q = false;
      if (to.r === 7 && to.c === 7) this.castling.w.k = false;
      if (to.r === 0 && to.c === 0) this.castling.b.q = false;
      if (to.r === 0 && to.c === 7) this.castling.b.k = false;
    }

    if (piece.type === "p" && move.double) {
      this.enPassant = { r: (from.r + to.r) / 2, c: from.c };
    } else {
      this.enPassant = null;
    }

    this.turn = this.turn === "w" ? "b" : "w";
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    const { move, captured, castling, enPassant, halfmove, fullmove } = last;
    const { from, to, piece } = move;

    this.castling = castling;
    this.enPassant = enPassant;
    this.halfmove = halfmove;
    this.fullmove = fullmove;

    this.board[from.r][from.c] = { ...piece };
    if (move.castle === "k") {
      this.board[to.r][to.c] = null;
      this.board[to.r][7] = { type: "r", color: piece.color };
      this.board[to.r][5] = null;
    } else if (move.castle === "q") {
      this.board[to.r][to.c] = null;
      this.board[to.r][0] = { type: "r", color: piece.color };
      this.board[to.r][3] = null;
    } else if (move.enPassant) {
      this.board[to.r][to.c] = null;
      this.board[from.r][to.c] = captured;
    } else {
      this.board[to.r][to.c] = captured ? { ...captured } : null;
    }

    this.turn = this.turn === "w" ? "b" : "w";
  }

  result() {
    const moves = this.generateMoves();
    if (moves.length === 0) {
      if (this.inCheck(this.turn)) return this.turn === "w" ? "0-1" : "1-0";
      return "1/2-1/2";
    }
    if (this.halfmove >= 100) return "1/2-1/2";
    return null;
  }
}

function evaluate(game) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      const val = PIECE_VALUE[p.type];
      score += p.color === "w" ? val : -val;
    }
  }
  return score;
}

if (typeof self !== "undefined") {
  self.PIECES = PIECES;
  self.PIECE_VALUE = PIECE_VALUE;
  self.GameState = GameState;
  self.evaluate = evaluate;
}
