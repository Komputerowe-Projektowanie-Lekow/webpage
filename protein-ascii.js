import { FPS, FRAMES } from './frames.js';

(function () {
  'use strict';

  const frameEl = document.getElementById('proteinFrame');
  const backdropEl = document.getElementById('proteinBackdrop');
  const screen = document.getElementById('proteinAsciiScreen') || document.getElementById('proteinBackdropScreen');
  const ghost1 = document.getElementById('proteinAsciiGhost1') || document.getElementById('proteinBackdropGhost1');
  const ghost2 = document.getElementById('proteinAsciiGhost2') || document.getElementById('proteinBackdropGhost2');
  const ts = document.getElementById('proteinTs');
  const scrub = document.getElementById('proteinScrub');
  const hostEl = frameEl || backdropEl;
  if (!hostEl || !screen || !FRAMES.length) return;

  const targets = [screen, ghost1, ghost2].filter(Boolean);
  const parsed = FRAMES.map(frame => frame.split('\n'));
  const sourceRows = parsed[0]?.length || 1;
  const sourceCols = parsed[0]?.[0]?.length || 1;
  const rawBackdrop = Boolean(backdropEl && !frameEl);
  const charSize = rawBackdrop ? { w: 4.9, h: 7.4 } : { w: 7.1, h: 10.6 };
  let dims = rawBackdrop ? { cols: 260, rows: 92 } : { cols: 98, rows: 30 };
  let frame = Math.floor(FRAMES.length * 0.18);
  let raf = null;
  let last = 0;
  let running = false;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resize() {
    const rect = hostEl.getBoundingClientRect();
    if (rawBackdrop) {
      dims.cols = sourceCols;
      dims.rows = sourceRows;
    } else {
      dims.cols = clamp(Math.floor((rect.width - 30) / charSize.w), 58, 138);
      dims.rows = clamp(Math.floor((rect.height - 42) / charSize.h), 18, 44);
    }
    paint();
  }

  function crop(lines) {
    const cols = Math.min(dims.cols, sourceCols);
    const rows = Math.min(dims.rows, sourceRows);
    const x0 = rawBackdrop ? 0 : Math.max(0, Math.floor((sourceCols - cols) * 0.5));
    const y0 = rawBackdrop ? 0 : Math.max(0, Math.floor((sourceRows - rows) * 0.5));
    const view = [];

    for (let y = 0; y < rows; y += 1) {
      view.push((lines[y0 + y] || '').slice(x0, x0 + cols).padEnd(cols, ' '));
    }

    return view.join('\n');
  }

  function paint() {
    const i = ((frame % parsed.length) + parsed.length) % parsed.length;
    const text = crop(parsed[i]);
    targets.forEach(el => {
      el.textContent = text;
      el.setAttribute('data-ready', 'true');
    });
    if (ts) ts.textContent = String(Math.round((i / (FPS || 20)) * 1000)).padStart(4, '0');
    if (scrub) scrub.style.setProperty('--protein-progress', `${(i / Math.max(1, parsed.length - 1)) * 100}%`);
  }

  function tick(now) {
    if (!running) return;
    const interval = 1000 / (FPS || 20);
    if (now - last >= interval) {
      frame += 1;
      last = now;
      paint();
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  resize();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? start() : stop());
  }, { threshold: 0.08 });
  observer.observe(hostEl);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
})();
