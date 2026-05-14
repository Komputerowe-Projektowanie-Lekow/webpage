import { FPS, FRAMES } from './protein-frames-lite.js';

(function () {
  'use strict';

  const frameEl = document.getElementById('proteinFrame');
  const backdropEl = document.getElementById('proteinBackdrop');
  const screen = document.getElementById('proteinAsciiScreen') || document.getElementById('proteinBackdropScreen');
  const ts = document.getElementById('proteinTs');
  const scrub = document.getElementById('proteinScrub');
  const hostEl = frameEl || backdropEl;
  if (!hostEl || !screen || !FRAMES.length) return;

  const isBackdrop = Boolean(backdropEl && !frameEl);
  const config = isBackdrop
    ? { charW: 4.8, charH: 6.4, minCols: 96, maxCols: 180, minRows: 42, maxRows: 104 }
    : { charW: 7.1, charH: 10.6, minCols: 58, maxCols: 138, minRows: 18, maxRows: 44 };
  const parsed = FRAMES.map(frame => frame.split('\n'));
  const sourceRows = parsed[0].length;
  const sourceCols = parsed[0][0].length;
  let dims = { cols: sourceCols, rows: sourceRows };
  let frame = Math.floor(parsed.length * 0.18);
  let raf = 0;
  let lastPaint = 0;
  let running = false;
  let resizeTimer = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function crop(lines) {
    const cols = Math.min(dims.cols, sourceCols);
    const rows = Math.min(dims.rows, sourceRows);
    const x0 = Math.max(0, Math.floor((sourceCols - cols) * 0.5));
    const y0 = Math.max(0, Math.floor((sourceRows - rows) * (isBackdrop ? 0.42 : 0.5)));
    const view = [];

    for (let y = 0; y < rows; y += 1) {
      view.push((lines[y0 + y] || '').slice(x0, x0 + cols).padEnd(cols, ' '));
    }

    return view.join('\n');
  }

  function paint(now) {
    const index = ((frame % parsed.length) + parsed.length) % parsed.length;
    screen.textContent = crop(parsed[index]);
    screen.setAttribute('data-ready', 'true');
    if (ts) ts.textContent = String(Math.round(now % 10000)).padStart(4, '0');
    if (scrub) scrub.style.setProperty('--protein-progress', `${(index / Math.max(1, parsed.length - 1)) * 100}%`);
  }

  function tick(now) {
    if (!running) return;
    const interval = 1000 / (FPS || 12);
    if (now - lastPaint >= interval) {
      frame += 1;
      lastPaint = now;
      paint(now);
    }
    raf = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastPaint = 0;
    raf = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const rect = hostEl.getBoundingClientRect();
    dims.cols = clamp(Math.floor(rect.width / config.charW), config.minCols, config.maxCols);
    dims.rows = clamp(Math.floor(rect.height / config.charH), config.minRows, config.maxRows);
    paint(performance.now());
  }

  function scheduleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 80);
  }

  resize();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) start();
      else stop();
    });
  }, { threshold: 0.08 });
  observer.observe(hostEl);
  start();

  window.addEventListener('resize', scheduleResize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
})();
