// PROTO-NOOS narrative ASCII animation — 6 scenes, easily extensible
// Renders into #pipe-screen / #pipe-ghost-1 / #pipe-ghost-2
// Designed to be easily extended with more stages later.

(function(){
  'use strict';

  const CONFIG = {
    fps: 22, speed: 0.55, charWidth: 7.4, lineHeight: 12.0,
    minCols: 56, maxCols: 140, minRows: 22, maxRows: 44,
    noiseThreshold: 1.94,
  };

  // Each scene = one pipeline stage (extend this array to add stages)
  const SCENES = [
    { id:'generate',  durationMs: 3600, kicker:'REINVENT4',        title:'Generowanie de novo',       meta:'12,797 SMILES → 12,581 valid',      label:'[REINVENT4 : generate]' },
    { id:'retain',    durationMs: 3600, kicker:'CellTE · Stage 2', title:'Retencja i engagement',     meta:'~12.8k cząsteczek scored',          label:'[CellTE : retention]' },
    { id:'structure', durationMs: 3600, kicker:'Boltz2 · Stage 3', title:'Predykcja struktury',       meta:'top 200 kandydatów',                label:'[Boltz2 : structure]' },
    { id:'affinity',  durationMs: 3600, kicker:'KD_pred · Stage 4',title:'Powinowactwo (KD)',         meta:'affinity_log_ic50 → KD_pred',       label:'[KD_pred : affinity]' },
    { id:'dynamics',  durationMs: 3600, kicker:'GROMACS · Stage 5',title:'Dynamika molekularna',      meta:'top 50 · MD 300 K',                 label:'[GROMACS : dynamics]' },
    { id:'systems',   durationMs: 3600, kicker:'COBRApy · Stage 6',title:'Biologia systemowa',        meta:'iML1515 · FBA · FVA · blindspot',   label:'[iML1515 : systems]' },
  ];
  const TOTAL = SCENES.reduce((s,x)=>s+x.durationMs, 0);

  const root = document.getElementById('pipe-narrative');
  const rootB = document.getElementById('pipe-narrative-big');
  if (!root && !rootB) return;
  const refRoot = root || rootB;
  const screen = document.getElementById('pipe-screen');
  const g1 = document.getElementById('pipe-ghost-1');
  const g2 = document.getElementById('pipe-ghost-2');
  const screenB = document.getElementById('pipe-screen-b');
  const g1B = document.getElementById('pipe-ghost-1b');
  const g2B = document.getElementById('pipe-ghost-2b');
  const ovKicker = document.getElementById('pipe-kicker');
  const ovTitle  = document.getElementById('pipe-title');
  const ovMeta   = document.getElementById('pipe-meta');
  const ovProg   = document.getElementById('pipe-progress');
  const ovKickerB = document.getElementById('pipe-kicker-b');
  const ovTitleB  = document.getElementById('pipe-title-b');
  const ovMetaB   = document.getElementById('pipe-meta-b');
  const ovProgB   = document.getElementById('pipe-progress-b');

  let raf=null, running=false, frame=0, last=0;
  let dims = { cols:90, rows:34 };
  let buf = null;

  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function visibleRoot(){
    // whichever panel is currently in a visible page
    const candidates = [root, rootB].filter(Boolean);
    for(const c of candidates){
      const page = c.closest('[data-page]');
      if(!page || page.classList.contains('active')) return c;
    }
    return refRoot;
  }
  function resize(){
    const r = visibleRoot();
    const w = r.clientWidth || window.innerWidth*0.5;
    const h = (r.querySelector('.narrative-stage')?.clientHeight) || r.clientHeight || window.innerHeight*0.5;
    dims.cols = clamp(Math.floor(w/CONFIG.charWidth), CONFIG.minCols, CONFIG.maxCols);
    dims.rows = clamp(Math.floor(h/CONFIG.lineHeight), CONFIG.minRows, CONFIG.maxRows);
    buf = null;
  }
  function safeW(lines,x,y,ch){ x=Math.round(x); y=Math.round(y); if(y>=0&&y<lines.length&&x>=0&&x<lines[0].length) lines[y][x]=ch; }
  function writeT(lines,x,y,t){ for(let i=0;i<t.length;i++) safeW(lines, x+i, y, t[i]); }
  function ellipse(lines,cx,cy,rx,ry,ch){ const n=Math.max(24,Math.round((rx+ry)*4)); for(let i=0;i<n;i++){ const th=(Math.PI*2*i)/n; safeW(lines, cx+Math.cos(th)*rx, cy+Math.sin(th)*ry*0.55, ch);} }

  function state(ms){
    const t=((ms%TOTAL)+TOTAL)%TOTAL; let c=0;
    for(let i=0;i<SCENES.length;i++){
      const s=SCENES[i], e=c+s.durationMs;
      if(t<e||i===SCENES.length-1) return { ...s, index:i, progress: clamp((t-c)/s.durationMs,0,1) };
      c=e;
    }
    return SCENES[0];
  }

  function drawNoise(lines, t){
    const R=lines.length, C=lines[0].length;
    for(let y=0;y<R;y++) for(let x=0;x<C;x++){
      const s = Math.sin(x*0.11 + y*0.08 + t*0.0004) + Math.cos(x*0.03 - y*0.1 + t*0.0003);
      if(s>CONFIG.noiseThreshold) lines[y][x]='·';
    }
  }
  function drawProgressBar(){}

  // ============ SCENES ============
  function scGenerate(L,t,p){
    const R=L.length, C=L[0].length;
    // Molecules popping in from left, flowing right
    const cx = Math.floor(C*0.5), cy=Math.floor(R*0.5);
    // cloud of SMILES rings
    const n = 22;
    for(let i=0;i<n;i++){
      const ang = i*0.3 + t*0.002;
      const rad = 8 + (i%5)*2 + Math.sin(t*0.003+i)*1.5;
      const x = cx + Math.cos(ang)*rad*1.6;
      const y = cy + Math.sin(ang)*rad*0.7;
      const ch = ['O','N','C','o','·','*'][i%6];
      safeW(L, x, y, ch);
    }
    // center seed
    writeT(L, cx-3, cy, 'C=N-C');
    writeT(L, cx-5, cy+2, '  \\|/');
    writeT(L, cx-5, cy+3, '   O');
    // counter
  }

  function scRetain(L,t,p){
    const R=L.length, C=L[0].length;
    // Membrane bands top and bottom, molecules trying to cross
    const midY = Math.floor(R*0.5);
    for(let x=3;x<C-3;x++){
      safeW(L, x, midY-3, '═'); safeW(L, x, midY-2, '═');
      safeW(L, x, midY+3, '═'); safeW(L, x, midY+4, '═');
    }
    writeT(L, 4, midY-4, 'outer membrane');
    writeT(L, 4, midY+5, 'cytoplasm');
    // particles drifting down, some pass, some bounce
    const n=14;
    for(let i=0;i<n;i++){
      const seed = i*97 + Math.floor(t*0.02);
      const xPos = 6 + ((seed*31)%(C-12));
      const phase = (t*0.008 + i*1.1) % 10;
      const yPos = midY - 6 + phase;
      const passed = (seed%3)!==0;
      if(yPos>midY+4) continue;
      const ch = passed ? 'o' : 'x';
      safeW(L, xPos, yPos, ch);
      if(!passed && yPos>midY-3 && yPos<midY+3) safeW(L, xPos, midY-2, '!');
    }
  }

  function scStructure(L,t,p){
    const R=L.length, C=L[0].length;
    const cx=Math.floor(C*0.5), cy=Math.floor(R*0.5);
    // Rotating ribbon-like protein
    const tw = t*0.003;
    for(let i=-16;i<=16;i++){
      const y = cy + Math.round(Math.sin(i*0.4 + tw)*4);
      const x = cx + i;
      const ch = (i%3===0) ? '#' : (i%2===0 ? '=' : '-');
      safeW(L, x, y, ch);
      safeW(L, x, y+1, '·');
    }
    // pocket highlight
    ellipse(L, cx+4, cy+1, 3, 2, '○');
    writeT(L, cx+2, cy-4, 'binding pocket');
    writeT(L, cx-18, cy, '→');
    writeT(L, cx+18, cy, '→');
  }

  function scAffinity(L,t,p){
    const R=L.length, C=L[0].length;
    // Bar-chart-like ranking with KD values
    const baseY = R - 7;
    const bars = 12;
    const left = Math.floor(C*0.18);
    for(let i=0;i<bars;i++){
      const val = 2 + Math.sin(i*0.7 + t*0.004)*1.4 + (bars-i)*0.6;
      const h = Math.round(val*1.4);
      const x = left + i*4;
      for(let y=0;y<h;y++){
        safeW(L, x, baseY-y, '█');
        safeW(L, x+1, baseY-y, '█');
      }
      safeW(L, x, baseY+1, '─'); safeW(L, x+1, baseY+1, '─');
    }
    writeT(L, left-3, baseY-18, 'KD ↑');
    writeT(L, left + bars*4 - 4, baseY+3, 'rank →');
  }

  function scDynamics(L,t,p){
    const R=L.length, C=L[0].length;
    const cx=Math.floor(C*0.5), cy=Math.floor(R*0.5);
    // Wobbling complex — two blobs connected
    const wob = Math.sin(t*0.006);
    ellipse(L, cx-6+wob, cy, 5, 4, '#');
    ellipse(L, cx+5-wob, cy-1, 3, 2, '@');
    // RMSD trace
    const left = 6, right = C-6, baseY = R-8;
    for(let x=left;x<right;x++){
      const f = (x-left)/(right-left);
      const v = 1 + Math.sin(f*12 + t*0.004)*1.2 + (1-p)*0.5;
      safeW(L, x, Math.round(baseY - v), '·');
    }
    writeT(L, left, baseY+2, 'RMSD ↔ time');
  }

  function scSystems(L,t,p){
    const R=L.length, C=L[0].length;
    const cx=Math.floor(C*0.5), cy=Math.floor(R*0.5);
    // Metabolic network: nodes + edges
    const nodes = [
      [cx-18, cy-6,'G6P'],[cx-8, cy-8,'F6P'],[cx+2, cy-6,'PEP'],[cx+14, cy-8,'PYR'],
      [cx-16, cy+3,'NAD'],[cx-4, cy+4,'ACoA'],[cx+8, cy+4,'αKG'],[cx+18, cy+2,'OAA'],
      [cx-10, cy+9,'iML1515'],[cx+6, cy+9,'FBA'],
    ];
    // edges
    for(let i=0;i<nodes.length-1;i++){
      const [x1,y1]=nodes[i], [x2,y2]=nodes[i+1];
      const steps=Math.abs(x2-x1)+Math.abs(y2-y1);
      for(let s=0;s<steps;s+=2){
        const x=Math.round(x1+(x2-x1)*s/steps);
        const y=Math.round(y1+(y2-y1)*s/steps);
        safeW(L, x, y, '·');
      }
    }
    // nodes
    const blink = Math.floor(t*0.005)%nodes.length;
    nodes.forEach((n,i)=>{
      const [x,y,lab]=n;
      safeW(L, x-1,y,'['); safeW(L, x+lab.length, y, ']');
      writeT(L, x, y, lab);
      if(i===blink) safeW(L, x-2, y, '▶');
    });
  }

  const DRAW = { generate:scGenerate, retain:scRetain, structure:scStructure, affinity:scAffinity, dynamics:scDynamics, systems:scSystems };

  function render(fr){
    const totalFrames = Math.round((TOTAL/1000)*CONFIG.fps);
    const nf = ((fr%totalFrames)+totalFrames)%totalFrames;
    const ms = (nf/CONFIG.fps)*1000;
    const sc = state(ms);
    const setOv = (k,t,m,p) => {
      if(ovKicker) ovKicker.textContent = sc.kicker;
      if(ovTitle)  ovTitle.textContent  = sc.title;
      if(ovMeta)   ovMeta.textContent   = sc.meta;
      if(ovProg)   ovProg.textContent   = `${sc.index+1} / ${SCENES.length}`;
      if(ovKickerB) ovKickerB.textContent = sc.kicker;
      if(ovTitleB)  ovTitleB.textContent  = sc.title;
      if(ovMetaB)   ovMetaB.textContent   = sc.meta;
      if(ovProgB)   ovProgB.textContent   = `${sc.index+1} / ${SCENES.length}`;
    };
    setOv();
    if(root) root.setAttribute('data-scene', sc.id);
    if(rootB) rootB.setAttribute('data-scene', sc.id);

    const {cols:C, rows:R} = dims;
    if(!buf || buf.length!==R || buf[0].length!==C){
      buf = Array.from({length:R}, ()=>Array(C).fill(' '));
    } else {
      for(let y=0;y<R;y++) buf[y].fill(' ');
    }
    drawNoise(buf, ms);
    DRAW[sc.id]?.(buf, ms, sc.progress);
    writeT(buf, 2, 1, sc.label);
    drawProgressBar(buf, sc.index, sc.progress);
    const text = buf.map(r=>r.join('')).join('\n');
    if(screen)  screen.textContent = text;
    if(g1)      g1.textContent = text;
    if(g2)      g2.textContent = text;
    if(screenB) screenB.textContent = text;
    if(g1B)     g1B.textContent = text;
    if(g2B)     g2B.textContent = text;
  }

  function tick(now){
    if(!running) return;
    const interval = (1000/CONFIG.fps) / CONFIG.speed;
    if(now-last >= interval){ last=now; render(frame++); }
    raf = requestAnimationFrame(tick);
  }
  function start(){ if(running) return; running=true; last=performance.now(); raf=requestAnimationFrame(tick); }
  function stop(){ running=false; if(raf) cancelAnimationFrame(raf); raf=null; }

  function init(){
    resize();
    render(0);
    const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? start() : stop()); }, { threshold: [0, 0.05, 0.3] });
    if(root) io.observe(root);
    if(rootB) io.observe(rootB);
    window.addEventListener('resize', () => { resize(); render(frame); });
    // Re-measure + re-render when switching pages (since the big panel becomes visible only on Pipeline page)
    const mo = new MutationObserver(() => { resize(); render(frame); start(); });
    document.querySelectorAll('[data-page]').forEach(p => mo.observe(p, { attributes:true, attributeFilter:['class'] }));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { stop(); render(0); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // expose for integration
  window.PipelineNarrative = { SCENES, jumpTo(i){ frame = Math.floor(((SCENES.slice(0,i).reduce((s,x)=>s+x.durationMs,0))/1000)*CONFIG.fps); render(frame); } };
})();
