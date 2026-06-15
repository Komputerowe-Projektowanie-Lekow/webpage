// ══════════════════════════════════════════════════════════
//   PUT Drug Discovery PROTO-NOOS — app logic
// ══════════════════════════════════════════════════════════

// ─── 1. Tweaks ─────────────────────────────────────────────
const root = document.documentElement;
function applyTweaks() {
  root.setAttribute('data-variant', TWEAKS.variant);
  root.setAttribute('data-density', TWEAKS.density);
  root.setAttribute('data-font', TWEAKS.font);
  root.style.setProperty('--accent', TWEAKS.accent);
  // darker variant for terminal
  if (TWEAKS.variant === 'terminal') {
    root.style.setProperty('--accent-2', shade(TWEAKS.accent, -0.2));
  } else {
    root.style.setProperty('--accent-2', shade(TWEAKS.accent, -0.3));
  }
  // update active pills
  document.querySelectorAll('[data-tweak]').forEach(grp => {
    const key = grp.dataset.tweak;
    grp.querySelectorAll('[data-val]').forEach(b => {
      b.classList.toggle('active', String(b.dataset.val) === String(TWEAKS[key]));
    });
  });
  renderPipeline();
}
function shade(hex, amt) {
  const c = hex.replace('#','');
  const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  const adj = v => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return '#' + [adj(r),adj(g),adj(b)].map(v => v.toString(16).padStart(2,'0')).join('');
}
function setTweak(key, val) {
  TWEAKS[key] = val;
  applyTweaks();
  try { window.parent.postMessage({type:'__edit_mode_set_keys', edits:{[key]:val}}, '*'); } catch(e){}
}
document.querySelectorAll('[data-tweak]').forEach(grp => {
  grp.addEventListener('click', e => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    setTweak(grp.dataset.tweak, b.dataset.val);
  });
});
document.getElementById('tweaksToggle').addEventListener('click', () => {
  document.getElementById('tweaks-panel').classList.toggle('open');
});

// Edit-mode protocol
window.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === '__activate_edit_mode') document.getElementById('tweaks-panel').classList.add('open');
  if (d.type === '__deactivate_edit_mode') document.getElementById('tweaks-panel').classList.remove('open');
});
try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch(e){}

// ─── 2. Pipeline render (legacy ASCII — narrative panel now handles the animation) ─
let activeStage = -1;
function renderPipeline() {
  // no-op: narrative panel renders itself via pipeline-narrative.js
  // Tweaks panel's pipeline-layout switcher still posts the choice into localStorage
}

// ─── 3. Stage cards ────────────────────────────────────────
const STAGE_DETAIL = [
  { n:'00', key:'ouroboros', special:true, title:'Pętla Ouroboros', status:'live',
    tool:'Walidacja etapów', out:'EXP3 pilot15 top_n=10 · EXP2 0.575→0.625',
    desc:'Iteracyjne uczenie pipeline\'u na wynikach walidacji. Działa dziś jako inżynieryjna pętla; nie traktujemy jej jako w pełni autonomicznego systemu produkcyjnego.' },
  { n:'01', key:'generate', title:'Generate · REINVENT4', status:'live',
    tool:'REINVENT4', out:'12,797 rekordów → 12,581 valid',
    desc:'Generowanie i postprocess bibliotek SMILES z walidacją konfiguracji i deterministycznym zapisem artefaktów Stage 1.' },
  { n:'02', key:'retain', title:'Retain · CellTE', status:'live',
    tool:'Stage 2a/2b + CellTE', out:'~12.8k cząsteczek scored',
    desc:'Łączenie Stage 2a/2b z CellTE, aby oszacować retencję, entry score i wstępne target engagement przed strukturą Boltz2.' },
  { n:'03', key:'structure', title:'Structure · Boltz2', status:'stabilizing',
    tool:'Boltz2', out:'stage3_for_boltz2.csv (top 200)',
    desc:'Etap strukturalny generuje i porządkuje kandydatów do Boltz2 oraz ranking powinowactwa na podstawie przetworzonego summary.csv.' },
  { n:'04', key:'affinity', title:'Affinity · KD_pred + MD', status:'hardening',
    tool:'KD_pred converter', out:'stage4_output.csv (ranked)',
    desc:'Stage 4 konwertuje affinity_log_ic50 do KD_pred i sortuje wyniki deterministycznie przed przekazaniem do etapów dynamicznych.' },
  { n:'05', key:'dynamics', title:'Dynamics · GROMACS', status:'hardening',
    tool:'GROMACS', out:'stage3_for_gromacs.csv (top 50)',
    desc:'Stage 5 weryfikuje stabilność konformacyjną top 50 kandydatów. Raporty per-ligand; kontrakty CSV.' },
  { n:'06', key:'systems', title:'Systems · COBRApy / iML1515', status:'hardening',
    tool:'COBRApy, iML1515', out:'FBA · FVA · blindspot report',
    desc:'Stage 6A/6B — quality gates i wpływ metaboliczny. Raporty Stage6 dla pilot 20 i full 100.' },
];
const STATUS_LABELS = { live:'live · działa', stabilizing:'stabilizing', hardening:'active hardening' };

function renderStages() {
  const grid = document.getElementById('stageGrid');
  if (!grid) return;
  grid.innerHTML = STAGE_DETAIL.map((s,i) => `
    <article class="stage ${s.special?'special':''}" data-stage-index="${i-1}" data-key="${s.key}">
      <div class="stage-head">
        <span class="stage-num">${s.n}</span>
        <span class="stage-title">${s.title}</span>
        <span class="stage-status ${s.status}">${STATUS_LABELS[s.status]}</span>
      </div>
      <div class="stage-body">
        <p class="stage-tool"><span class="k">tool</span>${s.tool}</p>
        <p class="stage-out"><span class="k">output</span>${s.out}</p>
        <p class="stage-desc">${s.desc}</p>
      </div>
    </article>
  `).join('');
  grid.querySelectorAll('.stage').forEach(card => {
    card.addEventListener('click', () => {
      const isOpen = card.getAttribute('data-open') === 'true';
      grid.querySelectorAll('.stage').forEach(c => c.setAttribute('data-open','false'));
      card.setAttribute('data-open', isOpen ? 'false' : 'true');
      const idx = Number(card.dataset.stageIndex);
      activeStage = isOpen ? -1 : idx;
      if (idx >= 0 && window.PipelineNarrative) window.PipelineNarrative.jumpTo(idx);
    });
    card.addEventListener('mouseenter', () => {
      const idx = Number(card.dataset.stageIndex);
      if (idx >= 0 && window.PipelineNarrative) window.PipelineNarrative.jumpTo(idx);
    });
  });
}
renderStages();

// Role cards on Join page expand like stages
document.querySelectorAll('.role-card').forEach(card => {
  card.addEventListener('click', () => {
    const isOpen = card.getAttribute('data-open') === 'true';
    document.querySelectorAll('.role-card').forEach(c => c.setAttribute('data-open','false'));
    card.setAttribute('data-open', isOpen ? 'false' : 'true');
  });
});

// ─── 4. Tasks list ─────────────────────────────────────────
const TASKS = [
  { state:'progress', title:'EXP3 full10 rerun po synchronizacji', desc:'Potwierdzić przejście 90_stage6b i 99_finalize oraz komplet run_manifest.json / report.md.', meta:'active · notes/03_experiments' },
  { state:'open', title:'Ujednolicić kontrakt Stage6BInput', desc:'Zdecydować docelowo czy target_gene ma być w CSV, w CLI, czy w obu warstwach z twardą walidacją.', meta:'open · kontrakt' },
  { state:'open', title:'Powtórzyć EXP1 na Stage4 KD_pred ≥ 100', desc:'Porównać blindspot_rate między selekcją qed i rzeczywistym rankingiem KD_pred.', meta:'waiting · większy zbiór Stage 4' },
  { state:'progress', title:'Ustalić produkcyjne progi quality gates', desc:'Domknąć progi Stage 6A/6B (strict-quality-gates) i opisać je jako stały standard runów.', meta:'in progress' },
];
(function renderTasks() {
  const el = document.getElementById('tasksList');
  if (!el) return;
  el.innerHTML = TASKS.map((t,i) => `
    <div class="task">
      <div class="task-check ${t.state}" aria-hidden="true"></div>
      <div>
        <h3>T/${String(i+1).padStart(2,'0')} — ${t.title}</h3>
        <p>${t.desc}</p>
      </div>
      <span class="task-meta">${t.meta}</span>
    </div>
  `).join('');
})();

// ─── 5. Page switcher ──────────────────────────────────────
function go(name) {
  document.querySelectorAll('[data-page]').forEach(p => p.classList.toggle('active', p.dataset.page === name));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.nav === name));
  // Force-reveal any hidden animated children on the newly active page
  document.querySelectorAll(`[data-page="${name}"] .reveal`).forEach(el => el.classList.add('in'));
  window.scrollTo({top:0, behavior:'instant'});
  try { localStorage.setItem('sknwpl-page', name); } catch(e){}
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-nav]');
  if (t) { e.preventDefault(); go(t.dataset.nav); }
});
try {
  const saved = localStorage.getItem('sknwpl-page');
  if (saved) go(saved);
} catch(e){}

// ─── 6. Language ───────────────────────────────────────────
const I18N = {
  en: {
    'nav.home':'Home','nav.pipeline':'Pipeline','nav.status':'Status','nav.join':'Join','nav.support':'Support',
    'hero.h1':'Drug discovery for <em>Gram-negative</em> bacteria, guided by molecular evidence and biological constraints.',
    'hero.lead':'We generate candidates, filter for Gram-negative entry, model target binding and stability, then check cellular target engagement, metabolic impact and synthesis routes. Each step records the evidence used for ranking so weak signals and failed candidates stay visible.',
    'cta.join':'Join the team','cta.pipeline':'See pipeline',
    'facts.generated':'Molecules generated','facts.valid':'Valid after Stage 2a','facts.pass':'EXP2 surrogate pass-rate',
    'why.kicker':'Context','why.aside':'Why this matters',
    'why.title':'Bottlenecks appear between in-silico and real biological effect.',
    'why.p1':'Targeting Gram-negative bacteria is hard not because structural candidates are missing — there is an excess. The problem is that in-silico scoring misses retention and systems-metabolic consequences.',
    'why.l1':'<strong>Affinity alone is not enough</strong> if the molecule cannot stay in the cell.',
    'why.l2':'<strong>Selection without metabolic context</strong> skips systemic side effects.',
    'why.l3':'<strong>A pipeline is needed</strong> that reports artefacts and limits at every stage.',
    'why.note':'Note: the metrics below describe the current engineering status, not final biological claims.',
    'pipe.kicker':'PROTO-NOOS','pipe.title':'Six stages from SMILES to systems biology.',
    'pipe.intro':'Integrated CADD workflow targeting <em>E. coli</em>: from molecule generation (REINVENT4), through retention (CellTE) and structure (Boltz2), to dynamics (GROMACS) and systems validation (COBRApy/iML1515).',
    'pipe.chart':'Pipeline topology · layout:','pipe.details':'Full details and accordion',
    'pipe.title2':'Gram-Negative & Universal Bacteria — closed loop.',
    'pipe.intro2':'Click stage cards to expand details. Each stage has Pydantic contracts, deterministic artefacts and engineering status (live / stabilizing / hardening).',
    'pipe.stages':'Pipeline stages — click to expand',
    'pipe.ouroboros':'<strong>Ouroboros loop.</strong> Stage 6 results (blindspot, KD_pred, systems FBA/FVA) feed back as signal to Stage 1 generation and Stage 2 scoring. Today it runs as an engineering experiment loop — <em>not</em> a fully autonomous production system.',
    'status.title':'Repositories and current tasks.',
    'status.intro':'This view exists to speed up onboarding: what works, what is in progress and where you can step in.',
    'status.repos':'Main pipeline modules','status.tasks':'Open tasks right now',
    'repo1.title':'REINVENT4 + analysis + retention','repo1.desc':'Generation, filtering and scoring for Stage 3 input with large-library support.','repo1.meta':'env validations + log-driven hardening (2026-02-09)',
    'repo2.title':'CellTE + Boltz2 + GROMACS','repo2.desc':'Kinetic and structural stages with CSV contracts and pre/post Boltz2 steps.','repo2.meta':'top 200 → Boltz2, top 50 → GROMACS',
    'repo3.title':'Systems biology Stage 6A/6B','repo3.desc':'FBA/FVA, quality gates, target preflight and blindspot reports.','repo3.meta':'EXP1: pilot 20 + full 100',
    'join.title':'Join the PROTO-NOOS team.','join.text':'We are looking for people who want to build a reliable research pipeline and consistently close out engineering tasks. Autonomy, systematic debugging, clear progress communication.',
    'join.roles':'Work areas','join.expect':'What we expect','join.apply':'How to apply',
    'role1.title':'Infrastructure & automation','role1.desc':'Slurm, handoff, stage validations and run reliability.',
    'role2.title':'Molecular modeling','role2.desc':'REINVENT4, Boltz2, GROMACS, structural result interpretation.',
    'role3.title':'Systems biology','role3.desc':'Stage 6A/6B, quality gates, metabolic risk analysis.',
    'expect1':'<strong>Autonomy & delivery</strong> — from diagnosis to artefact.',
    'expect2':'<strong>Comfort with uncertainty</strong> — systematic debugging.',
    'expect3':'<strong>Clear progress communication</strong> — weekly rhythm.',
    'apply1':'Write to <a href="mailto:sknwpl@proton.me">contact email</a> about which area you want to enter and what problem you want to own.',
    'apply2':'After a short conversation you get a starter task and onboarding plan.',
    'apply.note':'What matters is delivery quality and iterative improvement, not formal credentials.',
    'support.title':'Support and partnership.','support.text':'If you want to accelerate this pipeline — below are concrete operational needs. We keep an open bottleneck registry; each entry has estimated impact.',
    'support.asks':'Concrete needs','support.cta':'Contact us','support.reassure':'Your data stays private. No spam. We reply in 3-4 working days.',
    'ask1.t':'Credits + HPC for Stage 1-6','ask1.d':'Repeatable full-chain runs: 20 pilot + 100 full. Dominant cost is GROMACS MD and Boltz2.',
    'ask2.t':'Experimental validation','ask2.d':'Wet-lab access for selected candidates after Stage 6 filters — closes the ouroboros loop.',
    'ask3.t':'Expert mentoring','ask3.d':'MD, FBA/COBRA and experimental design — consultation on quality-gate thresholds.',
    'footer.mission':'Mission','footer.mission.text':'This project was born from a dream of <em>computing</em> what seems impossible. The only question we look for an answer to — can a drug be designed <em>without a lab</em>?',
    'footer.contact':'Contact','footer.address':'PUT Drug Discovery<br>Poznan',
    'footer.partners':'Partners','footer.partners.text':'Open invitation to cooperate: hardware, grants, consulting, joint publications.',
  }
};
function setLang(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  if (lang === 'pl') {
    document.querySelectorAll('[data-i18n-original]').forEach(el => {
      el.innerHTML = el.dataset.i18nOriginal;
    });
  } else {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (I18N.en[key]) {
        if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = el.innerHTML;
        el.innerHTML = I18N.en[key];
      }
    });
  }
  try { localStorage.setItem('sknwpl-lang', lang); } catch(e){}
}
document.querySelectorAll('.lang-btn').forEach(b => {
  b.addEventListener('click', () => setLang(b.dataset.lang));
});
try {
  const savedLang = localStorage.getItem('sknwpl-lang');
  if (savedLang) setLang(savedLang);
} catch(e){}

// ─── 7. Command palette ────────────────────────────────────
const CMDK_ITEMS = [
  { label:'Go · Home', hint:'Nav', action:() => go('home') },
  { label:'Go · Pipeline', hint:'Nav', action:() => go('pipeline') },
  { label:'Go · Status', hint:'Nav', action:() => go('status') },
  { label:'Go · Join', hint:'Nav', action:() => go('join') },
  { label:'Go · Support', hint:'Nav', action:() => go('support') },
  { label:'Copy email', hint:'Action', action:() => navigator.clipboard.writeText('sknwpl@proton.me') },
  { label:'Switch language · Polski', hint:'Lang', action:() => setLang('pl') },
  { label:'Switch language · English', hint:'Lang', action:() => setLang('en') },
  { label:'Variant · Notebook', hint:'Tweak', action:() => setTweak('variant','notebook') },
  { label:'Variant · Terminal Ops', hint:'Tweak', action:() => setTweak('variant','terminal') },
  { label:'Open Tweaks panel', hint:'Tweak', action:() => document.getElementById('tweaks-panel').classList.add('open') },
];
const overlay = document.getElementById('cmdkOverlay');
const input = document.getElementById('cmdkInput');
const results = document.getElementById('cmdkResults');
let cmdkIdx = 0;
function openCmdk() { overlay.classList.add('open'); input.value=''; input.focus(); renderCmdk(); }
function closeCmdk() { overlay.classList.remove('open'); }
function renderCmdk() {
  const q = input.value.toLowerCase();
  const filtered = CMDK_ITEMS.filter(i => i.label.toLowerCase().includes(q));
  cmdkIdx = Math.min(cmdkIdx, filtered.length-1); if (cmdkIdx < 0) cmdkIdx = 0;
  results.innerHTML = filtered.length ? filtered.map((i,idx) => `
    <button class="cmdk-item ${idx===cmdkIdx?'active':''}" data-idx="${idx}">
      <span>${i.label}</span><span class="hint">${i.hint}</span>
    </button>
  `).join('') : '<div class="cmdk-item" style="opacity:0.5;">No matches</div>';
  results.querySelectorAll('[data-idx]').forEach(b => {
    b.addEventListener('click', () => { filtered[Number(b.dataset.idx)].action(); closeCmdk(); });
  });
}
document.getElementById('cmdkTrigger').addEventListener('click', openCmdk);
input.addEventListener('input', renderCmdk);
input.addEventListener('keydown', e => {
  const items = results.querySelectorAll('[data-idx]');
  if (e.key === 'ArrowDown') { cmdkIdx = (cmdkIdx+1) % items.length; renderCmdk(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { cmdkIdx = (cmdkIdx-1+items.length) % items.length; renderCmdk(); e.preventDefault(); }
  if (e.key === 'Enter') { items[cmdkIdx]?.click(); }
  if (e.key === 'Escape') { closeCmdk(); }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); }
});
overlay.addEventListener('click', e => { if (e.target === overlay) closeCmdk(); });

// ─── 8. Scroll progress ────────────────────────────────────
const progEl = document.getElementById('scrollProgress');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progEl.style.width = pct + '%';
}, { passive:true });

// ─── 9. Reveal on scroll (cards only — sections animate from display:none which breaks transitions) ──
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: 0.12 });
document.querySelectorAll('.stage, .card, .task').forEach(el => {
  el.classList.add('reveal'); io.observe(el);
});

// ─── 10. Kickoff ───────────────────────────────────────────
applyTweaks();

// Cycle narrative panel through stages subtly — narrative handles its own loop,
// so we just forward hover state into the stage-open UI.
document.addEventListener('visibilitychange', () => {});

// ─── 11. Protein simulation timestamp ticker ───────────────
const proteinTs = document.getElementById('proteinTs');
if (proteinTs && !document.getElementById('proteinAsciiScreen')) {
  let t = 0;
  setInterval(() => {
    if (document.hidden) return;
    t = (t + 2) % 10000;
    proteinTs.textContent = String(t).padStart(4, '0');
  }, 80);
}

// ─── 12. Stage-strip cells jump narrative panel ────────────
document.querySelectorAll('.strip-cell').forEach(cell => {
  cell.addEventListener('click', () => {
    const stage = parseInt(cell.dataset.stage, 10) - 1;
    if (window.PipelineNarrative) window.PipelineNarrative.jumpTo(stage);
    document.querySelectorAll('.nav-link').forEach(l => { if (l.dataset.nav === 'pipeline') l.click(); });
  });
  cell.addEventListener('mouseenter', () => {
    const stage = parseInt(cell.dataset.stage, 10) - 1;
    if (window.PipelineNarrative) window.PipelineNarrative.jumpTo(stage);
  });
});
