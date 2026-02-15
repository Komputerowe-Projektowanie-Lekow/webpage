const CONFIG = {
  fps: 60,
  speed: 0.4,
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
  { id: "scene-1", durationMs: 1600, kicker: "Scena 1/6", title: "Komorka pojedyncza", meta: "Waskie gardlo Gram-ujemnych: dobry score in-silico nie gwarantuje efektu komorkowego." },
  { id: "scene-2", durationMs: 1700, kicker: "Scena 2/6", title: "Retencja i wejscie do komorki", meta: "Stage 2: stage2a_output.csv + stage2b_output.csv jako filtr wejscia i retencji." },
  { id: "scene-3", durationMs: 1700, kicker: "Scena 3/6", title: "Target engagement przed struktura", meta: "stage3_for_boltz2.csv: top 200 kandydatow przed etapem strukturalnym." },
  { id: "scene-4", durationMs: 1700, kicker: "Scena 4/6", title: "Boltz2 i KD_pred", meta: "stage4_output.csv z KD_pred buduje ranking przed MD i etapami systemowymi." },
  { id: "scene-5", durationMs: 2100, kicker: "Scena 5/6", title: "MD i system", meta: "stage3_for_gromacs.csv (top 50) -> stage5_output.csv -> Stage 6A/6B." },
  { id: "scene-6", durationMs: 4200, holdStartMs: 1500, kicker: "Scena 6/6", title: "Wirtualna komorka", meta: "Stan 2026-02-10: EXP3 pilot15 (top_n=10) przeszedl Stage1->Stage6 + finalize.", note: "full10 po fixie Stage6B czeka na potwierdzenie rerunu." }
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
  const phase = t * 1.9;
  const front = 220 + progress * 240 + Math.sin(phase * 0.82) * 20;
  const strength = 0.36 + progress * 0.5;
  const bleed = 8 + progress * 10;

  narrativeLayer.style.setProperty("--narrative-ripple-front", `${front.toFixed(2)}px`);
  narrativeLayer.style.setProperty("--narrative-ripple-strength", strength.toFixed(3));
  narrativeLayer.style.setProperty("--narrative-bleed-vw", `${bleed.toFixed(3)}vw`);
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
  const fps = 24;
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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const s = Math.sin(x * 0.12 + y * 0.09 + t * 0.001) + Math.cos(x * 0.03 - y * 0.11 + t * 0.0008);
      if (s > 1.94) lines[y][x] = ".";
    }
  }
  const labelMap = { "scene-1": "[komorka pojedyncza]", "scene-2": "[retencja i wejscie]", "scene-3": "[target engagement]", "scene-4": "[boltz2 + KD_pred]", "scene-5": "[MD i system]", "scene-6": "[wirtualna komorka]" };
  const compactLabelMap = { "scene-1": "[komorka]", "scene-2": "[retencja]", "scene-3": "[engagement]", "scene-4": "[S4 KD]", "scene-5": "[MD + system]", "scene-6": "[wirtualna]" };
  const label = cols < 110 ? (compactLabelMap[scene.sceneId] ?? "") : (labelMap[scene.sceneId] ?? "");
  const pipelineLine = cols < 100
    ? "S1>S2>S3>S4>S5>6A/6B"
    : cols < 126
      ? "S1->S2a+2b->S3(200)->S4(KD)->S5(50)->6A/6B"
      : "REINVENT4->S2a+S2b->S3(top200)->S4(KD)->S5(top50)->6A/6B";
  writeText(lines, Math.floor(cols * 0.06), Math.floor(rows * 0.16), label);
  writeText(lines, Math.floor(cols * 0.06), rows - 4, pipelineLine);
  drawSceneShape(lines, scene.sceneId, t);
  drawProgress(lines, scene.sceneIndex, scene.sceneProgress);
  return lines.map((r) => r.join("")).join("\n");
}

function drawSceneShape(lines, sceneId, t) {
  const rows = lines.length;
  const cols = lines[0].length;
  const compact = cols < 96;
  const cx = Math.floor(cols * (compact ? 0.2 : 0.24));
  const cy = Math.floor(rows * 0.5);
  const pulse = Math.sin(t * 0.004) * 0.8;
  const rx = clamp(
    Math.floor((compact ? cols * 0.075 : cols * 0.1) + pulse),
    compact ? 5 : 6,
    Math.max(compact ? 7 : 9, Math.floor(cols * (compact ? 0.1 : 0.13)))
  );
  const ry = clamp(
    Math.floor((compact ? rows * 0.13 : rows * 0.17) + pulse * 0.5),
    compact ? 4 : 5,
    Math.max(compact ? 8 : 10, Math.floor(rows * 0.22))
  );
  ellipse(lines, cx, cy, rx, ry, "@");
  const gateX = clamp(Math.floor(cols * (compact ? 0.44 : 0.48)), cx + rx + 3, cols - 3);
  if (sceneId === "scene-2" || sceneId === "scene-3") {
    for (let y = Math.floor(rows * 0.24); y <= Math.floor(rows * 0.76); y++) lines[y][gateX] = "|";
  }
  if (sceneId === "scene-4") {
    const boxW = clamp(Math.floor(cols * (compact ? 0.18 : 0.22)), compact ? 10 : 14, compact ? 16 : 24);
    const boxH = clamp(Math.floor(rows * (compact ? 0.28 : 0.4)), compact ? 7 : 10, compact ? 11 : 18);
    const minX = Math.max(1, cx - Math.floor(boxW * 0.35));
    const boxX = clamp(Math.floor(cols * (compact ? 0.22 : 0.18)), minX, Math.max(minX, cols - boxW - 2));
    const boxY = clamp(Math.floor(rows * 0.24), 1, Math.max(1, rows - boxH - 2));
    box(lines, boxX, boxY, boxW, boxH, "#");
    writeText(lines, boxX + 2, Math.min(rows - 2, boxY + Math.max(2, Math.floor(boxH * 0.35))), compact ? "s4.csv" : "stage4_output.csv");
  }
  if (sceneId === "scene-5") {
    const boxW = compact ? 8 : 12;
    const boxH = compact ? 4 : 6;
    const boxX = clamp(Math.floor(cols * (compact ? 0.74 : 0.7)), 1, cols - boxW - 2);
    const topY = clamp(Math.floor(rows * 0.28), 1, Math.max(1, rows - boxH - 2));
    const bottomY = clamp(Math.floor(rows * (compact ? 0.58 : 0.62)), topY + boxH + 1, Math.max(topY + boxH + 1, rows - boxH - 2));
    box(lines, boxX, topY, boxW, boxH, "#");
    box(lines, boxX, bottomY, boxW, boxH, "#");
    writeText(lines, boxX + Math.max(2, Math.floor(boxW * 0.35)), Math.min(rows - 2, topY + Math.max(1, Math.floor(boxH * 0.5))), "6A");
    writeText(lines, boxX + Math.max(2, Math.floor(boxW * 0.35)), Math.min(rows - 2, bottomY + Math.max(1, Math.floor(boxH * 0.5))), "6B");
  }
  if (sceneId === "scene-6") {
    const boxW = clamp(Math.floor(cols * (compact ? 0.24 : 0.34)), compact ? 12 : 18, compact ? 18 : 34);
    const boxH = clamp(Math.floor(rows * (compact ? 0.28 : 0.42)), compact ? 8 : 12, compact ? 14 : 28);
    const minX = cx + rx + 6;
    const boxX = clamp(Math.floor(cols * (compact ? 0.6 : 0.56)), minX, Math.max(minX, cols - boxW - 2));
    const boxY = clamp(Math.floor(rows * 0.28), 1, Math.max(1, rows - boxH - 2));
    box(lines, boxX, boxY, boxW, boxH, "#");
  }
  const arrowStartX = clamp(cx + rx + 2, 1, cols - 2);
  const arrowTargetX = clamp(Math.floor(cols * (compact ? 0.54 : 0.58)), arrowStartX + 1, cols - 2);
  arrow(lines, arrowStartX, cy, arrowTargetX, cy, "=");
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
