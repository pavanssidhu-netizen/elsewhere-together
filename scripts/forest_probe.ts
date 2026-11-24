// Dev probe: how does the planner fare on raw (unverified) candidates, per template and character?
//   npx vite-node scripts/forest_probe.ts -- 60
import { candidateConfig, TEMPLATE_IDS } from '../src/sim/puzzle';
import { planOnce } from '../src/sim/verify';
const n = Number(process.argv[process.argv.length - 1]) || 40;
const rows: Record<string, { n: number; win: number; secs: number[]; fade: number; to: number; ex?: string }> = {};
for (const ch of ['SAM', 'JENSEN'] as const) for (let seed = 1; seed <= n; seed++) {
  const cfg = candidateConfig(seed, 0, ch);
  const r = planOnce(seed, cfg, 180);
  const k = ch + ' ' + cfg.template;
  const x = (rows[k] ??= { n: 0, win: 0, secs: [], fade: 0, to: 0 });
  x.n++; if (r.won) { x.win++; x.secs.push(r.seconds); } else { if (r.fade) x.fade++; else x.to++; x.ex ??= `seed ${seed} ${cfg.sig} t=${r.seconds} steps=${r.steps}`; }
}
for (const [k, x] of Object.entries(rows).sort()) {
  const m = [...x.secs].sort((a, b) => a - b);
  console.log(k.padEnd(22), `n=${x.n} win=${x.win} fade=${x.fade} timeout=${x.to} med=${m[Math.floor(m.length / 2)] ?? '-'} max=${m[m.length - 1] ?? '-'}`, x.ex ?? '');
}
