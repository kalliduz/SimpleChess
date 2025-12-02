# SimpleChess

A zero-dependency chess playground that runs straight from GitHub Pages or a local file. It features a minimax AI with alpha-beta pruning, configurable thinking time, and a live preview of the best move sequence (principal variation).

## How to play
1. Open `index.html` in your browser (you can host it with GitHub Pages or use your local file system).
2. Choose the human color and AI thinking time, then click **New Game**.
3. Click a piece, then click a destination square. Legal targets are highlighted.
4. The AI responds using iterative deepening within your time budget and shows its preferred line in the preview panel.

## Features
- Human vs computer with a simple handcrafted evaluation and alpha-beta search
- Adjustable AI thinking time (milliseconds)
- Best-line preview updated after each AI search
- Castling, promotion, en-passant, and draw detection via the fifty-move rule
- No build tools or downloads required
