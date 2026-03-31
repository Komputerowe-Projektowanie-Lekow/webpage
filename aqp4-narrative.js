/**
 * @fileoverview AQP4-specific narrative ASCII animation engine.
 * Creates visual storytelling for the AQP4/Alzheimer CADD workflow.
 * 
 * Scenes:
 * 1. Water Channel - AQP4 pore with water molecules flowing
 * 2. Conformational Ensemble - Protein states morphing (REMD/Metadynamics)
 * 3. Docking - Ligand approaching binding pocket
 * 4. Free Energy Surface - FES landscape with MSM states
 */

(function() {
  'use strict';

  // ============ CONFIGURATION ============
  const CONFIG = {
    fps: 24,
    speed: 0.5,
    mobileBreakpoint: 900,
    minCols: 60,
    maxCols: 120,
    minRows: 20,
    maxRows: 40,
    charWidth: 7.6,
    lineHeight: 12.2,
    noiseThreshold: 1.92
  };

  // Scene definitions for AQP4 workflow
  const SCENES = [
    { 
      id: "water-channel", 
      durationMs: 4000, 
      kicker: "AQP4", 
      title: "Kanał wodny", 
      meta: "Akwaporyna-4: transport wody przez błonę komórkową"
    },
    { 
      id: "ensemble", 
      durationMs: 4000, 
      kicker: "REMD + Metadynamics", 
      title: "Ensemble konformacji", 
      meta: "Przeszukiwanie przestrzeni konformacyjnej białka"
    },
    { 
      id: "docking", 
      durationMs: 4000, 
      kicker: "AutoDock", 
      title: "Dokowanie ligandu", 
      meta: "Wiązanie cząsteczki do kieszeni allosterycznej"
    },
    { 
      id: "fes", 
      durationMs: 4000, 
      kicker: "FES + MSM", 
      title: "Krajobraz energetyczny", 
      meta: "Stany metastabilne i bariera przejścia"
    }
  ];
  const TOTAL_MS = SCENES.reduce((sum, s) => sum + s.durationMs, 0);

  // ============ DOM ELEMENTS ============
  const narrativeLayer = document.getElementById('aqp4-narrative-layer');
  const narrativeScreen = document.getElementById('aqp4-narrative-screen');
  const narrativeGhost1 = document.getElementById('aqp4-narrative-ghost-1');
  const narrativeGhost2 = document.getElementById('aqp4-narrative-ghost-2');
  const storyKicker = document.getElementById('aqp4-story-kicker');
  const storyTitle = document.getElementById('aqp4-story-title');
  const storyMeta = document.getElementById('aqp4-story-meta');

  // ============ STATE ============
  let animationRaf = null;
  let isRunning = false;
  let frameIndex = 0;
  let lastTick = 0;
  let dims = { cols: 80, rows: 30 };
  let lineBuffer = null;

  // ============ INITIALIZATION ============
  function init() {
    if (!narrativeLayer || !narrativeScreen) {
      console.log('AQP4 narrative layer not found, skipping initialization');
      return;
    }

    // Only run on desktop
    if (window.innerWidth <= CONFIG.mobileBreakpoint) {
      narrativeLayer.style.display = 'none';
      return;
    }

    updateDimensions();
    renderFrame(0);
    
    // Start animation when visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
          start();
        } else {
          stop();
        }
      });
    }, { threshold: [0, 0.1, 0.5] });
    
    observer.observe(narrativeLayer);

    // Handle resize
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth <= CONFIG.mobileBreakpoint) {
        stop();
        narrativeLayer.style.display = 'none';
      } else {
        narrativeLayer.style.display = '';
        updateDimensions();
      }
    }, 200));

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReducedMotion.matches) {
      renderFrame(0);
      return;
    }
    prefersReducedMotion.addEventListener('change', () => {
      if (prefersReducedMotion.matches) {
        stop();
        renderFrame(0);
      }
    });
  }

  function updateDimensions() {
    if (!narrativeLayer) return;
    const w = narrativeLayer.clientWidth || window.innerWidth * 0.5;
    const h = narrativeLayer.clientHeight || window.innerHeight * 0.6;
    
    dims.cols = clamp(Math.floor(w / CONFIG.charWidth), CONFIG.minCols, CONFIG.maxCols);
    dims.rows = clamp(Math.floor(h / CONFIG.lineHeight), CONFIG.minRows, CONFIG.maxRows);
    
    // Reallocate buffer
    lineBuffer = null;
  }

  // ============ ANIMATION LOOP ============
  function start() {
    if (isRunning) return;
    isRunning = true;
    lastTick = performance.now();
    animationRaf = requestAnimationFrame(tick);
  }

  function stop() {
    isRunning = false;
    if (animationRaf !== null) {
      cancelAnimationFrame(animationRaf);
      animationRaf = null;
    }
  }

  function tick(now) {
    if (!isRunning) return;
    
    const interval = (1000 / CONFIG.fps) / CONFIG.speed;
    if (now - lastTick >= interval) {
      lastTick = now;
      renderFrame(frameIndex);
      frameIndex++;
    }
    
    animationRaf = requestAnimationFrame(tick);
  }

  // ============ RENDERING ============
  function renderFrame(frame) {
    const totalFrames = Math.round((TOTAL_MS / 1000) * CONFIG.fps);
    const normalizedFrame = ((frame % totalFrames) + totalFrames) % totalFrames;
    const timeMs = (normalizedFrame / CONFIG.fps) * 1000;
    
    const scene = getSceneState(timeMs);
    updateOverlay(scene);
    
    const ascii = generateFrame(scene, timeMs);
    setScreenContent(ascii);
  }

  function getSceneState(timeMs) {
    const t = ((timeMs % TOTAL_MS) + TOTAL_MS) % TOTAL_MS;
    let cursor = 0;
    
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i];
      const end = cursor + s.durationMs;
      if (t < end || i === SCENES.length - 1) {
        return {
          id: s.id,
          index: i,
          progress: clamp((t - cursor) / s.durationMs, 0, 1),
          kicker: s.kicker,
          title: s.title,
          meta: s.meta
        };
      }
      cursor = end;
    }
    return SCENES[0];
  }

  function updateOverlay(scene) {
    if (storyKicker) storyKicker.textContent = scene.kicker;
    if (storyTitle) storyTitle.textContent = scene.title;
    if (storyMeta) storyMeta.textContent = scene.meta;
    if (narrativeLayer) narrativeLayer.setAttribute('data-scene', scene.id);
  }

  function setScreenContent(text) {
    [narrativeScreen, narrativeGhost1, narrativeGhost2].forEach(el => {
      if (el) el.textContent = text;
    });
  }

  function generateFrame(scene, timeMs) {
    const { cols, rows } = dims;
    
    // Allocate or reuse buffer
    if (!lineBuffer || lineBuffer.length !== rows || lineBuffer[0]?.length !== cols) {
      lineBuffer = Array.from({ length: rows }, () => Array(cols).fill(' '));
    } else {
      for (let y = 0; y < rows; y++) lineBuffer[y].fill(' ');
    }

    // Subtle background noise
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const s = Math.sin(x * 0.12 + y * 0.09 + timeMs * 0.0004) + 
                  Math.cos(x * 0.03 - y * 0.11 + timeMs * 0.0003);
        if (s > CONFIG.noiseThreshold) lineBuffer[y][x] = '.';
      }
    }

    // Draw scene-specific content
    drawScene(lineBuffer, scene, timeMs);
    
    // Draw progress bar
    drawProgressBar(lineBuffer, scene.index, scene.progress);
    
    // Draw label
    const labelMap = {
      'water-channel': '[AQP4 : transport]',
      'ensemble': '[REMD : konformacje]',
      'docking': '[AutoDock : wiązanie]',
      'fes': '[FES : energia]'
    };
    writeText(lineBuffer, 2, 1, labelMap[scene.id] || '');
    
    return lineBuffer.map(row => row.join('')).join('\n');
  }

  function drawScene(lines, scene, t) {
    switch (scene.id) {
      case 'water-channel': drawWaterChannel(lines, t, scene.progress); break;
      case 'ensemble': drawEnsemble(lines, t, scene.progress); break;
      case 'docking': drawDocking(lines, t, scene.progress); break;
      case 'fes': drawFES(lines, t, scene.progress); break;
    }
  }

  // ============ SCENE: WATER CHANNEL ============
  function drawWaterChannel(lines, t, progress) {
    const rows = lines.length;
    const cols = lines[0].length;
    const cx = Math.floor(cols * 0.5);
    const cy = Math.floor(rows * 0.5);
    
    // Channel walls
    const channelHeight = Math.floor(rows * 0.6);
    const topY = cy - Math.floor(channelHeight / 2);
    const botY = cy + Math.floor(channelHeight / 2);
    const halfWidth = 6;
    
    // Draw membrane (horizontal lines at top and bottom)
    for (let x = cx - halfWidth - 12; x <= cx + halfWidth + 12; x++) {
      if (x < cx - halfWidth || x > cx + halfWidth) {
        safeWrite(lines, x, topY - 1, '═');
        safeWrite(lines, x, botY + 1, '═');
      }
    }
    
    // Draw channel walls
    for (let y = topY; y <= botY; y++) {
      safeWrite(lines, cx - halfWidth, y, '║');
      safeWrite(lines, cx + halfWidth, y, '║');
    }
    
    // Channel openings
    safeWrite(lines, cx - halfWidth, topY, '╔');
    safeWrite(lines, cx + halfWidth, topY, '╗');
    safeWrite(lines, cx - halfWidth, botY, '╚');
    safeWrite(lines, cx + halfWidth, botY, '╝');
    
    // "AQP4" label in channel
    writeText(lines, cx - 2, topY + 2, 'AQP4');
    
    // Animated water molecules flowing through
    const tick = Math.floor(t * 0.008);
    for (let i = 0; i < 8; i++) {
      const hash = ((i * 2654435761 + tick) >>> 0) % 65536;
      const yOffset = (hash + Math.floor(t * 0.02 * (1 + i * 0.1))) % channelHeight;
      const y = topY + 1 + (yOffset % (channelHeight - 1));
      const xOffset = ((hash >> 8) % (halfWidth * 2 - 2)) - halfWidth + 1;
      const x = cx + xOffset;
      
      // Water molecule as 'o' or 'O'
      const ch = (i % 3 === 0) ? 'O' : 'o';
      safeWrite(lines, x, y, ch);
    }
    
    // Flow direction arrows
    const arrowY = cy;
    for (let i = 0; i < 3; i++) {
      const offset = Math.floor((t * 0.01 + i * 4) % 6) - 3;
      safeWrite(lines, cx + offset, arrowY + 5, '↓');
    }
    
    // Labels
    writeText(lines, cx - 8, topY - 3, 'zewnątrz komórki');
    writeText(lines, cx - 8, botY + 3, 'wewnątrz komórki');
    writeText(lines, cx + halfWidth + 3, cy, 'H₂O');
  }

  // ============ SCENE: CONFORMATIONAL ENSEMBLE ============
  function drawEnsemble(lines, t, progress) {
    const rows = lines.length;
    const cols = lines[0].length;
    const cy = Math.floor(rows * 0.5);
    
    // Three protein conformations side by side
    const states = [
      { x: Math.floor(cols * 0.2), label: 'state-1', shape: 'compact' },
      { x: Math.floor(cols * 0.5), label: 'state-2', shape: 'extended' },
      { x: Math.floor(cols * 0.8), label: 'state-3', shape: 'twisted' }
    ];
    
    // Highlight current state based on progress
    const activeState = Math.floor(progress * 3) % 3;
    
    states.forEach((state, idx) => {
      const isActive = idx === activeState;
      const jitter = isActive ? Math.sin(t * 0.005) * 1.5 : 0;
      
      if (state.shape === 'compact') {
        // Compact globular shape
        const r = isActive ? 5 : 4;
        drawEllipse(lines, state.x + jitter, cy, r, r * 0.7, isActive ? '@' : 'o');
        safeWrite(lines, state.x, cy, '*');
      } else if (state.shape === 'extended') {
        // Extended chain
        const len = isActive ? 14 : 10;
        const startX = state.x - Math.floor(len / 2) + jitter;
        for (let i = 0; i < len; i++) {
          const yOff = Math.round(Math.sin(i * 0.6 + t * 0.003) * 2);
          safeWrite(lines, startX + i, cy + yOff, isActive ? '#' : '-');
        }
      } else {
        // Twisted helix
        const len = isActive ? 10 : 8;
        const startX = state.x - Math.floor(len / 2) + jitter;
        for (let i = 0; i < len; i++) {
          const yOff = Math.round(Math.sin(i * 0.8 + t * 0.004) * 2.5);
          const ch = (i % 2 === 0) ? '/' : '\\';
          safeWrite(lines, startX + i, cy + yOff, isActive ? ch : '~');
        }
      }
      
      // State label
      writeText(lines, state.x - 3, cy + 6, state.label);
      if (isActive) {
        writeText(lines, state.x - 2, cy + 8, '▲ aktywny');
      }
    });
    
    // Arrows between states
    const arrowY = cy - 5;
    writeText(lines, Math.floor(cols * 0.35), arrowY, '⟷');
    writeText(lines, Math.floor(cols * 0.65), arrowY, '⟷');
    
    // Title
    writeText(lines, Math.floor(cols * 0.5) - 10, 3, 'REMD + Metadynamics ensemble');
  }

  // ============ SCENE: DOCKING ============
  function drawDocking(lines, t, progress) {
    const rows = lines.length;
    const cols = lines[0].length;
    const cx = Math.floor(cols * 0.55);
    const cy = Math.floor(rows * 0.5);
    
    // Draw binding pocket (receptor)
    const pocketWidth = 8;
    const pocketHeight = 6;
    const pocketX = cx;
    const pocketY = cy;
    
    // Pocket shape - U-shaped opening
    for (let i = 0; i < pocketHeight; i++) {
      safeWrite(lines, pocketX - pocketWidth/2, pocketY - pocketHeight/2 + i, '█');
      safeWrite(lines, pocketX + pocketWidth/2, pocketY - pocketHeight/2 + i, '█');
    }
    // Bottom of pocket
    for (let i = -pocketWidth/2 + 1; i < pocketWidth/2; i++) {
      safeWrite(lines, pocketX + i, pocketY + pocketHeight/2, '▀');
    }
    
    writeText(lines, pocketX - 3, pocketY - pocketHeight/2 - 2, 'AQP4');
    writeText(lines, pocketX - 3, pocketY + pocketHeight/2 + 2, 'pocket');
    
    // Ligand approaching based on progress
    const startX = Math.floor(cols * 0.15);
    const endX = pocketX - pocketWidth/2 - 2;
    const ligandX = startX + (endX - startX) * progress;
    const ligandY = cy + Math.sin(t * 0.004) * 0.5;
    
    // Draw ligand (small molecule)
    const ligand = ['  O', ' /|\\', 'C-N-C', ' \\|/', '  O'];
    const ligandStartY = Math.floor(ligandY) - 2;
    ligand.forEach((row, i) => {
      writeText(lines, Math.floor(ligandX) - 2, ligandStartY + i, row);
    });
    
    // Motion trail
    if (progress < 0.8) {
      for (let i = 1; i <= 3; i++) {
        const trailX = ligandX - i * 4;
        if (trailX > startX) {
          safeWrite(lines, Math.floor(trailX), Math.floor(ligandY), '·');
        }
      }
    }
    
    // Arrow showing direction
    if (progress < 0.9) {
      writeText(lines, Math.floor(ligandX) + 5, Math.floor(ligandY), '→');
    }
    
    // KD indicator appears when docked
    if (progress > 0.7) {
      const kd = (1.2 - progress * 0.8).toFixed(1);
      writeText(lines, pocketX - 5, cy + 8, `KD ~ ${kd} nM`);
    }
    
    // Labels
    writeText(lines, startX - 2, cy - 6, 'ligand');
  }

  // ============ SCENE: FREE ENERGY SURFACE ============
  function drawFES(lines, t, progress) {
    const rows = lines.length;
    const cols = lines[0].length;
    const baseY = Math.floor(rows * 0.7);
    const leftX = Math.floor(cols * 0.1);
    const rightX = Math.floor(cols * 0.9);
    const width = rightX - leftX;
    
    // Draw energy landscape (hills and valleys)
    // FES curve: two minima (states) with a barrier
    const points = [];
    for (let i = 0; i <= width; i++) {
      const x = leftX + i;
      const frac = i / width;
      
      // Two wells with barrier in middle
      // Energy function: combines two gaussians (minima) and a barrier
      const well1 = 8 * Math.exp(-Math.pow((frac - 0.25) * 5, 2));
      const well2 = 6 * Math.exp(-Math.pow((frac - 0.75) * 5, 2));
      const barrier = -10 * Math.exp(-Math.pow((frac - 0.5) * 4, 2));
      const base = 3;
      const energy = base - well1 - well2 - barrier;
      
      const y = Math.round(baseY - energy);
      points.push({ x, y, frac });
    }
    
    // Draw the FES curve
    points.forEach((p, i) => {
      safeWrite(lines, p.x, p.y, '█');
      // Fill below the curve
      for (let y = p.y + 1; y <= baseY + 3; y++) {
        safeWrite(lines, p.x, y, '░');
      }
    });
    
    // X-axis
    for (let x = leftX; x <= rightX; x++) {
      safeWrite(lines, x, baseY + 4, '─');
    }
    writeText(lines, Math.floor((leftX + rightX) / 2) - 8, baseY + 6, 'Collective Variable (CV)');
    
    // Y-axis label
    writeText(lines, leftX - 8, Math.floor(rows * 0.4), 'ΔG');
    safeWrite(lines, leftX - 1, Math.floor(rows * 0.35), '↑');
    
    // State labels
    const state1X = leftX + Math.floor(width * 0.25);
    const state2X = leftX + Math.floor(width * 0.75);
    const barrierX = leftX + Math.floor(width * 0.5);
    
    writeText(lines, state1X - 1, baseY - 10, 'S1');
    writeText(lines, state2X - 1, baseY - 8, 'S2');
    writeText(lines, barrierX - 2, baseY - 15, 'TS‡');
    
    // Animated particle/ball rolling based on progress
    const ballFrac = (Math.sin(progress * Math.PI * 2 + t * 0.002) + 1) / 2; // oscillate
    const ballIdx = Math.floor(ballFrac * (points.length - 1));
    const ballPoint = points[Math.min(ballIdx, points.length - 1)];
    safeWrite(lines, ballPoint.x, ballPoint.y - 1, '●');
    
    // MSM transition arrows
    writeText(lines, state1X + 5, baseY - 5, '⇌');
    
    // Legend
    writeText(lines, rightX - 15, 3, 'MSM: 2 stany');
    writeText(lines, rightX - 15, 5, 'metastabilne');
  }

  // ============ DRAWING UTILITIES ============
  function drawProgressBar(lines, sceneIndex, sceneProgress) {
    const rows = lines.length;
    const cols = lines[0].length;
    const width = Math.min(cols - 10, 40);
    const left = Math.floor((cols - width) / 2);
    const barY = rows - 2;
    
    lines[barY][left] = '[';
    const totalProgress = (sceneIndex + sceneProgress) / SCENES.length;
    const filled = Math.floor(width * totalProgress);
    for (let i = 0; i < width; i++) {
      lines[barY][left + 1 + i] = i < filled ? '=' : '·';
    }
    lines[barY][left + width + 1] = ']';
  }

  function drawEllipse(lines, cx, cy, rx, ry, ch) {
    const steps = Math.max(24, Math.round((rx + ry) * 4));
    for (let i = 0; i < steps; i++) {
      const theta = (Math.PI * 2 * i) / steps;
      const x = Math.round(cx + Math.cos(theta) * rx);
      const y = Math.round(cy + Math.sin(theta) * ry);
      safeWrite(lines, x, y, ch);
    }
  }

  function safeWrite(lines, x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (y >= 0 && y < lines.length && x >= 0 && x < lines[0].length) {
      lines[y][x] = ch;
    }
  }

  function writeText(lines, x, y, text) {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= lines.length) return;
    for (let i = 0; i < text.length; i++) {
      const xi = x + i;
      if (xi >= 0 && xi < lines[0].length) {
        lines[y][xi] = text[i];
      }
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ============ STARTUP ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
