const CONFIG = {
  fps: 60,
  speed: 0.4,
  palette: "/\\.|",
  lineAspect: 1.0,
  charPixelTarget: 6,
  minCols: 100,
  maxCols: 500,
  preloadAhead: 15
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
const footer = document.querySelector(".site-footer");

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
      if (engine.updateResolution) engine.updateResolution(true);
      fit();
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
}

function computeNarrativeActive() {
  if (innerWidth <= 900 || !statusSection) return false;
  const anchorY = scrollY + innerHeight * 0.35;
  const statusTop = statusSection.offsetTop;
  const footerBottom = footer ? footer.offsetTop + footer.offsetHeight : document.documentElement.scrollHeight;
  return anchorY >= statusTop && scrollY <= footerBottom;
}

function setBodyActivity(proteinActive, narrativeActive) {
  if (!body) return;
  body.setAttribute("data-protein-active", proteinActive ? "true" : "false");
  body.setAttribute("data-narrative-active", narrativeActive ? "true" : "false");
}

async function initProteinEngine() {
  if (!proteinLayer) throw new Error("protein layer missing");
  const manifest = await loadManifest();
  if (manifest.length) return createBitmapEngine(manifest, proteinLayer);
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
  if (storyActions) storyActions.setAttribute("aria-hidden", sceneState.isFinalHold ? "false" : "true");
}

function createNarrativeEngine(layerEl) {
  const fps = 24;
  const frameCount = Math.max(1, Math.round((NARRATIVE_TOTAL_MS / 1000) * fps));
  const dims = { cols: 0, rows: 0, mobile: false, key: "" };

  function updateResolution(force = false) {
    const w = layerEl.clientWidth || innerWidth || 1;
    const h = layerEl.clientHeight || innerHeight || 1;
    const mobile = w <= 900;
    const cols = clamp(Math.floor(w / (mobile ? 7.2 : 6.3)), mobile ? 78 : 82, mobile ? 128 : 164);
    const rows = clamp(Math.floor(h / (mobile ? 12 : 10.8)), mobile ? 26 : 30, mobile ? 52 : 66);
    const key = `${cols}x${rows}|${mobile ? "m" : "d"}`;
    if (force || key !== dims.key) {
      dims.cols = cols;
      dims.rows = rows;
      dims.mobile = mobile;
      dims.key = key;
    }
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
    updateResolution(force = false) { updateResolution(force); }
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
  writeText(lines, Math.floor(cols * 0.06), Math.floor(rows * 0.16), labelMap[scene.sceneId] ?? "");
  writeText(lines, Math.floor(cols * 0.06), rows - 4, dims.mobile ? "S1->S2a+2b->S3(200)->S4(KD)->S5(50)->6A/6B" : "REINVENT4->S2a+S2b->S3(top200)->S4(KD)->S5(top50)->6A/6B");
  drawSceneShape(lines, scene.sceneId, t);
  drawProgress(lines, scene.sceneIndex, scene.sceneProgress);
  return lines.map((r) => r.join("")).join("\n");
}

function drawSceneShape(lines, sceneId, t) {
  const rows = lines.length;
  const cols = lines[0].length;
  const cx = Math.floor(cols * 0.24);
  const cy = Math.floor(rows * 0.5);
  const pulse = Math.sin(t * 0.004) * 0.8;
  const rx = Math.max(6, Math.floor(cols * 0.1 + pulse));
  const ry = Math.max(5, Math.floor(rows * 0.17 + pulse * 0.5));
  ellipse(lines, cx, cy, rx, ry, "@");
  if (sceneId === "scene-2" || sceneId === "scene-3") {
    const gx = Math.floor(cols * 0.48);
    for (let y = Math.floor(rows * 0.24); y <= Math.floor(rows * 0.76); y++) lines[y][gx] = "|";
  }
  if (sceneId === "scene-4") {
    box(lines, Math.floor(cols * 0.18), Math.floor(rows * 0.24), Math.floor(cols * 0.22), Math.floor(rows * 0.4), "#");
    writeText(lines, Math.floor(cols * 0.2), Math.floor(rows * 0.32), "stage4_output.csv");
  }
  if (sceneId === "scene-5") {
    box(lines, Math.floor(cols * 0.7), Math.floor(rows * 0.28), 12, 6, "#");
    box(lines, Math.floor(cols * 0.7), Math.floor(rows * 0.62), 12, 6, "#");
    writeText(lines, Math.floor(cols * 0.74), Math.floor(rows * 0.32), "6A");
    writeText(lines, Math.floor(cols * 0.74), Math.floor(rows * 0.66), "6B");
  }
  if (sceneId === "scene-6") {
    box(lines, Math.floor(cols * 0.56), Math.floor(rows * 0.28), Math.floor(cols * 0.34), Math.floor(rows * 0.42), "#");
  }
  arrow(lines, cx + rx + 3, cy, Math.floor(cols * 0.58), cy, "=");
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
  try {
    const res = await fetch(new URL("./frames-manifest.json", import.meta.url));
    if (!res.ok) return [];
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

async function createBitmapEngine(manifest, layerEl) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const inflight = new Map();
  const state = { layerEl, cols: 0, rows: 0, key: "", frameCount: manifest.length };

  function update(force = false) {
    const width = layerEl.clientWidth || 1;
    const height = layerEl.clientHeight || 1;
    const cols = clamp(Math.floor(width / CONFIG.charPixelTarget), CONFIG.minCols, CONFIG.maxCols);
    const rows = Math.max(Math.floor(height / (CONFIG.charPixelTarget * CONFIG.lineAspect)), 24);
    const key = `${cols}x${rows}`;
    if (force || key !== state.key) {
      state.cols = cols;
      state.rows = rows;
      state.key = key;
      cache.clear();
      inflight.clear();
    }
  }

  function keyFor(i) { return `${i}|${state.key}`; }
  update(true);
  const firstBmp = await loadBitmap(manifest[0]);
  const first = bmpToAscii(firstBmp, canvas, ctx, state.cols, state.rows);
  if (typeof firstBmp.close === "function") firstBmp.close();
  cache.set(keyFor(0), first);

  function ensureFrame(index) {
    update(false);
    const i = ((index % state.frameCount) + state.frameCount) % state.frameCount;
    const key = keyFor(i);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const p = loadBitmap(manifest[i]).then((bmp) => {
      const ascii = bmpToAscii(bmp, canvas, ctx, state.cols, state.rows);
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
    updateResolution(force = false) { update(force); }
  };
}

function bmpToAscii(bitmap, canvas, ctx, cols, rows) {
  canvas.width = cols;
  canvas.height = rows;
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(bitmap, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const palMax = CONFIG.palette.length - 1;
  const out = new Array(rows);
  for (let y = 0; y < rows; y++) {
    let line = "";
    let off = y * cols * 4;
    for (let x = 0; x < cols; x++) {
      const r = data[off], g = data[off + 1], b = data[off + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      line += CONFIG.palette[Math.min(palMax, Math.round(lum * palMax))];
      off += 4;
    }
    out[y] = line;
  }
  return out.join("\n");
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
    updateResolution() { }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
