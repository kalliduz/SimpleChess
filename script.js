const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const newGameBtn = document.getElementById("new-game");
const permaAnalysisToggle = document.getElementById("perma-analysis");
const moveNowBtn = document.getElementById("move-now");
const analysisStatusEl = document.getElementById("analysis-status");
const difficultySelect = document.getElementById("difficulty");
const timeLimitSelect = document.getElementById("time-limit");
const togglePvBtn = document.getElementById("toggle-pv");
const statDepthEl = document.getElementById("stat-depth");
const statNodesEl = document.getElementById("stat-nodes");
const statNpsEl = document.getElementById("stat-nps");
const statEvalEl = document.getElementById("stat-eval");
const statTtEl = document.getElementById("stat-tt");
const statOrderingEl = document.getElementById("stat-ordering");
const statNullEl = document.getElementById("stat-null");
const statLmrEl = document.getElementById("stat-lmr");
const statLmpEl = document.getElementById("stat-lmp");
const statSeeEl = document.getElementById("stat-see");
const evalFillEl = document.getElementById("evaluation-fill");
const evalLabelEl = document.getElementById("evaluation-label");
const fenInput = document.getElementById("fen-input");
const loadFenBtn = document.getElementById("load-fen");
const copyFenBtn = document.getElementById("copy-fen");
const perftDepthInput = document.getElementById("perft-depth");
const runPerftBtn = document.getElementById("run-perft");
const perftOutputEl = document.getElementById("perft-output");
const moveListEl = document.getElementById("move-list");

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
let engineWorker = createEngineWorker();
let pvExpanded = true;
let lastEvalScore = 0;

function createEngineWorker() {
  const worker = new Worker("worker.js");
  worker.onmessage = ({ data }) => {
    const { type, token, lines, depth, stats, nodes } = data;
    const isSearchMessage = type === "update" || type === "done";
    if (isSearchMessage && token !== activeSearchToken) return;
    if (type === "update") {
      handleSearchUpdate(lines, depth, stats);
    } else if (type === "done") {
      handleSearchUpdate(lines, depth, stats);
      finalizeSearch();
    } else if (type === "perft") {
      perftOutputEl.textContent = `Perft depth ${depth}: ${nodes.toLocaleString()} nodes`;
    }
  };
  return worker;
}

function handleSearchUpdate(lines, depth, stats) {
  lastBestLines = lines || [];
  lastBestMove = lastBestLines[0]?.line?.[0] || null;
  lastDepth = depth;
  updatePreview(lastBestLines, depth, stats);
  analysisStatusEl.textContent = lastBestLines.length ? `Depth ${depth}` : "No principal variation available yet.";
  if (pendingAutoMove && lastBestMove) {
    stopSearch();
    applyEngineMove(lastBestMove);
  }
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
  const evalBefore = evaluateBoard(game);
  const madeMove = game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  if (!madeMove) return;
  annotateMove(madeMove, evalBefore);
  selected = null;
  legalMoves = [];
  renderBoard();
  stopSearch();
  resetAnalysisState();
  requestAnimationFrame(() => maybeAnalyze());
}

function applyEngineMove(move) {
  const evalBefore = evaluateBoard(game);
  const madeMove = game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  if (madeMove) {
    annotateMove(madeMove, evalBefore, true);
  }
  selected = null;
  legalMoves = [];
  renderBoard();
  pendingAutoMove = false;
  resetAnalysisState();
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
    engineWorker.terminate();
    engineWorker = createEngineWorker();
  }
  searching = false;
  activeSearchToken = null;
  pendingAutoMove = false;
  analysisStatusEl.textContent = "Idle";
}

function resetAnalysisState() {
  lastBestMove = null;
  lastBestLines = [];
  lastDepth = 0;
  statDepthEl.textContent = "0";
  statNodesEl.textContent = "0";
  statNpsEl.textContent = "0";
  statEvalEl.textContent = "0.00";
  updateEvaluationBar(0);
  analysisStatusEl.textContent = permaAnalysisToggle.checked ? "Analyzing..." : "Idle";
  previewEl.textContent = permaAnalysisToggle.checked
    ? "Analyzing..."
    : "Run the search to see its preferred line.";
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

function updateStats(stats, depth) {
  if (!stats) return;
  const totalNodes = stats.nodes + stats.qnodes;
  statDepthEl.textContent = depth ?? "0";
  statNodesEl.textContent = totalNodes.toLocaleString();
  statNpsEl.textContent = stats.nps?.toLocaleString() || "0";
  const evalScore = stats.eval ?? 0;
  statEvalEl.textContent = (evalScore / 100).toFixed(2);
  lastEvalScore = evalScore;
  updateEvaluationBar(evalScore);
  const hitRate = stats.ttHits ? Math.round((stats.ttHits / Math.max(1, stats.nodes)) * 100) : 0;
  statTtEl.textContent = `${hitRate}%`;
  statOrderingEl.textContent = stats.orderingCuts ?? 0;
  statNullEl.textContent = stats.nullPrunes ?? 0;
  statLmrEl.textContent = stats.lmrReductions ?? 0;
  statLmpEl.textContent = stats.lmpCuts ?? 0;
  statSeeEl.textContent = stats.seePrunes ?? 0;
}

function updatePreview(lines, depth, stats) {
  updateStats(stats, depth);
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
    if (!pvExpanded && idx > 0) return;
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

  analysisStatusEl.textContent = autoMove ? "Finding move..." : "Analyzing...";
  previewEl.textContent = "Searching...";

  engineWorker.postMessage({
    type: "search",
    token,
    fen: game.fen(),
    color: game.turn(),
    maxDepth: Number(difficultySelect.value) || 3,
    timeLimitMs: Number(timeLimitSelect.value) || 0,
  });
}

function updateEvaluationBar(score) {
  const clamped = Math.max(-800, Math.min(800, score));
  const percent = 50 + (clamped / 800) * 50;
  evalFillEl.style.height = `${percent}%`;
  evalLabelEl.textContent = (score / 100).toFixed(2);
}

function annotateMove(move, evalBefore, isEngine = false) {
  const evalAfter = evaluateBoard(game);
  const delta = evalAfter - evalBefore;
  const moverIsWhite = move.color === "w";
  const perspectiveDelta = moverIsWhite ? delta : -delta;
  let annotation = "";
  if (perspectiveDelta < -600) annotation = "??";
  else if (perspectiveDelta < -300) annotation = "?";
  else if (perspectiveDelta < -150) annotation = "?!";
  else if (perspectiveDelta > 150) annotation = "!";

  const moveNumber = Math.ceil(game.history().length / 2);
  const item = document.createElement("li");
  item.textContent = `${moveNumber}. ${move.san}${annotation} ${isEngine ? "(engine)" : ""}`.trim();
  if (annotation.includes("??")) item.classList.add("blunder");
  if (annotation.includes("?")) item.classList.add("mistake");
  if (annotation.includes("!")) item.classList.add("brilliant");
  moveListEl.appendChild(item);
  moveListEl.scrollTop = moveListEl.scrollHeight;
  updateEvaluationBar(lastEvalScore);
}

function resetMoveList() {
  moveListEl.innerHTML = "";
}

newGameBtn.addEventListener("click", () => {
  stopSearch();
  game.reset();
  selected = null;
  legalMoves = [];
  resetMoveList();
  resetAnalysisState();
  renderBoard();
  maybeAnalyze();
});

permaAnalysisToggle.addEventListener("change", () => {
  if (!permaAnalysisToggle.checked) {
    stopSearch();
  }
  maybeAnalyze();
});

difficultySelect.addEventListener("change", () => {
  if (permaAnalysisToggle.checked) {
    think({ autoMove: false });
  }
});

timeLimitSelect.addEventListener("change", () => {
  if (permaAnalysisToggle.checked) {
    think({ autoMove: false });
  }
});

togglePvBtn.addEventListener("click", () => {
  pvExpanded = !pvExpanded;
  updatePreview(lastBestLines, lastDepth);
});

loadFenBtn.addEventListener("click", () => {
  const fen = fenInput.value.trim();
  if (!fen) return;
  const loaded = game.load(fen);
  if (!loaded) {
    statusEl.textContent = "Invalid FEN";
    return;
  }
  stopSearch();
  selected = null;
  legalMoves = [];
  resetMoveList();
  resetAnalysisState();
  renderBoard();
  maybeAnalyze();
});

copyFenBtn.addEventListener("click", async () => {
  const fen = game.fen();
  fenInput.value = fen;
  try {
    await navigator.clipboard.writeText(fen);
    statusEl.textContent = "FEN copied to clipboard.";
  } catch (error) {
    statusEl.textContent = "FEN copied to the input field.";
  }
});

runPerftBtn.addEventListener("click", () => {
  const depth = Number(perftDepthInput.value) || 1;
  const token = `perft-${Date.now()}`;
  perftOutputEl.textContent = "Running perft...";
  engineWorker.postMessage({
    type: "perft",
    token,
    fen: game.fen(),
    perftDepth: depth,
  });
});

moveNowBtn.addEventListener("click", () => {
  const usePermaAnalysis = permaAnalysisToggle.checked;
  if (usePermaAnalysis) {
    if (lastBestMove) {
      if (searching) stopSearch();
      applyEngineMove(lastBestMove);
      return;
    }
    if (searching) {
      pendingAutoMove = true;
      analysisStatusEl.textContent = "Waiting for current best line...";
      return;
    }
    think({ autoMove: true });
    return;
  }

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
