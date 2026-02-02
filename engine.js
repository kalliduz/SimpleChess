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

  const PHASE_WEIGHTS = { p: 0, n: 1, b: 1, r: 2, q: 4 };
  const TOTAL_PHASE = 24;

  const MG_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const EG_VALUES = { p: 120, n: 310, b: 340, r: 520, q: 920, k: 20000 };

  const PIECE_SQUARE_TABLES = {
    mg: {
      p: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5, 5, 10, 25, 25, 10, 5, 5],
        [0, 0, 0, 20, 20, 0, 0, 0],
        [5, -5, -10, 0, 0, -10, -5, 5],
        [5, 10, 10, -20, -20, 10, 10, 5],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      n: [
        [-50, -40, -30, -30, -30, -30, -40, -50],
        [-40, -20, 0, 0, 0, 0, -20, -40],
        [-30, 0, 10, 15, 15, 10, 0, -30],
        [-30, 5, 15, 20, 20, 15, 5, -30],
        [-30, 0, 15, 20, 20, 15, 0, -30],
        [-30, 5, 10, 15, 15, 10, 5, -30],
        [-40, -20, 0, 5, 5, 0, -20, -40],
        [-50, -40, -30, -30, -30, -30, -40, -50],
      ],
      b: [
        [-20, -10, -10, -10, -10, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 10, 10, 5, 0, -10],
        [-10, 5, 5, 10, 10, 5, 5, -10],
        [-10, 0, 10, 10, 10, 10, 0, -10],
        [-10, 10, 10, 10, 10, 10, 10, -10],
        [-10, 5, 0, 0, 0, 0, 5, -10],
        [-20, -10, -10, -10, -10, -10, -10, -20],
      ],
      r: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [5, 10, 10, 10, 10, 10, 10, 5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [0, 0, 0, 5, 5, 0, 0, 0],
      ],
      q: [
        [-20, -10, -10, -5, -5, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 5, 5, 5, 0, -10],
        [-5, 0, 5, 5, 5, 5, 0, -5],
        [0, 0, 5, 5, 5, 5, 0, -5],
        [-10, 5, 5, 5, 5, 5, 0, -10],
        [-10, 0, 5, 0, 0, 0, 0, -10],
        [-20, -10, -10, -5, -5, -10, -10, -20],
      ],
      k: [
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-20, -30, -30, -40, -40, -30, -30, -20],
        [-10, -20, -20, -20, -20, -20, -20, -10],
        [20, 20, 0, 0, 0, 0, 20, 20],
        [20, 30, 10, 0, 0, 10, 30, 20],
      ],
    },
    eg: {
      p: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [80, 80, 80, 80, 80, 80, 80, 80],
        [35, 35, 40, 45, 45, 40, 35, 35],
        [20, 20, 25, 35, 35, 25, 20, 20],
        [10, 10, 15, 25, 25, 15, 10, 10],
        [5, 5, 10, 15, 15, 10, 5, 5],
        [0, 0, 0, -10, -10, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      n: [
        [-50, -40, -30, -30, -30, -30, -40, -50],
        [-35, -20, 0, 5, 5, 0, -20, -35],
        [-25, 0, 15, 20, 20, 15, 0, -25],
        [-20, 5, 20, 25, 25, 20, 5, -20],
        [-20, 5, 15, 20, 20, 15, 5, -20],
        [-25, 0, 10, 15, 15, 10, 0, -25],
        [-35, -20, 0, 0, 0, 0, -20, -35],
        [-50, -40, -30, -30, -30, -30, -40, -50],
      ],
      b: [
        [-20, -10, -10, -10, -10, -10, -10, -20],
        [-10, 0, 0, 5, 5, 0, 0, -10],
        [-10, 5, 10, 12, 12, 10, 5, -10],
        [-10, 8, 12, 15, 15, 12, 8, -10],
        [-10, 8, 12, 15, 15, 12, 8, -10],
        [-10, 5, 10, 12, 12, 10, 5, -10],
        [-10, 0, 0, 5, 5, 0, 0, -10],
        [-20, -10, -10, -10, -10, -10, -10, -20],
      ],
      r: [
        [5, 10, 10, 10, 10, 10, 10, 5],
        [5, 10, 15, 15, 15, 15, 10, 5],
        [0, 5, 10, 12, 12, 10, 5, 0],
        [0, 5, 10, 12, 12, 10, 5, 0],
        [0, 5, 10, 12, 12, 10, 5, 0],
        [0, 5, 10, 12, 12, 10, 5, 0],
        [0, 5, 10, 12, 12, 10, 5, 0],
        [5, 10, 10, 10, 10, 10, 10, 5],
      ],
      q: [
        [-10, -5, -5, -5, -5, -5, -5, -10],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 5, 5, 5, 5, 0, -5],
        [-5, 0, 5, 8, 8, 5, 0, -5],
        [-5, 0, 5, 8, 8, 5, 0, -5],
        [-5, 0, 5, 5, 5, 5, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-10, -5, -5, -5, -5, -5, -5, -10],
      ],
      k: [
        [-50, -30, -30, -30, -30, -30, -30, -50],
        [-30, -10, -10, -10, -10, -10, -10, -30],
        [-30, -10, 0, 0, 0, 0, -10, -30],
        [-30, -10, 0, 10, 10, 0, -10, -30],
        [-30, -10, 0, 10, 10, 0, -10, -30],
        [-30, -10, 0, 0, 0, 0, -10, -30],
        [-30, -10, -10, -10, -10, -10, -10, -30],
        [-50, -30, -30, -30, -30, -30, -30, -50],
      ],
    },
  };

  const KNIGHT_MOVES = [];
  const KING_MOVES = [];
  const DIRECTIONS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const knight = [];
      const king = [];
      const knightDeltas = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];
      const kingDeltas = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];
      for (const [dr, dc] of knightDeltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          knight.push([nr, nc]);
        }
      }
      for (const [dr, dc] of kingDeltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          king.push([nr, nc]);
        }
      }
      KNIGHT_MOVES[r * 8 + c] = knight;
      KING_MOVES[r * 8 + c] = king;
    }
  }

  function interpolate(mg, eg, phase) {
    return mg * phase + eg * (1 - phase);
  }

  function getPositionalBonus(piece, row, col, phase) {
    const tableMg = PIECE_SQUARE_TABLES.mg[piece.type];
    const tableEg = PIECE_SQUARE_TABLES.eg[piece.type];
    if (!tableMg || !tableEg) return 0;
    const idxRow = piece.color === "w" ? 7 - row : row;
    const mg = tableMg[idxRow][col];
    const eg = tableEg[idxRow][col];
    const blended = interpolate(mg, eg, phase);
    return piece.color === "w" ? blended : -blended;
  }

  function isPassedPawn(pawn, pawnFiles, enemyPawnFiles) {
    const { row, col, color } = pawn;
    const forward = color === "w" ? -1 : 1;
    const startRow = row + forward;
    const enemyFiles = [col - 1, col, col + 1];
    for (const file of enemyFiles) {
      if (file < 0 || file > 7) continue;
      const enemyPawns = enemyPawnFiles[file];
      for (const enemyRow of enemyPawns) {
        if (color === "w") {
          if (enemyRow < row) return false;
        } else {
          if (enemyRow > row) return false;
        }
      }
    }
    return true;
  }

  function pawnShieldScore(kingPos, pawnFiles, color) {
    if (!kingPos) return 0;
    const { row, col } = kingPos;
    const forward = color === "w" ? -1 : 1;
    const shieldRow = row + forward;
    let score = 0;
    for (let dc = -1; dc <= 1; dc += 1) {
      const file = col + dc;
      if (file < 0 || file > 7) continue;
      const pawns = pawnFiles[file];
      if (pawns.some((pawnRow) => pawnRow === shieldRow)) {
        score += 15;
      } else {
        score -= 10;
      }
    }
    return score;
  }

  function openFilePenalty(kingPos, pawnFiles, enemyPawnFiles) {
    if (!kingPos) return 0;
    const { col } = kingPos;
    const fileHasFriendly = pawnFiles[col]?.length > 0;
    const fileHasEnemy = enemyPawnFiles[col]?.length > 0;
    if (!fileHasFriendly && !fileHasEnemy) return -25;
    if (!fileHasFriendly && fileHasEnemy) return -15;
    return 0;
  }

  function rookFileBonus(rooks, pawnFiles, enemyPawnFiles, color) {
    let bonus = 0;
    for (const rook of rooks) {
      const file = rook.col;
      const friendly = pawnFiles[file]?.length > 0;
      const enemy = enemyPawnFiles[file]?.length > 0;
      if (!friendly && !enemy) bonus += 20;
      else if (!friendly && enemy) bonus += 10;
    }
    return color === "w" ? bonus : -bonus;
  }

  function countMobility(board, color) {
    let mobility = 0;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (!piece || piece.color !== color) continue;
        const idx = row * 8 + col;
        if (piece.type === "n") {
          mobility += KNIGHT_MOVES[idx].filter(([r, c]) => !board[r][c] || board[r][c].color !== color).length;
        } else if (piece.type === "k") {
          mobility += KING_MOVES[idx].filter(([r, c]) => !board[r][c] || board[r][c].color !== color).length;
        } else if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
          const dirs = [];
          if (piece.type === "b" || piece.type === "q") dirs.push(...DIRECTIONS.slice(4));
          if (piece.type === "r" || piece.type === "q") dirs.push(...DIRECTIONS.slice(0, 4));
          for (const [dr, dc] of dirs) {
            let r = row + dr;
            let c = col + dc;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
              if (!board[r][c]) {
                mobility += 1;
              } else {
                if (board[r][c].color !== color) mobility += 1;
                break;
              }
              r += dr;
              c += dc;
            }
          }
        } else if (piece.type === "p") {
          mobility += 1;
        }
      }
    }
    return mobility;
  }

  function distanceToCenter(row, col) {
    return Math.abs(3.5 - row) + Math.abs(3.5 - col);
  }

  function kingOppositionBonus(kingW, kingB) {
    if (!kingW || !kingB) return 0;
    const dist = Math.abs(kingW.row - kingB.row) + Math.abs(kingW.col - kingB.col);
    return dist === 2 ? 15 : 0;
  }

  function evaluateBoard(chess) {
    let score = 0;
    const board = chess.board();
    let phase = 0;
    const pawnFiles = { w: Array.from({ length: 8 }, () => []), b: Array.from({ length: 8 }, () => []) };
    const bishops = { w: 0, b: 0 };
    const rooks = { w: [], b: [] };
    const kings = { w: null, b: null };
    const pawns = { w: [], b: [] };

    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const piece = board[row][col];
        if (!piece) continue;
        phase += PHASE_WEIGHTS[piece.type] || 0;
        if (piece.type === "p") {
          pawnFiles[piece.color][col].push(row);
          pawns[piece.color].push({ row, col, color: piece.color });
        }
        if (piece.type === "b") bishops[piece.color] += 1;
        if (piece.type === "r") rooks[piece.color].push({ row, col, color: piece.color });
        if (piece.type === "k") kings[piece.color] = { row, col, color: piece.color };
      }
    }

    const phaseFactor = Math.min(phase, TOTAL_PHASE) / TOTAL_PHASE;

    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const piece = board[row][col];
        if (!piece) continue;
        const mg = MG_VALUES[piece.type] || 0;
        const eg = EG_VALUES[piece.type] || 0;
        const material = interpolate(mg, eg, phaseFactor);
        const signed = piece.color === "w" ? material : -material;
        score += signed;
        score += getPositionalBonus(piece, row, col, phaseFactor);
      }
    }

    if (bishops.w >= 2) score += 35;
    if (bishops.b >= 2) score -= 35;

    score += rookFileBonus(rooks.w, pawnFiles.w, pawnFiles.b, "w");
    score += rookFileBonus(rooks.b, pawnFiles.b, pawnFiles.w, "b");

    score += pawnShieldScore(kings.w, pawnFiles.w, "w");
    score -= pawnShieldScore(kings.b, pawnFiles.b, "b");
    score += openFilePenalty(kings.w, pawnFiles.w, pawnFiles.b);
    score -= openFilePenalty(kings.b, pawnFiles.b, pawnFiles.w);

    for (const color of ["w", "b"]) {
      const enemy = color === "w" ? "b" : "w";
      for (const pawn of pawns[color]) {
        const passed = isPassedPawn(pawn, pawnFiles[color], pawnFiles[enemy]);
        const rank = color === "w" ? 8 - pawn.row : pawn.row + 1;
        let pawnScore = 0;
        if (passed) {
          pawnScore += 15 + rank * 8;
          if (kings[color] && Math.abs(kings[color].col - pawn.col) <= 1) pawnScore += 10;
        }
        const neighbors = [pawn.col - 1, pawn.col + 1].filter((file) => file >= 0 && file < 8);
        const isolated = neighbors.every((file) => pawnFiles[color][file].length === 0);
        if (isolated) pawnScore -= 12;
        if (pawnFiles[color][pawn.col].length > 1) pawnScore -= 10;
        const forward = color === "w" ? -1 : 1;
        const aheadRow = pawn.row + forward;
        const blocked = aheadRow >= 0 && aheadRow < 8 && board[aheadRow][pawn.col];
        const supportedBehind = neighbors.some((file) => pawnFiles[color][file].some((row) => (color === "w" ? row > pawn.row : row < pawn.row)));
        if (!passed && blocked && !supportedBehind) pawnScore -= 8;
        score += color === "w" ? pawnScore : -pawnScore;
      }
    }

    const whitePawns = pawns.w.length;
    const blackPawns = pawns.b.length;
    const whiteQueenside = pawns.w.filter((p) => p.col <= 3).length;
    const blackQueenside = pawns.b.filter((p) => p.col <= 3).length;
    const whiteKingside = whitePawns - whiteQueenside;
    const blackKingside = blackPawns - blackQueenside;
    if (whiteQueenside > blackQueenside) score += 8;
    if (blackQueenside > whiteQueenside) score -= 8;
    if (whiteKingside > blackKingside) score += 8;
    if (blackKingside > whiteKingside) score -= 8;

    for (const pawn of pawns.w) {
      if (pawns.w.some((other) => other !== pawn && Math.abs(other.col - pawn.col) === 1 && other.row === pawn.row)) {
        score += 4;
      }
    }
    for (const pawn of pawns.b) {
      if (pawns.b.some((other) => other !== pawn && Math.abs(other.col - pawn.col) === 1 && other.row === pawn.row)) {
        score -= 4;
      }
    }

    const mobilityScore = (countMobility(board, "w") - countMobility(board, "b")) * 2;
    score += mobilityScore;

    const spaceScore = (pawns.w.filter((p) => p.row <= 3).length - pawns.b.filter((p) => p.row >= 4).length) * 4;
    score += spaceScore;

    score += chess.turn() === "w" ? 10 : -10;

    if (phaseFactor < 0.35) {
      if (kings.w) score -= distanceToCenter(kings.w.row, kings.w.col) * 8;
      if (kings.b) score += distanceToCenter(kings.b.row, kings.b.col) * 8;
      score += kingOppositionBonus(kings.w, kings.b);

      for (const rook of rooks.w) {
        const passed = pawns.w.find((pawn) => pawn.col === rook.col && isPassedPawn(pawn, pawnFiles.w, pawnFiles.b));
        if (passed && rook.row > passed.row) score += 12;
      }
      for (const rook of rooks.b) {
        const passed = pawns.b.find((pawn) => pawn.col === rook.col && isPassedPawn(pawn, pawnFiles.b, pawnFiles.w));
        if (passed && rook.row < passed.row) score -= 12;
      }
    }

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (!piece) continue;
        if (piece.type === "n") {
          const color = piece.color;
          const pawnSupport = pawns[color].some((pawn) => pawn.row === row + (color === "w" ? 1 : -1) && Math.abs(pawn.col - col) === 1);
          const enemyPawnAttack = pawns[color === "w" ? "b" : "w"].some((pawn) => pawn.row === row + (color === "w" ? -1 : 1) && Math.abs(pawn.col - col) === 1);
          if (pawnSupport && !enemyPawnAttack) {
            score += color === "w" ? 20 : -20;
          }
        }
        if (piece.type === "b") {
          const color = piece.color;
          const onLongDiagonal = row - col === 0 || row + col === 7;
          if (onLongDiagonal) {
            score += color === "w" ? 10 : -10;
          }
        }
      }
    }

    return score;
  }

  root.PIECES = PIECES;
  root.PIECE_VALUE = PIECE_VALUE;
  root.evaluateBoard = evaluateBoard;
})();
