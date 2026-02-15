const CONFIG = {
  fps: 60,
  speed: 0.6,
  palette: "/\\.|",
  lineAspect: 1.0,
  charPixelTarget: 6.4,
  minCols: 96,
  maxCols: 500,
  preloadAhead: 15,
  proteinTransitionFrames: 24,
  proteinSecondManifestCandidates: ["./frames-manifest_2.json", "./frames-manifest_2.json5"],
  proteinMorphStyle: "dither",
  protein2Ascii: {
    palette: "@%#*+=-:. ",
    normalizeLuma: true,
    contrast: 1.35,
    gamma: 0.86
  }
};

const NARRATIVE_SCENES = [
  { id: "scene-1", durationMs: 1800, kicker: "Stage 1/6", title: "Generowanie (REINVENT4)", meta: "De-novo generowanie kandydatow: losowe fragmenty skladaja sie w ciagi SMILES." },
  { id: "scene-2", durationMs: 1700, kicker: "Stage 2/6", title: "Filtrowanie (Analiza + Retencja)", meta: "Stage 2a+2b: filtr wejscia do komorki i retencji. Setki -> dziesiatki." },
  { id: "scene-3", durationMs: 1700, kicker: "Stage 3/6", title: "Target Engagement (Cell TE)", meta: "Docking ligand-target: top 200 kandydatow przechodzi do etapu strukturalnego." },
  { id: "scene-4", durationMs: 1700, kicker: "Stage 4/6", title: "Struktura (Boltz2)", meta: "Predykcja struktury bialka i KD_pred. Ranking przed MD." },
  { id: "scene-5", durationMs: 2100, kicker: "Stage 5/6", title: "Dynamika (GROMACS MD)", meta: "Symulacja dynamiki molekularnej: top 50 kandydatow w pelnym ukladzie wodnym." },
  { id: "scene-6", durationMs: 4200, holdStartMs: 1500, kicker: "Stage 6/6", title: "Siec metaboliczna (iML1515)", meta: "Stage 6A/6B: integracja z modelem metabolicznym E. coli. FBA + essentiality.", note: "Wirtualna komorka: od kandydata do efektu systemowego." }
];
const NARRATIVE_TOTAL_MS = NARRATIVE_SCENES.reduce((s, x) => s + x.durationMs, 0);

const body = document.body;
const heroSection = document.getElementById("kontekst-sekcji");
const statusSection = document.getElementById("status");
const supportSection = document.getElementById("support");

const proteinLayer = document.getElementById("protein-ascii-layer");
const narrativeLayer = document.getElementById("narrative-ascii-layer");

const proteinScreens = mkScreens("protein-screen", "protein-screen-ghost-1", "protein-screen-ghost-2");
const narrativeScreens = mkScreens("narrative-screen", "narrative-screen-ghost-1", "narrative-screen-ghost-2");

const storyOverlay = document.getElementById("ascii-story-overlay");
const storyKicker = document.getElementById("ascii-story-kicker");
const storyTitle = document.getElementById("ascii-story-title");
const storyMeta = document.getElementById("ascii-story-meta");
const storyNote = document.getElementById("ascii-story-note");
const storyActions = document.getElementById("ascii-story-actions");

const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let heroVisible = false;
let heroObserver = null;
let activityRaf = null;
let narrativeRippleRaf = null;
let narrativeRippleRunning = false;
let maxNarrativeProgress = 0;
let proteinController = null;
let narrativeController = null;

bootstrap().catch((err) => console.error("ASCII bootstrap failed:", err));

function mkScreens(mainId, g1Id, g2Id) {
  return { main: document.getElementById(mainId), ghost1: document.getElementById(g1Id), ghost2: document.getElementById(g2Id) };
}

async function bootstrap() {
  resetScreens(proteinScreens);
  resetScreens(narrativeScreens);
  setNarrativeOverlay(null);
  setBodyActivity(false, false);

  proteinController = createController({
    layerEl: proteinLayer,
    screens: proteinScreens,
    initEngine: initProteinEngine,
    staticIndex: () => 0
  });
  narrativeController = createController({
    layerEl: narrativeLayer,
    screens: narrativeScreens,
    initEngine: initNarrativeEngine,
    staticIndex: (engine) => engine?.reducedFrameIndex ?? Math.max(0, (engine?.frameCount ?? 1) - 1)
  });

  await Promise.all([proteinController.init(), narrativeController.init()]);
  setupHeroObserver();

  addEventListener("scroll", scheduleActivityCheck, { passive: true });
  addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", scheduleActivityCheck);
  prefersReducedMotion.addEventListener("change", () => {
    proteinController.onMotion();
    narrativeController.onMotion();
    scheduleActivityCheck();
  });
  scheduleActivityCheck();
}

function createController({ layerEl, screens, initEngine, staticIndex }) {
  let engine = null;
  let active = false;
  let running = false;
  let inited = false;
  let frameIndex = 1;
  let lastTick = performance.now();
  let raf = null;
  let paintToken = 0;

  function setFrame(text) {
    [screens.main, screens.ghost1, screens.ghost2].forEach((el) => {
      if (el) {
        el.textContent = text;
        el.setAttribute("data-ready", "true");
      }
    });
  }

  function render(index) {
    if (!engine) return;
    const token = ++paintToken;
    engine.ensureFrame(index).then((frame) => {
      if (token !== paintToken) return;
      setFrame(frame);
      if (engine.preloadFrom) engine.preloadFrom(index);
    }).catch((e) => console.error("Frame render failed:", e));
  }

  function showStatic() {
    if (!engine) return;
    const index = staticIndex(engine);
    paintToken++;
    engine.ensureFrame(index).then((frame) => setFrame(frame)).catch(() => { });
  }

  function tick(now) {
    if (!running || !engine) return;
    const interval = (1000 / (engine.fps ?? CONFIG.fps)) / CONFIG.speed;
    if (now - lastTick >= interval) {
      lastTick = now;
      render(frameIndex);
      frameIndex = (frameIndex + 1) % engine.frameCount;
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (!engine || running) return;
    if (prefersReducedMotion.matches) {
      showStatic();
      return;
    }
    running = true;
    lastTick = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function fit() {
    if (!engine || !layerEl || !screens.main) return;
    const dims = engine.getDimensions();
    if (!dims.cols || !dims.rows) return;
    const w = screens.main.clientWidth || layerEl.clientWidth;
    const h = screens.main.clientHeight || layerEl.clientHeight;
    if (!w || !h) return;
    const px = Math.ceil(Math.max(w / dims.cols, h / (dims.rows * CONFIG.lineAspect)) * 1.01);
    [screens.main, screens.ghost1, screens.ghost2].forEach((el) => {
      if (el && px > 0) {
        el.style.fontSize = `${px}px`;
        el.style.lineHeight = `${px * CONFIG.lineAspect}px`;
      }
    });
  }

  return {
    async init() {
      try {
        engine = await initEngine();
        setFrame(engine.firstFrame);
        if (engine.preloadFrom) engine.preloadFrom(0);
        fit();
        inited = true;
      } catch (e) {
        inited = false;
        console.error("Controller init failed:", e);
      }
    },
    setActive(next) {
      active = next;
      if (!inited || !engine) return;
      if (active) start();
      else stop();
    },
    onResize() {
      if (!inited || !engine) return;
      const resolutionChanged = engine.updateResolution ? engine.updateResolution(false) : true;
      fit();
      if (!resolutionChanged) return;
      paintToken++;
      const idx = (frameIndex + engine.frameCount - 1) % engine.frameCount;
      engine.ensureFrame(idx).then((frame) => setFrame(frame)).catch(() => { });
    },
    onMotion() {
      if (!inited || !engine || !active) return;
      if (prefersReducedMotion.matches) {
        stop();
        showStatic();
      } else {
        start();
      }
    }
  };
}

function resetScreens(screens) {
  [screens.main, screens.ghost1, screens.ghost2].forEach((el) => {
    if (el) el.setAttribute("data-ready", "false");
  });
}

function setupHeroObserver() {
  if (!heroSection) return;
  if ("IntersectionObserver" in window) {
    heroObserver = new IntersectionObserver((entries) => {
      heroVisible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.05);
      scheduleActivityCheck();
    }, { threshold: [0, 0.05, 0.15, 0.35, 0.6] });
    heroObserver.observe(heroSection);
  } else {
    const rect = heroSection.getBoundingClientRect();
    heroVisible = rect.bottom > 0 && rect.top < innerHeight;
  }
}

function scheduleActivityCheck() {
  if (activityRaf !== null) return;
  activityRaf = requestAnimationFrame(() => {
    activityRaf = null;
    if (!heroObserver && heroSection) {
      const rect = heroSection.getBoundingClientRect();
      heroVisible = rect.bottom > 0 && rect.top < innerHeight;
    }
    applyActivity();
  });
}

function onResize() {
  proteinController?.onResize();
  narrativeController?.onResize();
  scheduleActivityCheck();
}

function applyActivity() {
  const visible = !document.hidden;
  const proteinActive = visible && heroVisible;
  const narrativeActive = visible && computeNarrativeActive();
  setBodyActivity(proteinActive, narrativeActive);
  proteinController?.setActive(proteinActive);
  narrativeController?.setActive(narrativeActive);
  setNarrativeRippleRunning(narrativeActive);
}

function computeNarrativeActive() {
  if (innerWidth <= 900 || !statusSection || !supportSection) return false;
  const anchorY = scrollY + innerHeight * 0.35;
  const statusTop = statusSection.offsetTop;
  const supportTop = supportSection.offsetTop;
  return anchorY >= statusTop && anchorY < supportTop;
}

function computeNarrativeRangeProgress() {
  if (!statusSection || !supportSection) return 0;
  const anchorY = scrollY + innerHeight * 0.35;
  const start = statusSection.offsetTop;
  const end = supportSection.offsetTop;
  const span = Math.max(1, end - start);
  return clamp((anchorY - start) / span, 0, 1);
}

function setNarrativeRippleRunning(next) {
  narrativeRippleRunning = Boolean(next && narrativeLayer && innerWidth > 900 && !prefersReducedMotion.matches);
  if (!narrativeRippleRunning) {
    if (narrativeRippleRaf !== null) {
      cancelAnimationFrame(narrativeRippleRaf);
      narrativeRippleRaf = null;
    }
    if (narrativeLayer) narrativeLayer.setAttribute("data-ripple-active", "false");
    return;
  }
  if (narrativeRippleRaf === null) {
    narrativeRippleRaf = requestAnimationFrame(tickNarrativeRipple);
  }
}

function tickNarrativeRipple(now) {
  narrativeRippleRaf = null;
  if (!narrativeRippleRunning || !narrativeLayer) return;

  const progress = computeNarrativeRangeProgress();
  const t = now * 0.001;
  const halfWidth = Math.max(1, Math.floor(innerWidth * 0.5));

  // Wave origin at center, rings emanate outward like water ripples
  const originPx = halfWidth;

  // Phase cycles 0→200px seamlessly — wider rings, more spacing
  const ringSpacing = 200; // px between rings
  const speed = 15; // px/s outward
  const phase = (t * speed) % ringSpacing;

  // Subtle but visible wave opacity
  const waveOpacity = clamp(0.08 + progress * 0.06, 0.07, 0.16);

  narrativeLayer.style.setProperty("--narrative-wave-origin-px", `${originPx.toFixed(2)}px`);
  narrativeLayer.style.setProperty("--narrative-wave-phase", `${phase.toFixed(2)}px`);
  narrativeLayer.style.setProperty("--narrative-wave-opacity", waveOpacity.toFixed(4));
  narrativeLayer.setAttribute("data-ripple-active", "true");

  narrativeRippleRaf = requestAnimationFrame(tickNarrativeRipple);
}

function setBodyActivity(proteinActive, narrativeActive) {
  if (!body) return;
  body.setAttribute("data-protein-active", proteinActive ? "true" : "false");
  body.setAttribute("data-narrative-active", narrativeActive ? "true" : "false");
}

async function initProteinEngine() {
  if (!proteinLayer) throw new Error("protein layer missing");
  const manifest1 = await loadManifest();
  const manifest2 = await loadManifestCandidates(CONFIG.proteinSecondManifestCandidates);
  if (manifest1.length && manifest2.length) {
    return createProteinLoopEngine({
      manifest1,
      manifest2,
      layerEl: proteinLayer,
      transitionFrames: CONFIG.proteinTransitionFrames,
      morphStyle: CONFIG.proteinMorphStyle
    });
  }
  if (manifest1.length) return createBitmapEngine(manifest1, proteinLayer);
  const fallback = await loadFallbackFrames();
  if (!fallback) throw new Error("no protein frames available");
  return createPrecomputedEngine(fallback);
}

async function initNarrativeEngine() {
  if (!narrativeLayer) throw new Error("narrative layer missing");
  return createNarrativeEngine(narrativeLayer);
}

function setNarrativeOverlay(sceneState) {
  if (!narrativeLayer || !storyOverlay) return;
  storyOverlay.hidden = true;
  storyOverlay.setAttribute("aria-hidden", "true");
  if (!sceneState) {
    narrativeLayer.setAttribute("data-scene", "none");
    narrativeLayer.setAttribute("data-final-hold", "false");
    if (storyActions) storyActions.setAttribute("aria-hidden", "true");
    return;
  }
  narrativeLayer.setAttribute("data-scene", sceneState.sceneId);
  narrativeLayer.setAttribute("data-final-hold", sceneState.isFinalHold ? "true" : "false");
  if (storyKicker) storyKicker.textContent = sceneState.kicker;
  if (storyTitle) storyTitle.textContent = sceneState.title;
  if (storyMeta) storyMeta.textContent = sceneState.meta;
  if (storyNote) storyNote.textContent = sceneState.note ?? "";
  if (storyActions) storyActions.setAttribute("aria-hidden", "true");
}

function createNarrativeEngine(layerEl) {
  const fps = 48;
  const frameCount = Math.max(1, Math.round((NARRATIVE_TOTAL_MS / 1000) * fps));
  const dims = { cols: 0, rows: 0, mobile: false, key: "" };

  function updateResolution(force = false) {
    const w = layerEl.clientWidth || innerWidth || 1;
    const h = layerEl.clientHeight || innerHeight || 1;
    const mobile = w <= 900;
    const denseDesktop = w >= 1500;
    const cols = clamp(
      Math.floor(w / (mobile ? 7.6 : denseDesktop ? 6.9 : 7.6)),
      mobile ? 72 : 74,
      mobile ? 122 : 150
    );
    const rows = clamp(
      Math.floor(h / (mobile ? 12.4 : denseDesktop ? 11.4 : 12.2)),
      mobile ? 24 : 26,
      mobile ? 48 : 58
    );
    const key = `${cols}x${rows}|${mobile ? "m" : "d"}`;
    const changed = force || key !== dims.key;
    if (!changed) return false;
    dims.cols = cols;
    dims.rows = rows;
    dims.mobile = mobile;
    dims.key = key;
    return true;
  }

  updateResolution(true);
  const firstScene = getNarrativeSceneState(0);
  setNarrativeOverlay(firstScene);
  const firstFrame = renderNarrativeFrame(firstScene, dims, 0);

  return {
    fps,
    frameCount,
    firstFrame,
    reducedFrameIndex: Math.max(0, frameCount - 1),
    getDimensions: () => ({ cols: dims.cols, rows: dims.rows }),
    ensureFrame(index) {
      updateResolution(false);
      const normalized = ((index % frameCount) + frameCount) % frameCount;
      const t = (normalized / fps) * 1000;
      const scene = getNarrativeSceneState(t);
      setNarrativeOverlay(scene);
      return Promise.resolve(renderNarrativeFrame(scene, dims, t));
    },
    preloadFrom() { },
    updateResolution(force = false) { return updateResolution(force); }
  };
}

function getNarrativeSceneState(timeMs) {
  const t = ((timeMs % NARRATIVE_TOTAL_MS) + NARRATIVE_TOTAL_MS) % NARRATIVE_TOTAL_MS;
  let cursor = 0;
  for (let i = 0; i < NARRATIVE_SCENES.length; i++) {
    const s = NARRATIVE_SCENES[i];
    const end = cursor + s.durationMs;
    if (t < end || i === NARRATIVE_SCENES.length - 1) {
      const elapsed = t - cursor;
      return {
        sceneId: s.id,
        sceneIndex: i,
        sceneProgress: clamp(elapsed / s.durationMs, 0, 1),
        isFinalHold: s.id === "scene-6" && elapsed >= (s.holdStartMs ?? s.durationMs + 1),
        kicker: s.kicker,
        title: s.title,
        meta: s.meta,
        note: s.note ?? ""
      };
    }
    cursor = end;
  }
  return { sceneId: "scene-1", sceneIndex: 0, sceneProgress: 0, isFinalHold: false, kicker: "", title: "", meta: "", note: "" };
}

function renderNarrativeFrame(scene, dims, t) {
  const cols = dims.cols;
  const rows = dims.rows;
  const lines = Array.from({ length: rows }, () => Array(cols).fill(" "));
  // Subtle background noise — sparser than before
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const s = Math.sin(x * 0.14 + y * 0.08 + t * 0.0006) + Math.cos(x * 0.025 - y * 0.12 + t * 0.0005);
      if (s > 1.96) lines[y][x] = ".";
    }
  }
  const labelMap = {
    "scene-1": "[REINVENT4 : generowanie]",
    "scene-2": "[filtrowanie : retencja]",
    "scene-3": "[target engagement]",
    "scene-4": "[Boltz2 : struktura]",
    "scene-5": "[GROMACS : dynamika MD]",
    "scene-6": "[siec metaboliczna]"
  };
  const compactLabelMap = {
    "scene-1": "[REINVENT4]",
    "scene-2": "[filtr]",
    "scene-3": "[docking]",
    "scene-4": "[Boltz2]",
    "scene-5": "[GROMACS]",
    "scene-6": "[iML1515]"
  };
  const label = cols < 110 ? (compactLabelMap[scene.sceneId] ?? "") : (labelMap[scene.sceneId] ?? "");
  const pipelineLine = cols < 100
    ? "GEN>FILT>DOCK>STRUCT>MD>METAB"
    : cols < 126
      ? "REINVENT4->Filter(2a+2b)->TE(200)->Boltz2(KD)->GROMACS(50)->6A/6B"
      : "REINVENT4->S2a+S2b(Filter)->S3(TE,top200)->S4(Boltz2,KD)->S5(GROMACS,top50)->S6(iML1515)";
  writeText(lines, Math.floor(cols * 0.06), Math.floor(rows * 0.12), label);
  writeText(lines, Math.floor(cols * 0.06), rows - 4, pipelineLine);
  drawSceneShape(lines, scene.sceneId, t, scene.sceneProgress);
  drawProgress(lines, scene.sceneIndex, scene.sceneProgress);
  return lines.map((r) => r.join("")).join("\n");
}

function drawSceneShape(lines, sceneId, t, progress) {
  if (sceneId === "scene-1") drawGeneration(lines, t, progress);
  else if (sceneId === "scene-2") drawFunnel(lines, t, progress);
  else if (sceneId === "scene-3") drawDocking(lines, t, progress);
  else if (sceneId === "scene-4") drawFolding(lines, t, progress);
  else if (sceneId === "scene-5") drawDynamics(lines, t, progress);
  else if (sceneId === "scene-6") drawNetwork(lines, t, progress);
}

// Scene 1 — REINVENT4: random chars coalescing into SMILES fragments
function drawGeneration(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const cy = Math.floor(rows * 0.5);
  const noise = "$#@!%^&*~+=<>?;:";
  const smiles = ["C", "C", "(", "O", ")", "C", "=", "O", "N", "c", "1", "c", "c", "c", "c", "1"];

  // Phase: scattered random chars converge toward center and form SMILES
  const phase = clamp(progress, 0, 1);
  const scatter = Math.floor((compact ? 18 : 30) * (1 - phase * 0.7));
  const randSeed = Math.floor(t * 0.01);

  // Floating random chemical chars
  for (let i = 0; i < (compact ? 35 : 60); i++) {
    const hash = ((i * 2654435761 + randSeed) >>> 0) % 65536;
    const dx = ((hash % (scatter * 2 + 1)) - scatter);
    const dy = (((hash >> 8) % (scatter * 2 + 1)) - scatter) >> 1;
    const x = clamp(cx + dx, 1, cols - 2);
    const y = clamp(cy + dy, 1, rows - 3);
    const ch = noise[(hash >> 4) % noise.length];
    if (y >= 0 && y < rows && x >= 0 && x < cols) lines[y][x] = ch;
  }

  // SMILES string assembling in the center as progress increases
  const visible = Math.floor(smiles.length * phase);
  const startX = cx - Math.floor(visible / 2);
  for (let i = 0; i < visible; i++) {
    const x = startX + i;
    const y = cy;
    if (y >= 0 && y < rows && x >= 0 && x < cols) lines[y][x] = smiles[i];
  }

  // Label below the forming molecule
  if (phase > 0.3) {
    writeText(lines, cx - 5, cy + 3, compact ? "SMILES" : "de novo SMILES");
  }
}

// Scene 2 — Filtering: funnel narrowing with molecules passing through
function drawFunnel(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const topY = Math.floor(rows * 0.2);
  const botY = Math.floor(rows * 0.78);
  const midY = Math.floor(rows * 0.52);

  // Draw funnel shape — wide top, narrow bottom
  const topHalf = compact ? 14 : 22;
  const botHalf = compact ? 3 : 5;
  for (let y = topY; y <= botY; y++) {
    const frac = clamp((y - topY) / Math.max(1, botY - topY), 0, 1);
    const half = Math.round(topHalf * (1 - frac) + botHalf * frac);
    const lx = clamp(cx - half, 0, cols - 1);
    const rx = clamp(cx + half, 0, cols - 1);
    if (lx >= 0 && lx < cols) lines[y][lx] = "|";
    if (rx >= 0 && rx < cols) lines[y][rx] = "|";
  }
  // Top rim
  for (let x = cx - topHalf; x <= cx + topHalf; x++) {
    if (x >= 0 && x < cols && topY >= 0 && topY < rows) lines[topY][x] = "_";
  }

  // Molecules entering (o) and being filtered (x) or passing (*)
  const tick = Math.floor(t * 0.008);
  const symbols = "oooo*ooxooo*oxo";
  for (let i = 0; i < (compact ? 6 : 10); i++) {
    const hash = ((i * 1597 + tick) >>> 0) % 256;
    const yOff = (hash % Math.max(1, botY - topY - 4));
    const py = topY + 2 + yOff;
    const frac = clamp((py - topY) / Math.max(1, botY - topY), 0, 1);
    const half = Math.round(topHalf * (1 - frac) + botHalf * frac) - 1;
    const px = cx + ((hash >> 4) % Math.max(1, half * 2 + 1)) - half;
    const ch = symbols[(i + tick) % symbols.length];
    if (py >= 0 && py < rows && px >= 0 && px < cols) lines[py][px] = ch;
  }

  // Arrow out the bottom
  const outY = Math.min(rows - 5, botY + 1);
  if (outY >= 0 && outY < rows && cx >= 0 && cx < cols) lines[outY][cx] = "V";
  writeText(lines, cx - (compact ? 3 : 6), outY + 1, compact ? "top N" : "filtered output");
}

// Scene 3 — Target Engagement: docking brackets closing on a target
function drawDocking(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const cy = Math.floor(rows * 0.48);

  // Target (receptor) — small structure in center
  const targetR = compact ? 4 : 6;
  ellipse(lines, cx, cy, targetR, Math.max(2, Math.floor(targetR * 0.6)), "O");
  if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) lines[cy][cx] = "*";
  writeText(lines, cx - 3, cy, "target");

  // Ligand brackets approaching from left and right
  const maxGap = compact ? 16 : 24;
  const gap = Math.max(1, Math.floor(maxGap * (1 - progress)));

  // Left ligand arm
  const lx = cx - targetR - gap;
  for (let dy = -2; dy <= 2; dy++) {
    const y = cy + dy;
    if (y >= 0 && y < rows && lx >= 0 && lx < cols) lines[y][lx] = ">";
    if (y >= 0 && y < rows && lx - 1 >= 0 && lx - 1 < cols) lines[y][lx - 1] = "=";
  }
  writeText(lines, Math.max(0, lx - (compact ? 7 : 10)), cy - 4, compact ? "ligand" : "ligand (candidate)");

  // Right reference arm
  const rx = cx + targetR + gap;
  for (let dy = -2; dy <= 2; dy++) {
    const y = cy + dy;
    if (y >= 0 && y < rows && rx >= 0 && rx < cols) lines[y][rx] = "<";
    if (y >= 0 && y < rows && rx + 1 >= 0 && rx + 1 < cols) lines[y][rx + 1] = "=";
  }

  // Binding energy indicator
  if (progress > 0.5) {
    const kd = (1.0 - progress) * 10;
    writeText(lines, cx - 6, cy + (compact ? 5 : 6), `KD ~ ${kd.toFixed(1)} nM`);
  }
}

// Scene 4 — Boltz2: protein folding / structure prediction
function drawFolding(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const cy = Math.floor(rows * 0.46);

  // Alpha helix representation (spiral-like)
  const helixLen = compact ? 10 : 18;
  const helixStartX = cx - Math.floor(helixLen / 2);
  const helixY = cy - (compact ? 4 : 6);
  const helixChars = "SsHhSsHh";
  for (let i = 0; i < helixLen; i++) {
    const x = helixStartX + i;
    const yOff = Math.round(Math.sin(i * 0.8 + t * 0.003) * (compact ? 1.0 : 1.5));
    const y = helixY + yOff;
    if (y >= 0 && y < rows && x >= 0 && x < cols) {
      lines[y][x] = helixChars[i % helixChars.length];
    }
  }
  writeText(lines, helixStartX, helixY - 2, compact ? "helix" : "alpha-helix");

  // Beta sheet (parallel arrows)
  const sheetY = cy + (compact ? 2 : 3);
  const sheetW = compact ? 12 : 20;
  const sheetStartX = cx - Math.floor(sheetW / 2);
  for (let row = 0; row < 3; row++) {
    const y = sheetY + row * 2;
    if (y >= rows) break;
    const dir = row % 2 === 0;
    for (let i = 0; i < sheetW; i++) {
      const x = sheetStartX + i;
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        lines[y][x] = (i === sheetW - 1 && dir) ? ">" : (i === 0 && !dir) ? "<" : "-";
      }
    }
  }
  writeText(lines, sheetStartX, sheetY + 6, compact ? "sheet" : "beta-sheet");

  // 3D-ish cube outline (structure model)
  const cubeSize = compact ? 5 : 7;
  const cubeX = cx + (compact ? 12 : 18);
  const cubeY = cy - Math.floor(cubeSize / 2);
  // Front face
  box(lines, cubeX, cubeY, cubeSize, cubeSize, "#");
  // Back face offset
  const off = compact ? 2 : 3;
  box(lines, cubeX + off, cubeY - off, cubeSize, cubeSize, "+");
  // Connecting edges
  for (const [dx, dy] of [[0, 0], [cubeSize - 1, 0], [0, cubeSize - 1], [cubeSize - 1, cubeSize - 1]]) {
    const x1 = cubeX + dx, y1 = cubeY + dy;
    const x2 = cubeX + dx + off, y2 = cubeY + dy - off;
    const mx = Math.round((x1 + x2) / 2), my = Math.round((y1 + y2) / 2);
    if (my >= 0 && my < rows && mx >= 0 && mx < cols) lines[my][mx] = "/";
  }
  writeText(lines, cubeX - 1, cubeY + cubeSize + 1, compact ? "Boltz2" : "Boltz2 model");
}

// Scene 5 — GROMACS: molecular dynamics vibration
function drawDynamics(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const cy = Math.floor(rows * 0.46);
  const speed = 0.005;

  // Central molecule vibrating
  const jx = Math.round(Math.sin(t * speed * 3) * 1.5);
  const jy = Math.round(Math.cos(t * speed * 4) * 0.8);
  const molR = compact ? 4 : 6;
  ellipse(lines, cx + jx, cy + jy, molR, Math.max(2, Math.floor(molR * 0.6)), "@");
  if (cy + jy >= 0 && cy + jy < rows && cx + jx >= 0 && cx + jx < cols) lines[cy + jy][cx + jx] = "*";

  // Wavy lines representing energy / heat (above and below)
  const waveRows = compact ? 3 : 5;
  for (let w = 0; w < waveRows; w++) {
    const wy = cy - molR - 3 - w;
    const wy2 = cy + molR + 3 + w;
    const amp = 1.5 + w * 0.3;
    const freq = 0.15 + w * 0.02;
    const waveW = compact ? 20 : 36;
    for (let i = 0; i < waveW; i++) {
      const x = cx - Math.floor(waveW / 2) + i;
      const yOff = Math.round(Math.sin(i * freq + t * speed * 2 + w) * amp);
      const ch = "~";
      const py1 = wy + yOff;
      const py2 = wy2 - yOff;
      if (py1 >= 0 && py1 < rows && x >= 0 && x < cols) lines[py1][x] = ch;
      if (py2 >= 0 && py2 < rows && x >= 0 && x < cols) lines[py2][x] = ch;
    }
  }

  // Temperature / energy label
  const tempLabel = compact ? "300K MD" : "T=300K  GROMACS MD";
  writeText(lines, cx - Math.floor(tempLabel.length / 2), cy + molR + waveRows + 5, tempLabel);

  // Water molecules scattered
  const waterCount = compact ? 8 : 16;
  const tick = Math.floor(t * 0.006);
  for (let i = 0; i < waterCount; i++) {
    const hash = ((i * 48271 + tick) >>> 0) % 65536;
    const wx = cx + ((hash % (compact ? 30 : 50)) - (compact ? 15 : 25));
    const wy = cy + (((hash >> 8) % (compact ? 16 : 24)) - (compact ? 8 : 12));
    if (wy >= 0 && wy < rows && wx >= 0 && wx < cols && lines[wy][wx] === " ") {
      lines[wy][wx] = (hash >> 4) % 3 === 0 ? "o" : ".";
    }
  }
}

// Scene 6 — Metabolic Network: nodes and edges (iML1515)
function drawNetwork(lines, t, progress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * 0.5);
  const cy = Math.floor(rows * 0.46);

  // Network nodes
  const nodes = compact ? [
    { x: 0, y: 0, label: "FBA" },
    { x: -12, y: -5, label: "glc" },
    { x: 12, y: -5, label: "atp" },
    { x: -12, y: 5, label: "6A" },
    { x: 12, y: 5, label: "6B" },
    { x: 0, y: -8, label: "pyr" },
    { x: 0, y: 8, label: "bio" }
  ] : [
    { x: 0, y: 0, label: "FBA core" },
    { x: -18, y: -6, label: "glucose" },
    { x: 18, y: -6, label: "ATP" },
    { x: -18, y: 6, label: "Stage 6A" },
    { x: 18, y: 6, label: "Stage 6B" },
    { x: -9, y: -9, label: "pyruvate" },
    { x: 9, y: -9, label: "NADH" },
    { x: 0, y: 10, label: "biomass" },
    { x: -9, y: 9, label: "essntl" },
    { x: 9, y: 9, label: "metab" }
  ];

  // Draw edges between nodes (connections)
  const edges = compact
    ? [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,5],[2,4],[3,6]]
    : [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[1,5],[2,6],[3,8],[4,9],[5,6],[7,8],[7,9]];

  for (const [a, b] of edges) {
    if (a >= nodes.length || b >= nodes.length) continue;
    const na = nodes[a], nb = nodes[b];
    const x1 = cx + na.x, y1 = cy + na.y;
    const x2 = cx + nb.x, y2 = cy + nb.y;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let i = 1; i < steps; i++) {
      const x = Math.round(x1 + ((x2 - x1) * i) / steps);
      const y = Math.round(y1 + ((y2 - y1) * i) / steps);
      if (y >= 0 && y < rows && x >= 0 && x < cols && lines[y][x] === " ") {
        lines[y][x] = "-";
      }
    }
  }

  // Draw nodes
  const pulse = Math.sin(t * 0.004);
  for (let n = 0; n < nodes.length; n++) {
    const nd = nodes[n];
    const nx = cx + nd.x;
    const ny = cy + nd.y;
    // Node circle
    if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) lines[ny][nx] = "O";
    if (ny >= 0 && ny < rows && nx - 1 >= 0 && nx - 1 < cols) lines[ny][nx - 1] = "(";
    if (ny >= 0 && ny < rows && nx + 1 >= 0 && nx + 1 < cols) lines[ny][nx + 1] = ")";
    // Label
    const lx = nx - Math.floor(nd.label.length / 2);
    const ly = ny - 1;
    if (ly >= 0 && ly < rows) writeText(lines, lx, ly, nd.label);
  }

  // Animated data flow dots along edges
  const tick = Math.floor(t * 0.008);
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e];
    if (a >= nodes.length || b >= nodes.length) continue;
    const na = nodes[a], nb = nodes[b];
    const x1 = cx + na.x, y1 = cy + na.y;
    const x2 = cx + nb.x, y2 = cy + nb.y;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    const pos = ((tick + e * 7) % Math.max(1, steps));
    const x = Math.round(x1 + ((x2 - x1) * pos) / steps);
    const y = Math.round(y1 + ((y2 - y1) * pos) / steps);
    if (y >= 0 && y < rows && x >= 0 && x < cols) lines[y][x] = "*";
  }

  // Network title
  writeText(lines, cx - (compact ? 5 : 7), Math.min(rows - 3, cy + (compact ? 11 : 13)), compact ? "iML1515" : "iML1515 E.coli");
}

function drawProgress(lines, sceneIndex, sceneProgress) {
  const rows = lines.length;
  const cols = lines[0].length;
  const width = Math.min(cols - 6, 64);
  const left = Math.max(1, Math.floor((cols - width - 2) / 2));
  const barY = rows - 2;
  lines[barY][left] = "[";
  const filled = Math.floor(width * ((sceneIndex + sceneProgress) / NARRATIVE_SCENES.length));
  for (let i = 0; i < width; i++) lines[barY][left + 1 + i] = i < filled ? "=" : ".";
  lines[barY][left + width + 1] = "]";
}

function ellipse(lines, cx, cy, rx, ry, ch) {
  const steps = Math.max(48, Math.round((rx + ry) * 8));
  for (let i = 0; i < steps; i++) {
    const th = (Math.PI * 2 * i) / steps;
    const x = Math.round(cx + Math.cos(th) * rx);
    const y = Math.round(cy + Math.sin(th) * ry);
    if (y >= 0 && y < lines.length && x >= 0 && x < lines[0].length) lines[y][x] = ch;
  }
}

function box(lines, x, y, w, h, ch) {
  if (w < 2 || h < 2) return;
  for (let i = 0; i < w; i++) {
    if (y >= 0 && y < lines.length && x + i >= 0 && x + i < lines[0].length) lines[y][x + i] = ch;
    if (y + h - 1 >= 0 && y + h - 1 < lines.length && x + i >= 0 && x + i < lines[0].length) lines[y + h - 1][x + i] = ch;
  }
  for (let j = 0; j < h; j++) {
    if (x >= 0 && x < lines[0].length && y + j >= 0 && y + j < lines.length) lines[y + j][x] = ch;
    if (x + w - 1 >= 0 && x + w - 1 < lines[0].length && y + j >= 0 && y + j < lines.length) lines[y + j][x + w - 1] = ch;
  }
}

function arrow(lines, x1, y1, x2, y2, ch) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    if (y >= 0 && y < lines.length && x >= 0 && x < lines[0].length) lines[y][x] = ch;
  }
  if (y2 >= 0 && y2 < lines.length && x2 >= 0 && x2 < lines[0].length) lines[y2][x2] = x2 >= x1 ? ">" : "<";
}

function writeText(lines, x, y, text) {
  if (y < 0 || y >= lines.length) return;
  for (let i = 0; i < text.length; i++) {
    const px = x + i;
    if (px >= 0 && px < lines[0].length) lines[y][px] = text[i];
  }
}

async function loadManifest() {
  const data = await loadJsonArray("./frames-manifest.json");
  return Array.isArray(data) ? data : [];
}

async function loadManifestCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  for (const path of candidates) {
    const data = await loadJsonArray(path);
    if (Array.isArray(data) && data.length > 0) return data;
  }
  return [];
}

async function loadJsonArray(path) {
  try {
    const res = await fetch(new URL(path, import.meta.url));
    if (!res.ok) return null;
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.warn(`Failed to parse manifest: ${path}`, parseError);
      return null;
    }
    if (!Array.isArray(data)) {
      console.warn(`Manifest is not an array: ${path}`);
      return null;
    }
    return data;
  } catch (error) {
    console.error(`Failed to fetch manifest: ${path}`, error);
    return null;
  }
}

async function loadFallbackFrames() {
  try {
    const mod = await import("./frames.js");
    if (Array.isArray(mod.FRAMES) && mod.FRAMES.length) return { frames: mod.FRAMES, fps: mod.FPS ?? CONFIG.fps };
  } catch (error) {
    console.warn("No precomputed frames.js fallback found.", error);
  }
  return null;
}

async function loadBitmap(path) {
  const url = new URL(path, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load frame: ${url}`);
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

async function createBitmapEngine(manifest, layerEl, asciiOptions = null) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const inflight = new Map();
  const state = { layerEl, cols: 0, rows: 0, key: "", frameCount: manifest.length };
  const renderOpts = {
    palette: (asciiOptions?.palette && asciiOptions.palette.length > 0) ? asciiOptions.palette : CONFIG.palette,
    normalizeLuma: Boolean(asciiOptions?.normalizeLuma),
    contrast: Number.isFinite(asciiOptions?.contrast) ? asciiOptions.contrast : 1,
    gamma: Number.isFinite(asciiOptions?.gamma) ? asciiOptions.gamma : 1
  };

  function update(force = false) {
    const width = layerEl.clientWidth || 1;
    const height = layerEl.clientHeight || 1;
    const cols = clamp(Math.floor(width / CONFIG.charPixelTarget), CONFIG.minCols, CONFIG.maxCols);
    const rows = Math.max(Math.floor(height / (CONFIG.charPixelTarget * CONFIG.lineAspect)), 24);
    const key = `${cols}x${rows}`;
    const changed = force || key !== state.key;
    if (!changed) return false;
    state.cols = cols;
    state.rows = rows;
    state.key = key;
    cache.clear();
    inflight.clear();
    return true;
  }

  function keyFor(i) { return `${i}|${state.key}`; }
  update(true);
  const firstBmp = await loadBitmap(manifest[0]);
  const first = bmpToAscii(firstBmp, canvas, ctx, state.cols, state.rows, renderOpts);
  if (typeof firstBmp.close === "function") firstBmp.close();
  cache.set(keyFor(0), first);

  function ensureFrame(index) {
    update(false);
    const i = ((index % state.frameCount) + state.frameCount) % state.frameCount;
    const key = keyFor(i);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const p = loadBitmap(manifest[i]).then((bmp) => {
      const ascii = bmpToAscii(bmp, canvas, ctx, state.cols, state.rows, renderOpts);
      if (typeof bmp.close === "function") bmp.close();
      cache.set(keyFor(i), ascii);
      return ascii;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return {
    fps: CONFIG.fps,
    frameCount: state.frameCount,
    firstFrame: first,
    getDimensions: () => ({ cols: state.cols, rows: state.rows }),
    ensureFrame,
    preloadFrom(index) {
      for (let k = 1; k <= CONFIG.preloadAhead; k++) ensureFrame((index + k) % state.frameCount).catch(() => { });
    },
    updateResolution(force = false) { return update(force); }
  };
}

async function createProteinLoopEngine({ manifest1, manifest2, layerEl, transitionFrames, morphStyle }) {
  const engine1 = await createBitmapEngine(manifest1, layerEl);
  const engine2 = await createBitmapEngine(manifest2, layerEl, CONFIG.protein2Ascii);
  const n1 = engine1.frameCount;
  const n2 = engine2.frameCount;
  const x = clamp(Math.floor(transitionFrames || 1), 1, Math.min(n1, n2));
  const segA = n1;
  const segAB = x;
  const segB = n2;
  const segBA = x;
  const frameCount = segA + segAB + segB + segBA;
  const morphCache = new Map();

  function normalize(index) {
    return ((index % frameCount) + frameCount) % frameCount;
  }

  function getMorphFrame(sourceFrame, targetFrame, progress, seed) {
    if (morphStyle === "dither") return transmuteAsciiDither(sourceFrame, targetFrame, progress, seed);
    return transmuteAsciiDither(sourceFrame, targetFrame, progress, seed);
  }

  function ensureFrame(index) {
    const i = normalize(index);
    if (i < segA) return engine1.ensureFrame(i);

    if (i < segA + segAB) {
      const j = i - segA;
      const cacheKey = `ab|${j}`;
      if (morphCache.has(cacheKey)) return Promise.resolve(morphCache.get(cacheKey));
      const sourceIndex = n1 - x + j;
      const targetIndex = j;
      const progress = (j + 1) / x;
      return Promise.all([engine1.ensureFrame(sourceIndex), engine2.ensureFrame(targetIndex)]).then(([source, target]) => {
        const frame = getMorphFrame(source, target, progress, 0x1f123bb5 + j * 97);
        morphCache.set(cacheKey, frame);
        return frame;
      });
    }

    if (i < segA + segAB + segB) {
      const k = i - segA - segAB;
      return engine2.ensureFrame(k);
    }

    const j = i - segA - segAB - segB;
    const cacheKey = `ba|${j}`;
    if (morphCache.has(cacheKey)) return Promise.resolve(morphCache.get(cacheKey));
    const sourceIndex = n2 - x + j;
    const targetIndex = j;
    const progress = (j + 1) / x;
    return Promise.all([engine2.ensureFrame(sourceIndex), engine1.ensureFrame(targetIndex)]).then(([source, target]) => {
      const frame = getMorphFrame(source, target, progress, 0x9e3779b9 + j * 131);
      morphCache.set(cacheKey, frame);
      return frame;
    });
  }

  return {
    fps: engine1.fps ?? CONFIG.fps,
    frameCount,
    firstFrame: engine1.firstFrame,
    getDimensions: () => engine1.getDimensions(),
    ensureFrame,
    preloadFrom(index) {
      for (let k = 1; k <= CONFIG.preloadAhead; k++) ensureFrame(index + k).catch(() => { });
    },
    updateResolution(force = false) {
      const c1 = engine1.updateResolution ? engine1.updateResolution(force) : false;
      const c2 = engine2.updateResolution ? engine2.updateResolution(force) : false;
      if (c1 || c2) morphCache.clear();
      return c1 || c2;
    }
  };
}

function bmpToAscii(bitmap, canvas, ctx, cols, rows, options = null) {
  const palette = (options?.palette && options.palette.length > 0) ? options.palette : CONFIG.palette;
  const normalizeLuma = Boolean(options?.normalizeLuma);
  const contrast = Number.isFinite(options?.contrast) ? options.contrast : 1;
  const gamma = Number.isFinite(options?.gamma) ? options.gamma : 1;

  canvas.width = cols;
  canvas.height = rows;
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(bitmap, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const palMax = palette.length - 1;
  const lums = new Float32Array(cols * rows);
  let minLum = 1;
  let maxLum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    lums[p] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const range = maxLum - minLum;
  const out = new Array(rows);
  for (let y = 0; y < rows; y++) {
    let line = "";
    let off = y * cols;
    for (let x = 0; x < cols; x++) {
      let lum = lums[off];
      if (normalizeLuma && range > 0.0001) lum = (lum - minLum) / range;
      if (contrast !== 1) lum = clamp((lum - 0.5) * contrast + 0.5, 0, 1);
      if (gamma !== 1) lum = Math.pow(lum, gamma);
      line += palette[Math.min(palMax, Math.round(clamp(lum, 0, 1) * palMax))];
      off += 1;
    }
    out[y] = line;
  }
  return out.join("\n");
}

function transmuteAsciiDither(sourceFrame, targetFrame, progress, seed) {
  const p = clamp(progress, 0, 1);
  if (p <= 0) return sourceFrame;
  if (p >= 1) return targetFrame;
  if (sourceFrame === targetFrame) return sourceFrame;

  const src = sourceFrame.split("");
  const dst = targetFrame.split("");
  const shared = Math.min(src.length, dst.length);
  const out = new Array(shared);

  for (let i = 0; i < shared; i++) {
    const a = src[i];
    const b = dst[i];
    if (a === "\n" || b === "\n") {
      out[i] = b === "\n" ? "\n" : a === "\n" ? "\n" : b;
      continue;
    }
    out[i] = ditherNoise01(i, seed) < p ? b : a;
  }

  if (src.length !== dst.length) {
    const tail = p < 0.5 ? sourceFrame.slice(shared) : targetFrame.slice(shared);
    return out.join("") + tail;
  }
  return out.join("");
}

function ditherNoise01(index, seed) {
  let x = (index + 1) ^ (seed | 0);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0xffffffff;
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (evt) => {
      URL.revokeObjectURL(url);
      reject(evt?.error || new Error("Image load failed"));
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
    getDimensions: () => ({ cols: width, rows: height }),
    ensureFrame(index) {
      const i = ((index % frames.length) + frames.length) % frames.length;
      return Promise.resolve(frames[i]);
    },
    preloadFrom() { },
    updateResolution() { return false; }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
