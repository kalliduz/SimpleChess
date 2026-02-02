# SimpleChess TODO (Strength, Performance, and Roadmap)

This backlog focuses on **engine strength**, **search performance**, **evaluation quality**, **UX/analysis tooling**, and **project hygiene**. It is intentionally broad and detailed to support phased work from quick wins to long-term research tasks.

---

## 1) Engine Strength (Search Quality)

### 1.1 Core Search Enhancements
- **Transposition table (TT)**
  - Add Zobrist hashing and a fixed-size TT.
  - Store depth, score, node type (exact/lower/upper), and best move.
  - Use TT for move ordering and cutoffs.
- **Iterative deepening improvements**
  - Use aspiration windows for deeper iterations.
  - Store and re-use principal variation (PV) across iterations.
- **Quiescence search**
  - Extend leaf evaluation with capture checks and promotions.
  - Add stand pat evaluation and delta pruning.
- **Null-move pruning**
  - Use dynamic reductions based on depth and evaluation.
  - Add safeguards in zugzwang-prone positions (endgames).
- **Late move reductions (LMR)**
  - Reduce depth for late, quiet moves in non-tactical positions.
  - Re-search if reduced move scores high.
- **Late move pruning (LMP)**
  - Trim quiet moves at low depth based on move count.
- **Principal variation search (PVS)**
  - Use narrow windows on non-PV moves after the first move.

### 1.2 Move Ordering
- **MVV-LVA** (Most Valuable Victim / Least Valuable Attacker) for captures.
- **History heuristic** for quiet move ordering.
- **Killer moves** per depth.
- **TT best move** prioritized first.
- **SEE-based** pruning (Static Exchange Evaluation) to filter losing captures.

### 1.3 Search Extensions
- **Check extensions** (limited) when in check or giving check.
- **Passed pawn extensions** in endgames.
- **Recapture extensions** to stabilize tactical sequences.

---

## 2) Evaluation Improvements

### 2.1 Material and Piece-Square
- **Tuned piece-square tables** by phase (opening/middlegame/endgame).
- **Piece values per phase** (e.g., bishops stronger in open positions).
- **Bishop pair bonus**.
- **Rook on open/semi-open file bonus**.

### 2.2 King Safety
- **Pawn shield evaluation** (missing pawns around king).
- **Open file penalty** near king.
- **Attacker count** and **mobility** around king zone.
- **Castling bonus / delayed castling penalty**.

### 2.3 Pawn Structure
- **Passed pawn scoring** with rank bonus and king support.
- **Isolated pawn penalty**.
- **Doubled pawn penalty**.
- **Backward pawn penalty**.
- **Pawn majority/duo bonuses**.

### 2.4 Mobility and Initiative
- **Piece mobility counts** by piece type.
- **Space advantage** (advanced pawns, control squares).
- **Tempo bonus** for side to move.

### 2.5 Endgame Knowledge
- **Simple endgame heuristics** (king activity, opposition).
- **Rook endgame principles** (active rook, rook behind passed pawn).
- **Minor-piece endgame bonuses** (knight outposts, bishop long diagonals).

---

## 3) Performance Optimizations

### 3.1 Data Structures & Hot Paths
- Replace high-allocation structures with fixed arrays.
- Avoid repeated object creation in move generation.
- Use typed arrays for board representation if feasible.

### 3.2 Move Generation
- **Precomputed move tables** for knights, kings, and sliding piece rays.
- **Bitboards (optional)** for faster move generation and evaluation.
- **Incremental make/unmake** with minimal state copies.

### 3.3 Search Efficiency
- **Move count and node counters** for profiling.
- **Time management** for iterative deepening.
- **Node caching** for repeated positions in PV.

---

## 4) UX & Analysis Tooling

### 4.1 Analysis UI
- Display **search depth**, **nodes**, **nps**, and **eval**.
- Toggle **PV line** expansion with move list.
- Show **evaluation bar** for quick visual feedback.

### 4.2 Debugging Tools
- Developer console panel to display:
  - TT hit rate
  - Move ordering statistics
  - Pruning counts
- Add **perft** mode to validate move generation.

---

## 5) Testing & Validation

### 5.1 Correctness Tests
- **Perft tests** at multiple depths (standard positions).
- Check handling of **special moves** (castling, promotion, en-passant).

### 5.2 Search Quality Tests
- Tactical test suite (mate-in-1/2/3 puzzles).
- Endgame suite to validate evaluation changes.

### 5.3 Regression Testing
- Snapshot the PV line for known positions.
- Validate no illegal moves after changes.

---

## 6) Roadmap / Next Steps

### Short-term (Quick Wins)
1. Add transposition table (Zobrist hashing).
2. Implement move ordering: TT move + MVV-LVA + killer + history.
3. Add quiescence search to reduce horizon effect.
4. Add perft mode + basic test harness.

### Mid-term (Strength Boost)
1. PVS + LMR + null-move pruning.
2. Evaluation upgrades: king safety + pawn structure.
3. Phase-based evaluation (opening/endgame).

### Long-term (Advanced)
1. Bitboard migration.
2. Endgame tablebases (e.g., Syzygy) if feasible.
3. ML-assisted evaluation (lightweight NNUE or handcrafted hybrid).

---

## 7) Miscellaneous Enhancements
- Add **opening book** (small curated set).
- Add **difficulty levels** (depth or time limits).
- Add **analysis mode** (infinite search until stopped).
- Add **export/import FEN** in UI.
- Add **move annotation** and **blunder detection**.

---

## 8) Documentation & Project Hygiene
- Improve README with engine architecture description.
- Document evaluation terms and tuning approach.
- Document performance profiling workflow.
- Add contribution guidelines and code style.

---

## 9) Stretch Goals
- Multi-threaded search (worker pool).
- Endgame learning / tuning pipeline.
- ELO benchmarking vs baseline.

