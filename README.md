# SimpleChess

SimpleChess is a zero-dependency chess playground that runs straight from GitHub Pages or a local file. It ships a handcrafted engine with iterative deepening, advanced move ordering, a richer evaluation, and a dedicated analysis panel.

## How to play
1. Open `index.html` in your browser (or host it with GitHub Pages).
2. Click **New Game** to reset the board.
3. Click a piece, then click a destination square. Legal targets are highlighted.
4. Use **Analysis mode** to run an infinite search, and **Move Now** to let the engine play the current best move.

## Highlights
- Iterative deepening with aspiration windows, transposition table, PVS, LMR/LMP, null-move pruning, and quiescence search.
- Rich evaluation that blends opening/endgame piece-square tables, king safety, pawn structure, mobility, and endgame heuristics.
- Analysis panel with depth, nodes, NPS, evaluation bar, PV lines, and developer diagnostics.
- Utility tools: perft runner, FEN import/export, and move annotations with blunder detection.

## Engine architecture
The engine runs inside `worker.js` to keep the UI responsive. Search nodes reuse a transposition table keyed with Zobrist hashing, and principal variations are returned to the UI for display. Move ordering uses TT best moves, MVV-LVA capture scoring, history heuristic, and killer moves. The worker supports time budgets and fixed-depth searches so that difficulty and analysis mode can be tuned from the UI.

## Evaluation terms
The evaluation function blends middlegame and endgame values by phase. Scoring includes:
- **Material & PSTs:** phase-aware piece values and tuned tables.
- **King safety:** pawn shields, open file penalties, and attacker pressure.
- **Pawn structure:** passed, isolated, doubled, and backward pawn scoring plus pawn majorities.
- **Mobility & space:** pseudo-legal mobility counts, advanced pawns, and tempo bonus.
- **Endgame heuristics:** king activity, opposition, rook activity behind passed pawns, and minor-piece bonuses.

## Performance profiling workflow
1. Enable **Analysis mode** and observe nodes/NPS in the analysis panel.
2. Use the developer console panel to review TT hit rate, pruning counts, and ordering cuts.
3. Compare performance across depth settings to evaluate the impact of move ordering or evaluation changes.

## Testing
Run the Node test suite:
```bash
npm test
```

The tests include perft validation, tactical regression checks, evaluation heuristics, and worker cancellation behavior.
