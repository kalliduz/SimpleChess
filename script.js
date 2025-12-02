const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const thinkInput = document.getElementById("think-time");
const newGameBtn = document.getElementById("new-game");
const permaAnalysisToggle = document.getElementById("perma-analysis");
const moveNowBtn = document.getElementById("move-now");
const analysisStatusEl = document.getElementById("analysis-status");

const ChessEngine = typeof window.Chess === "function" ? window.Chess : window.Chess?.Chess;
if (!ChessEngine) {
  throw new Error("Chess library failed to load.");
}

const fileLabels = ["a", "b", "c", "d", "e", "f", "g", "h"];

let game = new ChessEngine();
let selected = null;
let legalMoves = [];
let searching = false;
let lastBestMove = null;
let lastBestLines = [];
let lastDepth = 0;
let pendingAutoMove = false;
let activeSearchToken = null;
let searchTokenCounter = 0;

const engineWorker = new Worker("worker.js");

engineWorker.onmessage = ({ data }) => {
  const { type, token, lines, depth } = data;
  if (token !== activeSearchToken) return;
  if (type === "update") {
    handleSearchUpdate(lines, depth);
  } else if (type === "done") {
    handleSearchUpdate(lines, depth);
    finalizeSearch();
  }
};

function handleSearchUpdate(lines, depth) {
  lastBestLines = lines || [];
  lastBestMove = lastBestLines[0]?.line?.[0] || null;
  lastDepth = depth;
  updatePreview(lastBestLines, depth);
  analysisStatusEl.textContent = lastBestLines.length ? `Depth ${depth}` : "No principal variation available yet.";
}

function createBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement("div");
      square.className = `square ${(r + c) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.r = r;
      square.dataset.c = c;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `${fileLabels[c]}${8 - r}`);
      square.addEventListener("click", () => onSquareClick(r, c));
      boardEl.appendChild(square);
    }
  }
}

function squareFromCoords(r, c) {
  return `${fileLabels[c]}${8 - r}`;
}

function getResult() {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (
    game.isStalemate() ||
    game.isDraw() ||
    game.isInsufficientMaterial() ||
    game.isThreefoldRepetition()
  ) {
    return "1/2-1/2";
  }
  return null;
}

function renderBoard() {
  const boardState = game.board();
  for (const square of boardEl.children) {
    square.textContent = "";
    square.classList.remove("selected", "legal", "capture");
    const r = Number(square.dataset.r);
    const c = Number(square.dataset.c);
    const piece = boardState[r][c];
    if (piece) {
      square.textContent = PIECES[piece.color][piece.type];
    }
  }
  statusEl.textContent = `Turn: ${game.turn() === "w" ? "White" : "Black"}`;
  const result = getResult();
  if (result) {
    statusEl.textContent = result === "1/2-1/2" ? "Draw" : `${result === "1-0" ? "White" : "Black"} wins`;
  }
}

function onSquareClick(r, c) {
  if (searching) stopSearch();
  const square = squareFromCoords(r, c);
  if (selected === square) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }
  if (selected) {
    const move = legalMoves.find((m) => m.to === square);
    if (move) {
      applyMove(move);
      return;
    }
  }
  const piece = game.get(square);
  if (piece && piece.color === game.turn()) {
    selected = square;
    legalMoves = game.moves({ square, verbose: true });
    highlightMoves();
  }
}

function applyMove(move) {
  const madeMove = game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  if (!madeMove) return;
  selected = null;
  legalMoves = [];
  renderBoard();
  previewEl.textContent = permaAnalysisToggle.checked
    ? "Analyzing..."
    : "Run the search to see its preferred line.";
  stopSearch();
  requestAnimationFrame(() => maybeAnalyze());
}

function highlightMoves() {
  renderBoard();
  if (!selected) return;
  for (const squareEl of boardEl.children) {
    const r = Number(squareEl.dataset.r);
    const c = Number(squareEl.dataset.c);
    const square = squareFromCoords(r, c);
    if (selected === square) squareEl.classList.add("selected");
    const move = legalMoves.find((m) => m.to === square);
    if (move) {
      squareEl.classList.add("legal");
      if (move.captured) squareEl.classList.add("capture");
    }
  }
}

function moveToAlgebra(move) {
  return `${move.from}-${move.to}${move.promotion ? "=Q" : ""}`;
}

function stopSearch() {
  if (searching && activeSearchToken !== null) {
    engineWorker.postMessage({ type: "cancel", token: activeSearchToken });
  }
  searching = false;
  activeSearchToken = null;
  pendingAutoMove = false;
  analysisStatusEl.textContent = "Idle";
}

function formatPV(line) {
  if (!line || !line.length) return "No principal variation available yet.";
  return line.map(moveToAlgebra).join(" → ");
}

function describeScore(score) {
  if (score === Infinity) return "Mate";
  if (score === -Infinity) return "-Mate";
  return (score / 100).toFixed(2);
}

function updatePreview(lines, depth) {
  if (!lines || !lines.length) {
    previewEl.textContent = "No principal variation available yet.";
    return;
  }
  const header = depth ? `Depth ${depth} best lines:` : "Principal variations:";
  previewEl.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "pv-header";
  const depthBadge = document.createElement("span");
  depthBadge.className = "pv-badge";
  depthBadge.textContent = depth ? `Depth ${depth}` : "Current lines";
  const summary = document.createElement("span");
  summary.className = "pv-summary";
  summary.textContent = `${lines.length} variation${lines.length === 1 ? "" : "s"}`;
  headerRow.append(depthBadge, summary);
  previewEl.appendChild(headerRow);

  const list = document.createElement("ol");
  list.className = "pv-list";

  lines.forEach((entry, idx) => {
    const item = document.createElement("li");
    item.className = "pv-line";
    const header = document.createElement("div");
    header.className = "pv-line-header";

    const score = document.createElement("span");
    score.className = "pv-score";
    score.textContent = describeScore(entry.displayScore);

    const label = document.createElement("span");
    label.className = "pv-label";
    label.textContent = `Line ${idx + 1}`;

    header.append(label, score);

    const moves = document.createElement("div");
    moves.className = "pv-moves";
    moves.textContent = formatPV(entry.line);

    item.append(header, moves);
    list.appendChild(item);
  });

  previewEl.appendChild(list);
}

function finalizeSearch() {
  searching = false;
  activeSearchToken = null;
  analysisStatusEl.textContent = pendingAutoMove ? "Move ready" : "Analysis ready";
  if (pendingAutoMove) {
    if (!lastBestMove) {
      const fallback = game.moves({ verbose: true })[0];
      if (fallback) {
        lastBestMove = fallback;
        lastBestLines = [{ line: [fallback], displayScore: 0 }];
        lastDepth = 1;
        updatePreview(lastBestLines, lastDepth);
      }
    }
    if (lastBestMove) {
      applyEngineMove(lastBestMove);
    }
  }
  pendingAutoMove = false;
  const shouldContinueAnalysis = permaAnalysisToggle.checked && !getResult();
  if (shouldContinueAnalysis && !searching) {
    requestAnimationFrame(() => think({ autoMove: false }));
  }
}

function think({ autoMove = false } = {}) {
  stopSearch();
  const token = ++searchTokenCounter;
  activeSearchToken = token;
  searching = true;
  pendingAutoMove = autoMove;
  lastBestMove = null;
  lastBestLines = [];
  lastDepth = 0;

  const timeMs = Math.max(100, Number(thinkInput.value) || 1500);
  analysisStatusEl.textContent = autoMove ? "Finding move..." : "Analyzing...";
  previewEl.textContent = "Searching...";

  engineWorker.postMessage({
    type: "search",
    token,
    fen: game.fen(),
    timeMs,
    color: game.turn(),
  });
}

function applyEngineMove(move) {
  game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  selected = null;
  legalMoves = [];
  renderBoard();
  pendingAutoMove = false;
  requestAnimationFrame(() => maybeAnalyze());
}

newGameBtn.addEventListener("click", () => {
  stopSearch();
  game.reset();
  selected = null;
  legalMoves = [];
  previewEl.textContent = "Run the AI to see its preferred line.";
  lastBestMove = null;
  lastBestLines = [];
  renderBoard();
  maybeAnalyze();
});

permaAnalysisToggle.addEventListener("change", () => {
  if (!permaAnalysisToggle.checked) {
    stopSearch();
  }
  maybeAnalyze();
});

moveNowBtn.addEventListener("click", () => {
  if (lastBestMove) {
    if (searching) stopSearch();
    applyEngineMove(lastBestMove);
    return;
  }
  if (searching) {
    pendingAutoMove = true;
    analysisStatusEl.textContent = "Finishing search...";
    return;
  }
  think({ autoMove: true });
});

createBoard();
renderBoard();
maybeAnalyze();

function maybeAnalyze() {
  const result = getResult();
  if (result) {
    statusEl.textContent = result === "1/2-1/2" ? "Draw" : `${result === "1-0" ? "White" : "Black"} wins`;
    stopSearch();
    return;
  }
  if (permaAnalysisToggle.checked && !searching) {
    requestAnimationFrame(() => think({ autoMove: false }));
  }
}
