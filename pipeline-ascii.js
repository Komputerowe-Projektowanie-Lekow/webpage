// Custom ASCII pipeline diagram generator for PUT Drug Discovery PROTO-NOOS
// Renders a proper 6-stage flow with Ouroboros feedback loop

window.PipelineASCII = (() => {
  const STAGES = [
    { n: '01', name: 'GENERATE',  tool: 'REINVENT4',      out: '12,797 SMILES' },
    { n: '02', name: 'RETAIN',    tool: 'CellTE / 2a/2b', out: '~12.8k scored' },
    { n: '03', name: 'STRUCTURE', tool: 'Boltz2',         out: 'top 200' },
    { n: '04', name: 'AFFINITY',  tool: 'KD_pred + MD',   out: 'ranked' },
    { n: '05', name: 'DYNAMICS',  tool: 'GROMACS',        out: 'top 50' },
    { n: '06', name: 'SYSTEMS',   tool: 'COBRApy/iML1515',out: 'FBA/FVA' },
  ];

  // Compact horizontal diagram (works well on wide screens)
  function renderHorizontal(activeIdx = -1) {
    const box = (s, active) => {
      const head = active ? '▣' : '▢';
      const lines = [
        `┌────────────┐`,
        `│ ${head} ${s.n}      │`,
        `│ ${s.name.padEnd(10)} │`,
        `│ ${s.tool.slice(0,10).padEnd(10)} │`,
        `│ ${s.out.slice(0,10).padEnd(10)} │`,
        `└─────┬──────┘`,
      ];
      return lines;
    };

    const arrow = [
      `              `,
      `              `,
      `   ──────▶    `,
      `              `,
      `              `,
      `              `,
    ];

    // Build row by row
    const rows = Array(6).fill('').map(() => '');
    STAGES.forEach((s, i) => {
      const b = box(s, i === activeIdx);
      b.forEach((ln, r) => { rows[r] += ln; });
      if (i < STAGES.length - 1) {
        arrow.forEach((ln, r) => { rows[r] += ln; });
      }
    });

    // Feedback loop beneath
    const totalWidth = rows[0].length;
    const loop = [
      '',
      '      ▲' + '─'.repeat(totalWidth - 14) + '┐',
      '      │  ◀── ouroboros feedback loop: results retrain the models',
      '      └' + '─'.repeat(totalWidth - 14) + '┘',
    ];

    return rows.join('\n') + '\n' + loop.join('\n');
  }

  // Vertical diagram for narrow/mobile
  function renderVertical(activeIdx = -1) {
    const lines = [];
    STAGES.forEach((s, i) => {
      const active = i === activeIdx;
      const head = active ? '▣' : '▢';
      lines.push(`  ┌──────────────────────────────┐`);
      lines.push(`  │ ${head} STAGE ${s.n}  ${s.name.padEnd(14)} │`);
      lines.push(`  │   ${s.tool.padEnd(26)} │`);
      lines.push(`  │   → ${s.out.padEnd(24)} │`);
      lines.push(`  └──────────────┬───────────────┘`);
      if (i < STAGES.length - 1) {
        lines.push(`                 ▼`);
      }
    });
    lines.push('                 │');
    lines.push('    ┌────────────┴────────────┐');
    lines.push('    │   ouroboros feedback    │');
    lines.push('    │   retrains models       │');
    lines.push('    └─────────────────────────┘');
    return lines.join('\n');
  }

  // A more illustrative "pipeline-as-system" diagram
  function renderSystem(activeIdx = -1) {
    const hit = (i) => i === activeIdx ? '█' : '·';
    return `
    ╔══════════════════════════════════════════════════════════════════════╗
    ║                            PROTO-NOOS                              ║
    ╠══════════════════════════════════════════════════════════════════════╣
    ║                                                                      ║
    ║   ┌─ in silico ───────────────┐     ┌─ structural ─────────────────┐ ║
    ║   │ ${hit(0)} 01 REINVENT4   ───▶   │     │ ${hit(2)} 03 Boltz2         ───▶ │ ║
    ║   │ ${hit(1)} 02 CellTE      ───▶   │────▶│ ${hit(3)} 04 KD / MD        ───▶ │ ║
    ║   │   12,797 → 12,581 valid   │     │   top 200 → ranked           │ ║
    ║   └───────────────────────────┘     └──────────────┬───────────────┘ ║
    ║                                                    │                 ║
    ║   ┌─ systems biology ─────────────────────────────▼───────────────┐  ║
    ║   │ ${hit(4)} 05 GROMACS (dynamics)   top 50                            │  ║
    ║   │ ${hit(5)} 06 COBRApy / iML1515    FBA · FVA · blindspot report     │  ║
    ║   └────────────────────────────────┬───────────────────────────────┘  ║
    ║                                    │                                  ║
    ║        ╭──── ouroboros ────────────┘                                  ║
    ║        │    feedback + retrain                                        ║
    ║        ▼                                                              ║
    ║   ┌────────────────┐                                                  ║
    ║   │ candidates.csv │  →  validation   →  run_manifest.json           ║
    ║   └────────────────┘                                                  ║
    ║                                                                      ║
    ╚══════════════════════════════════════════════════════════════════════╝`;
  }

  return { STAGES, renderHorizontal, renderVertical, renderSystem };
})();
