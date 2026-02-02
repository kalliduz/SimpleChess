# Contributing to SimpleChess

Thanks for helping improve SimpleChess! This project is intentionally lightweight, so contributions should keep the code readable and avoid adding heavy dependencies.

## Development workflow
1. Make changes in a feature branch.
2. Run `npm test` to validate perft counts, search regression checks, and evaluation heuristics.
3. Open `index.html` locally to verify UI changes.

## Code style
- Keep the engine and UI logic readable and documented with clear helper names.
- Prefer pure functions for evaluation helpers where possible.
- Avoid try/catch around imports.

## Adding engine features
- Update search stats if you add new pruning or ordering logic.
- Extend tests with a tactical or endgame scenario that exercises your change.
- Update the README if the feature affects the architecture or evaluation descriptions.
