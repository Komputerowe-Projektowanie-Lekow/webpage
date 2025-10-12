const CONFIG = {
  fps: 60,
  speed: 0.15,
  palette: " .:-=+*#%@",
  yScale: 5.0,
  lineAspect: 1.0,
  charPixelTarget: 6,
  minCols: 100,
  maxCols: 500,
  preloadAhead: 15
};

const screen = document.getElementById("screen");
const wrap = document.querySelector(".ascii-layer");
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

if (screen && wrap) {
  bootstrap().catch((error) => {
    console.error(error);
    screen.textContent = "Unable to load ASCII frames.";
  });
}

async function bootstrap() {
  const manifest = await loadManifest();
  let engine;

  if (manifest.length) {
    engine = await createAsciiEngine(manifest, wrap);
  } else {
    const fallback = await loadFallbackFrames();
    if (!fallback) {
      screen.textContent = "Frames manifest not found.";
      return;
    }
    engine = createPrecomputedEngine(fallback);
  }

  screen.textContent = engine.firstFrame;
  fitFont(engine);
  if (engine.preloadFrom) {
    engine.preloadFrom(0);
  }

  let running = false;
  let raf = null;
  let lastTick = performance.now();
  let frameIndex = 1; // first frame already displayed
  let paintToken = 0;
  const frameInterval = (1000 / (engine.fps ?? CONFIG.fps)) / CONFIG.speed;

  const renderFrame = (index) => {
    const token = ++paintToken;
    engine.ensureFrame(index).then((frame) => {
      if (token === paintToken) {
        screen.textContent = frame;
        if (engine.preloadFrom) {
          engine.preloadFrom(index);
        }
      }
    }).catch((error) => console.error("Frame render failed:", error));
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
    engine.ensureFrame((frameIndex + engine.frameCount - 1) % engine.frameCount)
      .then((frame) => {
        screen.textContent = frame;
      }).catch(() => {});
  };

  prefersReducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      stop();
      engine.ensureFrame(0).then((frame) => {
        screen.textContent = frame;
      }).catch(() => {});
    } else {
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
    return;
  }

  start();
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
  return await blobToImage(blob);
}

async function createAsciiEngine(manifest, wrap) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const asciiCache = new Map();
  const inflight = new Map();

  const state = {
    manifest,
    wrap,
    cols: 0,
    rows: 0,
    resKey: "",
    aspect: 1,
    frameCount: manifest.length
  };

  const firstBitmap = await loadBitmap(manifest[0]);
  state.aspect = firstBitmap.height / firstBitmap.width;
  updateResolutionInternal(state, wrap, asciiCache, inflight);
  const firstAscii = convertBitmapToAscii(firstBitmap, canvas, ctx, state);
  asciiCache.set(cacheKey(0, state), firstAscii);
  if (typeof firstBitmap.close === "function") {
    firstBitmap.close();
  }

  const ensureFrame = (index) => {
    updateResolutionInternal(state, wrap, asciiCache, inflight);
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
      ensureFrame(next).catch(() => {});
    }
  };

  return {
    ensureFrame,
    preloadFrom,
    updateResolution(force = false) {
      updateResolutionInternal(state, wrap, asciiCache, inflight, force);
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

function updateResolutionInternal(state, wrap, cache, inflight, force = false) {
  const width = wrap.clientWidth || 1;
  const height = wrap.clientHeight || 1;
  
  // Calculate columns and rows based on viewport dimensions to fill entire screen
  let cols = Math.floor(width / CONFIG.charPixelTarget);
  cols = Math.max(CONFIG.minCols, Math.min(CONFIG.maxCols, cols));
  
  // Calculate rows based on viewport height to ensure full vertical coverage
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

  // Scale image to exactly match our viewport-based resolution
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
    getDimensions() { return { cols: width, rows: height }; },
    ensureFrame(index) { return Promise.resolve(frames[index]); },
    preloadFrom() {},
    updateResolution() {}
  };
}

function fitFont(engine) {
  const dims = engine.getDimensions();
  const cols = dims.cols;
  const rows = dims.rows;
  if (!cols || !rows) {
    return;
  }

  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  if (!width || !height) {
    return;
  }

  // Calculate font size to exactly fill viewport dimensions
  const pxByWidth = width / cols;
  const pxByHeight = height / (rows * CONFIG.lineAspect);
  
  // Use the larger value to ensure full coverage, then add a small buffer
  const px = Math.ceil(Math.max(pxByWidth, pxByHeight) * 1.01);

  if (px > 0) {
    screen.style.fontSize = px + "px";
    screen.style.lineHeight = px * CONFIG.lineAspect + "px";
  }
}
