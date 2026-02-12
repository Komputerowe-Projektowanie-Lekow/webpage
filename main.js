const CONFIG = {
  fps: 60,
  speed: 0.40,
  palette: "/\\.|",
  yScale: 5.0,
  lineAspect: 1.0,
  charPixelTarget: 6,
  minCols: 100,
  maxCols: 500,
  preloadAhead: 15
};

const NARRATIVE_SCENES = [
  {
    id: "scene-1",
    durationMs: 3200,
    kicker: "Scena 1/6",
    title: "Komorka pojedyncza",
    meta: "Waskie gardlo Gram-ujemnych: dobry score in-silico nie gwarantuje efektu komorkowego."
  },
  {
    id: "scene-2",
    durationMs: 3400,
    kicker: "Scena 2/6",
    title: "Retencja i wejscie do komorki",
    meta: "Stage 2: stage2a_output.csv + stage2b_output.csv jako filtr wejscia i retencji."
  },
  {
    id: "scene-3",
    durationMs: 3400,
    kicker: "Scena 3/6",
    title: "Target engagement przed struktura",
    meta: "stage3_for_boltz2.csv: top 200 kandydatow przed etapem strukturalnym."
  },
  {
    id: "scene-4",
    durationMs: 3400,
    kicker: "Scena 4/6",
    title: "Boltz2 i KD_pred",
    meta: "stage4_output.csv z KD_pred buduje ranking przed MD i etapami systemowymi."
  },
  {
    id: "scene-5",
    durationMs: 4200,
    kicker: "Scena 5/6",
    title: "MD i system",
    meta: "stage3_for_gromacs.csv (top 50) -> stage5_output.csv -> Stage 6A/6B."
  },
  {
    id: "scene-6",
    durationMs: 6200,
    holdStartMs: 2200,
    kicker: "Scena 6/6",
    title: "Wirtualna komorka",
    meta: "Stan 2026-02-10: EXP3 pilot15 (top_n=10) przeszedl Stage1->Stage6 + finalize.",
    note: "full10 po fixie Stage6B czeka na potwierdzenie rerunu."
  }
];

const NARRATIVE_TOTAL_MS = NARRATIVE_SCENES.reduce((sum, scene) => sum + scene.durationMs, 0);

const screen = document.getElementById("screen");
const screenGhost1 = document.getElementById("screen-ghost-1");
const screenGhost2 = document.getElementById("screen-ghost-2");
const wrap = document.querySelector(".ascii-layer");
const asciiLayer = document.querySelector(".ascii-layer");

const storyOverlay = document.getElementById("ascii-story-overlay");
const storyKicker = document.getElementById("ascii-story-kicker");
const storyTitle = document.getElementById("ascii-story-title");
const storyMeta = document.getElementById("ascii-story-meta");
const storyNote = document.getElementById("ascii-story-note");
const storyActions = document.getElementById("ascii-story-actions");

const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function setScreenFrame(text) {
  if (!screen && !screenGhost1 && !screenGhost2) {
    return;
  }
  if (screen) {
    screen.textContent = text;
    screen.setAttribute("data-ready", "true");
  }
  if (screenGhost1) {
    screenGhost1.textContent = text;
    screenGhost1.setAttribute("data-ready", "true");
  }
  if (screenGhost2) {
    screenGhost2.textContent = text;
    screenGhost2.setAttribute("data-ready", "true");
  }
}

function setStoryOverlay(sceneState) {
  if (!asciiLayer || !storyOverlay) {
    return;
  }

  if (!sceneState) {
    asciiLayer.setAttribute("data-scene", "none");
    asciiLayer.setAttribute("data-final-hold", "false");
    if (storyActions) {
      storyActions.setAttribute("aria-hidden", "true");
    }
    return;
  }

  asciiLayer.setAttribute("data-scene", sceneState.sceneId);
  asciiLayer.setAttribute("data-final-hold", sceneState.isFinalHold ? "true" : "false");

  if (storyKicker) {
    storyKicker.textContent = sceneState.kicker;
  }
  if (storyTitle) {
    storyTitle.textContent = sceneState.title;
  }
  if (storyMeta) {
    storyMeta.textContent = sceneState.meta;
  }
  if (storyNote) {
    storyNote.textContent = sceneState.note ?? "";
  }
  if (storyActions) {
    storyActions.setAttribute("aria-hidden", sceneState.isFinalHold ? "false" : "true");
  }
}

if (screen) {
  screen.setAttribute("data-ready", "false");
}
if (screenGhost1) {
  screenGhost1.setAttribute("data-ready", "false");
}
if (screenGhost2) {
  screenGhost2.setAttribute("data-ready", "false");
}
setStoryOverlay(null);

if (screen && wrap) {
  bootstrap().catch((error) => {
    console.error(error);
    setScreenFrame("Unable to load ASCII frames.");
  });
}

async function bootstrap() {
  let engine;

  if (shouldUseNarrativeEngine()) {
    try {
      engine = createNarrativeAsciiEngine(wrap);
    } catch (error) {
      console.error("Narrative ASCII init failed, using fallback engine:", error);
      engine = await createBitmapOrFallbackEngine();
      setStoryOverlay(null);
    }
  } else {
    engine = await createBitmapOrFallbackEngine();
  }

  setScreenFrame(engine.firstFrame);
  fitFont(engine);
  if (engine.preloadFrom) {
    engine.preloadFrom(0);
  }

  let running = false;
  let raf = null;
  let lastTick = performance.now();
  let frameIndex = 1;
  let paintToken = 0;
  const frameInterval = (1000 / (engine.fps ?? CONFIG.fps)) / CONFIG.speed;

  const renderFrame = (index) => {
    const token = ++paintToken;
    engine.ensureFrame(index).then((frame) => {
      if (token === paintToken) {
        setScreenFrame(frame);
        if (engine.preloadFrom) {
          engine.preloadFrom(index);
        }
      }
    }).catch((error) => console.error("Frame render failed:", error));
  };

  const showReducedFrame = () => {
    const index = engine.reducedFrameIndex ?? 0;
    paintToken++;
    engine.ensureFrame(index).then((frame) => {
      setScreenFrame(frame);
    }).catch(() => { });
  };

  const tick = (now) => {
    if (!running) {
      return;
    }
    if (now - lastTick >= frameInterval) {
      lastTick = now;
      renderFrame(frameIndex);
      frameIndex = (frameIndex + 1) % engine.frameCount;
    }
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) {
      return;
    }
    running = true;
    lastTick = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };

  const onResize = () => {
    if (engine.updateResolution) {
      engine.updateResolution(true);
    }
    fitFont(engine);
    paintToken++;
    const currentIndex = (frameIndex + engine.frameCount - 1) % engine.frameCount;
    engine.ensureFrame(currentIndex).then((frame) => {
      setScreenFrame(frame);
    }).catch(() => { });
  };

  prefersReducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      stop();
      showReducedFrame();
    } else {
      frameIndex = 1;
      paintToken++;
      renderFrame(0);
      start();
    }
  });

  addEventListener("resize", onResize, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else if (!prefersReducedMotion.matches) {
      start();
    }
  });

  if (prefersReducedMotion.matches) {
    showReducedFrame();
    return;
  }

  start();
}

function shouldUseNarrativeEngine() {
  return Boolean(storyOverlay && document.getElementById("kontekst-sekcji"));
}

async function createBitmapOrFallbackEngine() {
  const manifest = await loadManifest();
  if (manifest.length) {
    return createAsciiEngine(manifest, wrap);
  }

  const fallback = await loadFallbackFrames();
  if (!fallback) {
    setScreenFrame("Frames manifest not found.");
    throw new Error("No ASCII manifest/fallback frames available.");
  }
  return createPrecomputedEngine(fallback);
}

function createNarrativeAsciiEngine(asciiWrap) {
  const fps = 18;
  const frameCount = Math.max(1, Math.round((NARRATIVE_TOTAL_MS / 1000) * fps));
  const dims = {
    cols: 0,
    rows: 0,
    mobile: false,
    resKey: ""
  };

  const updateResolution = (force = false) => {
    const width = asciiWrap.clientWidth || window.innerWidth || 1;
    const height = asciiWrap.clientHeight || window.innerHeight || 1;
    const mobile = width <= 900;

    let cols;
    if (mobile) {
      cols = Math.floor(width / 7.2);
      cols = clamp(cols, 78, 128);
    } else {
      cols = Math.floor((width * 0.62) / 6.8);
      cols = clamp(cols, 92, 176);
    }

    let rows = Math.floor(height / (mobile ? 12 : 11));
    rows = clamp(rows, mobile ? 26 : 30, mobile ? 52 : 64);

    const key = `${cols}x${rows}|${mobile ? "m" : "d"}`;
    if (force || key !== dims.resKey) {
      dims.cols = cols;
      dims.rows = rows;
      dims.mobile = mobile;
      dims.resKey = key;
    }
  };

  const getSceneStateForFrame = (frameIndex) => {
    const normalizedIndex = ((frameIndex % frameCount) + frameCount) % frameCount;
    const timeMs = (normalizedIndex / fps) * 1000;
    return getNarrativeSceneState(timeMs);
  };

  updateResolution(true);
  const initialSceneState = getNarrativeSceneState(0);
  setStoryOverlay(initialSceneState);
  const firstFrame = renderNarrativeFrame(initialSceneState, dims, 0);

  return {
    fps,
    frameCount,
    firstFrame,
    isNarrative: true,
    reducedFrameIndex: Math.max(0, frameCount - 1),
    getDimensions() {
      return { cols: dims.cols, rows: dims.rows };
    },
    ensureFrame(index) {
      updateResolution(false);
      const normalizedIndex = ((index % frameCount) + frameCount) % frameCount;
      const timeMs = (normalizedIndex / fps) * 1000;
      const sceneState = getNarrativeSceneState(timeMs);
      setStoryOverlay(sceneState);
      const frame = renderNarrativeFrame(sceneState, dims, timeMs);
      return Promise.resolve(frame);
    },
    preloadFrom() { },
    updateResolution(force = false) {
      updateResolution(force);
    },
    getSceneStateForFrame
  };
}

function getNarrativeSceneState(timeMs) {
  const loopedTimeMs = ((timeMs % NARRATIVE_TOTAL_MS) + NARRATIVE_TOTAL_MS) % NARRATIVE_TOTAL_MS;
  let cursor = 0;

  for (let i = 0; i < NARRATIVE_SCENES.length; i++) {
    const scene = NARRATIVE_SCENES[i];
    const end = cursor + scene.durationMs;
    if (loopedTimeMs < end || i === NARRATIVE_SCENES.length - 1) {
      const sceneElapsedMs = loopedTimeMs - cursor;
      const sceneProgress = scene.durationMs > 0 ? sceneElapsedMs / scene.durationMs : 0;
      const holdStartMs = scene.holdStartMs ?? scene.durationMs + 1;
      return {
        sceneId: scene.id,
        sceneIndex: i,
        sceneElapsedMs,
        sceneProgress: clamp(sceneProgress, 0, 1),
        isFinalHold: scene.id === "scene-6" && sceneElapsedMs >= holdStartMs,
        kicker: scene.kicker,
        title: scene.title,
        meta: scene.meta,
        note: scene.note ?? ""
      };
    }
    cursor = end;
  }

  return {
    sceneId: "scene-1",
    sceneIndex: 0,
    sceneElapsedMs: 0,
    sceneProgress: 0,
    isFinalHold: false,
    kicker: NARRATIVE_SCENES[0].kicker,
    title: NARRATIVE_SCENES[0].title,
    meta: NARRATIVE_SCENES[0].meta,
    note: ""
  };
}

function renderNarrativeFrame(sceneState, dims, absoluteTimeMs) {
  const { cols, rows, mobile } = dims;
  const grid = createGrid(cols, rows, " ");

  drawAmbientLayer(grid, absoluteTimeMs);

  switch (sceneState.sceneId) {
    case "scene-1":
      drawSceneSingleCell(grid, sceneState, absoluteTimeMs);
      break;
    case "scene-2":
      drawSceneMembraneEntry(grid, sceneState, absoluteTimeMs);
      break;
    case "scene-3":
      drawSceneTargetGate(grid, sceneState, absoluteTimeMs);
      break;
    case "scene-4":
      drawSceneBoltzRanking(grid, sceneState, absoluteTimeMs);
      break;
    case "scene-5":
      drawSceneSystemBranch(grid, sceneState, absoluteTimeMs);
      break;
    case "scene-6":
      drawSceneVirtualCell(grid, sceneState, absoluteTimeMs);
      break;
    default:
      break;
  }

  drawPipelineLegend(grid, sceneState, mobile);
  drawProgressBar(grid, sceneState, mobile);

  return grid.map((row) => row.join("")).join("\n");
}

function drawAmbientLayer(grid, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const time = absoluteTimeMs * 0.001;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.12 + y * 0.09 + time * 0.85);
      const wave2 = Math.cos(x * 0.03 - y * 0.11 + time * 0.65);
      const signal = wave + wave2;
      if (signal > 1.93) {
        grid[y][x] = ".";
      } else if (signal < -1.96 && y % 3 === 0) {
        grid[y][x] = "'";
      }
    }
  }
}

function drawSceneSingleCell(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const pulse = Math.sin(absoluteTimeMs * 0.0032) * 0.8;
  const cx = Math.floor(cols * 0.25);
  const cy = Math.floor(rows * 0.5);
  const rx = Math.max(6, Math.floor(cols * 0.1 + pulse));
  const ry = Math.max(5, Math.floor(rows * 0.18 + pulse * 0.6));

  drawEllipseRing(grid, cx, cy, rx, ry, "@");
  drawEllipseRing(grid, cx, cy, Math.max(3, rx - 3), Math.max(3, ry - 2), "o");

  const nucleusRadius = Math.max(2, Math.floor(Math.min(rx, ry) * 0.35));
  for (let a = 0; a < 36; a++) {
    const theta = (Math.PI * 2 * a) / 36;
    setChar(
      grid,
      Math.round(cx + Math.cos(theta) * nucleusRadius),
      Math.round(cy + Math.sin(theta) * nucleusRadius),
      "*"
    );
  }

  drawArrow(grid, cx + rx + 3, cy, Math.floor(cols * 0.63), cy, "=");
  drawClampedText(grid, Math.floor(cols * 0.07), Math.floor(rows * 0.16), "[komorka pojedyncza]");
}

function drawSceneMembraneEntry(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cx = Math.floor(cols * 0.24);
  const cy = Math.floor(rows * 0.5);
  const rx = Math.max(6, Math.floor(cols * 0.09));
  const ry = Math.max(5, Math.floor(rows * 0.17));
  const gateX = Math.floor(cols * 0.48);

  drawEllipseRing(grid, cx, cy, rx, ry, "@");
  drawEllipseRing(grid, cx, cy, Math.max(3, rx - 3), Math.max(3, ry - 2), "o");

  for (let y = Math.floor(rows * 0.23); y <= Math.floor(rows * 0.77); y++) {
    setChar(grid, gateX, y, "|");
    if (y % 2 === 0) {
      setChar(grid, gateX + 1, y, "|");
    }
  }

  const particleSpan = Math.max(10, Math.floor(rows * 0.46));
  const travelSpan = Math.max(1, gateX - cx - rx - 6);
  for (let i = 0; i < 12; i++) {
    const offset = (absoluteTimeMs * 0.018 + i * 11) % travelSpan;
    const px = Math.floor(cx + rx + 2 + offset);
    const py = Math.floor(cy - particleSpan / 2 + ((i * 7) % particleSpan));
    setChar(grid, px, py, i % 3 === 0 ? "*" : ".");
  }

  drawArrow(grid, gateX + 3, cy, Math.floor(cols * 0.77), cy, "-");
  drawClampedText(grid, Math.floor(cols * 0.07), Math.floor(rows * 0.16), "[retencja i wejscie]");
}

function drawSceneTargetGate(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const leftX = Math.floor(cols * 0.2);
  const centerX = Math.floor(cols * 0.52);
  const cy = Math.floor(rows * 0.5);
  const gateWidth = Math.max(14, Math.floor(cols * 0.15));
  const gateHeight = Math.max(7, Math.floor(rows * 0.2));

  drawEllipseRing(grid, leftX, cy, Math.max(5, Math.floor(cols * 0.07)), Math.max(4, Math.floor(rows * 0.12)), "@");
  drawArrow(grid, leftX + Math.floor(cols * 0.08), cy, centerX - 6, cy, "=");

  drawBox(grid, centerX - Math.floor(gateWidth / 2), cy - Math.floor(gateHeight / 2), gateWidth, gateHeight, "#");
  drawClampedText(grid, centerX - Math.floor(gateWidth / 2) + 2, cy, "top 200");

  const wave = Math.sin(absoluteTimeMs * 0.005);
  drawArrow(grid, centerX + Math.floor(gateWidth / 2) + 2, cy, Math.floor(cols * 0.82), cy + Math.round(wave * 2), "-");
  drawClampedText(grid, Math.floor(cols * 0.06), Math.floor(rows * 0.16), "[target engagement]");
}

function drawSceneBoltzRanking(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const tableX = Math.floor(cols * 0.2);
  const tableY = Math.floor(rows * 0.24);
  const tableW = Math.max(16, Math.floor(cols * 0.2));
  const tableH = Math.max(10, Math.floor(rows * 0.42));
  const barsX = Math.floor(cols * 0.56);
  const barsBaseY = Math.floor(rows * 0.72);

  drawBox(grid, tableX, tableY, tableW, tableH, "#");
  drawClampedText(grid, tableX + 2, tableY + 2, "stage4_output.csv");
  drawClampedText(grid, tableX + 2, tableY + 4, "KD_pred rank");

  for (let i = 0; i < 7; i++) {
    const phase = absoluteTimeMs * 0.003 + i * 0.6;
    const h = 3 + Math.floor((Math.sin(phase) * 0.5 + 0.5) * 8);
    const x = barsX + i * 3;
    for (let y = 0; y < h; y++) {
      setChar(grid, x, barsBaseY - y, "|");
      setChar(grid, x + 1, barsBaseY - y, "|");
    }
    setChar(grid, x, barsBaseY + 1, "_");
    setChar(grid, x + 1, barsBaseY + 1, "_");
  }

  drawArrow(grid, tableX + tableW + 2, tableY + Math.floor(tableH * 0.55), barsX - 3, barsBaseY - 2, "=");
  drawClampedText(grid, Math.floor(cols * 0.08), Math.floor(rows * 0.16), "[boltz2 + KD_pred]");
}

function drawSceneSystemBranch(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const srcX = Math.floor(cols * 0.24);
  const srcY = Math.floor(rows * 0.5);
  const splitX = Math.floor(cols * 0.55);
  const topY = Math.floor(rows * 0.3);
  const botY = Math.floor(rows * 0.7);
  const pulse = Math.sin(absoluteTimeMs * 0.004);

  drawEllipseRing(grid, srcX, srcY, Math.max(5, Math.floor(cols * 0.08)), Math.max(5, Math.floor(rows * 0.14)), "@");
  drawArrow(grid, srcX + Math.floor(cols * 0.09), srcY, splitX, srcY, "=");
  drawLine(grid, splitX, srcY, splitX + 9, topY, "/");
  drawLine(grid, splitX, srcY, splitX + 9, botY, "\\");

  drawBox(grid, splitX + 11, topY - 3, 14, 7, "#");
  drawBox(grid, splitX + 11, botY - 3, 14, 7, "#");
  drawClampedText(grid, splitX + 14, topY, "6A");
  drawClampedText(grid, splitX + 14, botY, "6B");
  drawClampedText(grid, splitX + 3, srcY - 1, pulse > 0 ? "stage5" : "top 50");

  drawClampedText(grid, Math.floor(cols * 0.08), Math.floor(rows * 0.16), "[MD i system]");
}

function drawSceneVirtualCell(grid, sceneState, absoluteTimeMs) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cellX = Math.floor(cols * 0.62);
  const cellY = Math.floor(rows * 0.5);
  const cellW = Math.max(26, Math.floor(cols * 0.28));
  const cellH = Math.max(14, Math.floor(rows * 0.46));
  const leftX = Math.floor(cols * 0.18);
  const shimmer = Math.sin(absoluteTimeMs * 0.0028);

  drawClampedText(grid, Math.floor(cols * 0.08), Math.floor(rows * 0.17), "[wirtualna komorka]");
  drawArrow(grid, leftX, cellY, cellX - 4, cellY, "=");
  drawClampedText(grid, leftX - 3, cellY - 2, "pipeline");

  drawBox(grid, cellX, cellY - Math.floor(cellH / 2), cellW, cellH, "#");

  const nodeCount = 11;
  for (let i = 0; i < nodeCount; i++) {
    const nx = cellX + 2 + ((i * 5) % Math.max(4, cellW - 4));
    const ny = cellY - Math.floor(cellH / 2) + 2 + ((i * 3) % Math.max(4, cellH - 4));
    setChar(grid, nx, ny, i % 2 === 0 ? "*" : "+");
    if (i > 0) {
      const prevX = cellX + 2 + (((i - 1) * 5) % Math.max(4, cellW - 4));
      const prevY = cellY - Math.floor(cellH / 2) + 2 + (((i - 1) * 3) % Math.max(4, cellH - 4));
      drawLine(grid, prevX, prevY, nx, ny, shimmer > 0 ? "." : ":");
    }
  }

  if (sceneState.isFinalHold) {
    const bannerY = Math.floor(rows * 0.78);
    drawBox(grid, Math.floor(cols * 0.08), bannerY - 2, Math.floor(cols * 0.48), 6, "=");
    drawClampedText(grid, Math.floor(cols * 0.1), bannerY, "final hold: dolacz / kontakt");
  }
}

function drawPipelineLegend(grid, sceneState, mobile) {
  const rows = grid.length;
  const cols = grid[0].length;
  const legendY = rows - 4;
  const markerY = rows - 3;
  const legend = mobile
    ? "S1 -> S2a/S2b -> S3(200) -> S4(KD) -> S5(50) -> 6A/6B"
    : "REINVENT4 -> stage2a+2b -> stage3_for_boltz2(top200) -> stage4(KD_pred) -> stage5 -> 6A/6B";
  drawCenteredText(grid, legendY, legend);

  const markerX = Math.floor((sceneState.sceneIndex / (NARRATIVE_SCENES.length - 1)) * (cols - 1));
  setChar(grid, markerX, markerY, "^");
}

function drawProgressBar(grid, sceneState, mobile) {
  const rows = grid.length;
  const cols = grid[0].length;
  const barY = rows - 2;
  const maxWidth = Math.min(cols - 4, mobile ? 54 : 78);
  const left = Math.max(1, Math.floor((cols - maxWidth - 2) / 2));
  const progress = (sceneState.sceneIndex + sceneState.sceneProgress) / NARRATIVE_SCENES.length;
  const filled = Math.floor(maxWidth * progress);

  setChar(grid, left, barY, "[");
  for (let i = 0; i < maxWidth; i++) {
    setChar(grid, left + 1 + i, barY, i < filled ? "=" : ".");
  }
  setChar(grid, left + maxWidth + 1, barY, "]");
}

function createGrid(cols, rows, fill = " ") {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

function drawEllipseRing(grid, cx, cy, rx, ry, char) {
  const steps = Math.max(48, Math.round((rx + ry) * 8));
  for (let i = 0; i < steps; i++) {
    const theta = (Math.PI * 2 * i) / steps;
    const x = Math.round(cx + Math.cos(theta) * rx);
    const y = Math.round(cy + Math.sin(theta) * ry);
    setChar(grid, x, y, char);
  }
}

function drawBox(grid, x, y, w, h, borderChar) {
  if (w < 2 || h < 2) {
    return;
  }
  for (let i = 0; i < w; i++) {
    setChar(grid, x + i, y, borderChar);
    setChar(grid, x + i, y + h - 1, borderChar);
  }
  for (let j = 0; j < h; j++) {
    setChar(grid, x, y + j, borderChar);
    setChar(grid, x + w - 1, y + j, borderChar);
  }
}

function drawLine(grid, x1, y1, x2, y2, char) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x1 + dx * t);
    const y = Math.round(y1 + dy * t);
    setChar(grid, x, y, char);
  }
}

function drawArrow(grid, x1, y1, x2, y2, bodyChar) {
  drawLine(grid, x1, y1, x2, y2, bodyChar);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const arrowX = x2;
  const arrowY = y2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    setChar(grid, arrowX, arrowY, dx >= 0 ? ">" : "<");
  } else {
    setChar(grid, arrowX, arrowY, dy >= 0 ? "v" : "^");
  }
}

function drawCenteredText(grid, y, text) {
  const cols = grid[0].length;
  const x = Math.max(0, Math.floor((cols - text.length) / 2));
  drawClampedText(grid, x, y, text);
}

function drawClampedText(grid, x, y, text) {
  if (y < 0 || y >= grid.length) {
    return;
  }
  const cols = grid[0].length;
  if (x >= cols || x + text.length < 0) {
    return;
  }
  const start = Math.max(0, x);
  const textStart = Math.max(0, -x);
  const available = cols - start;
  const slice = text.slice(textStart, textStart + available);
  for (let i = 0; i < slice.length; i++) {
    setChar(grid, start + i, y, slice[i]);
  }
}

function setChar(grid, x, y, value) {
  if (y < 0 || y >= grid.length) {
    return;
  }
  if (x < 0 || x >= grid[0].length) {
    return;
  }
  grid[y][x] = value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function loadManifest() {
  try {
    const res = await fetch(new URL("./frames-manifest.json", import.meta.url));
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to fetch manifest:", error);
    return [];
  }
}

async function loadFallbackFrames() {
  try {
    const mod = await import("./frames.js");
    if (Array.isArray(mod.FRAMES) && mod.FRAMES.length) {
      return { frames: mod.FRAMES, fps: mod.FPS ?? CONFIG.fps };
    }
  } catch (error) {
    console.warn("No precomputed frames.js fallback found.", error);
  }
  return null;
}

async function loadBitmap(path) {
  const url = new URL(path, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load frame: ${url}`);
  }
  const blob = await response.blob();
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch (error) {
      console.warn("createImageBitmap failed; falling back to Image()", error);
    }
  }
  return blobToImage(blob);
}

async function createAsciiEngine(manifest, asciiWrap) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const asciiCache = new Map();
  const inflight = new Map();

  const state = {
    manifest,
    wrap: asciiWrap,
    cols: 0,
    rows: 0,
    resKey: "",
    aspect: 1,
    frameCount: manifest.length
  };

  const firstBitmap = await loadBitmap(manifest[0]);
  state.aspect = firstBitmap.height / firstBitmap.width;
  updateResolutionInternal(state, asciiWrap, asciiCache, inflight);
  const firstAscii = convertBitmapToAscii(firstBitmap, canvas, ctx, state);
  asciiCache.set(cacheKey(0, state), firstAscii);
  if (typeof firstBitmap.close === "function") {
    firstBitmap.close();
  }

  const ensureFrame = (index) => {
    updateResolutionInternal(state, asciiWrap, asciiCache, inflight);
    const key = cacheKey(index, state);
    if (asciiCache.has(key)) {
      return Promise.resolve(asciiCache.get(key));
    }
    if (inflight.has(key)) {
      return inflight.get(key);
    }

    const promise = loadBitmap(manifest[index])
      .then((bitmap) => {
        const ascii = convertBitmapToAscii(bitmap, canvas, ctx, state);
        if (typeof bitmap.close === "function") {
          bitmap.close();
        }
        const freshKey = cacheKey(index, state);
        asciiCache.set(freshKey, ascii);
        return ascii;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  };

  const preloadFrom = (index) => {
    for (let offset = 1; offset <= CONFIG.preloadAhead; offset++) {
      const next = (index + offset) % state.frameCount;
      ensureFrame(next).catch(() => { });
    }
  };

  return {
    ensureFrame,
    preloadFrom,
    updateResolution(force = false) {
      updateResolutionInternal(state, asciiWrap, asciiCache, inflight, force);
    },
    getDimensions() {
      return { cols: state.cols, rows: state.rows };
    },
    frameCount: state.frameCount,
    firstFrame: firstAscii,
    fps: CONFIG.fps
  };
}

function cacheKey(index, state) {
  return `${index}|${state.resKey}`;
}

function updateResolutionInternal(state, asciiWrap, cache, inflight, force = false) {
  const width = asciiWrap.clientWidth || 1;
  const height = asciiWrap.clientHeight || 1;

  let cols = Math.floor(width / CONFIG.charPixelTarget);
  cols = Math.max(CONFIG.minCols, Math.min(CONFIG.maxCols, cols));

  let rows = Math.floor(height / (CONFIG.charPixelTarget * CONFIG.lineAspect));
  rows = Math.max(rows, 24);

  const key = `${cols}x${rows}`;
  if (force || key !== state.resKey) {
    state.cols = cols;
    state.rows = rows;
    state.resKey = key;
    cache.clear();
    inflight.clear();
  }
}

function convertBitmapToAscii(bitmap, canvas, ctx, state) {
  const cols = state.cols;
  const rows = state.rows;

  canvas.width = cols;
  canvas.height = rows;
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(bitmap, 0, 0, cols, rows);

  const image = ctx.getImageData(0, 0, cols, rows).data;
  const lines = new Array(rows);
  const paletteSize = CONFIG.palette.length - 1;

  for (let row = 0; row < rows; row++) {
    let line = "";
    let offset = row * cols * 4;
    for (let x = 0; x < cols; x++) {
      const r = image[offset];
      const g = image[offset + 1];
      const b = image[offset + 2];
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const idx = Math.min(paletteSize, Math.round(luminance * paletteSize));
      line += CONFIG.palette[idx];
      offset += 4;
    }
    lines[row] = line;
  }

  return lines.join("\n");
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event?.error || new Error("Image load failed"));
    };
    img.src = url;
  });
}

function createPrecomputedEngine(fallback) {
  const frames = fallback.frames;
  const first = frames[0] || "";
  const rows = first.split("\n");
  const height = rows.length;
  const width = rows[0] ? rows[0].length : 0;

  return {
    fps: fallback.fps,
    frameCount: frames.length,
    firstFrame: first,
    getDimensions() {
      return { cols: width, rows: height };
    },
    ensureFrame(index) {
      return Promise.resolve(frames[index]);
    },
    preloadFrom() { },
    updateResolution() { }
  };
}

function fitFont(engine) {
  const dims = engine.getDimensions();
  const cols = dims.cols;
  const rows = dims.rows;
  if (!cols || !rows || !wrap) {
    return;
  }

  const width = screen?.clientWidth || wrap.clientWidth;
  const height = screen?.clientHeight || wrap.clientHeight;
  if (!width || !height) {
    return;
  }

  const pxByWidth = width / cols;
  const pxByHeight = height / (rows * CONFIG.lineAspect);
  const px = Math.ceil(Math.max(pxByWidth, pxByHeight) * 1.01);

  if (px > 0) {
    applyAsciiTypography(screen, px);
    applyAsciiTypography(screenGhost1, px);
    applyAsciiTypography(screenGhost2, px);
  }
}

function applyAsciiTypography(target, px) {
  if (!target) {
    return;
  }
  target.style.fontSize = `${px}px`;
  target.style.lineHeight = `${px * CONFIG.lineAspect}px`;
}
