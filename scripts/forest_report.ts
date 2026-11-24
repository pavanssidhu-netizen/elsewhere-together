// npx vite-node scripts/forest_report.ts -- 100   : headless proof table for the forest (model clock: 0.3 s/tile, 1.2 s/interaction, partner tick 3 s)
import { play, plannerPolicy, idlePolicy, recklessPolicy, novicePolicy } from '../src/dc/forest/headless';
const n = Number(process.argv[process.argv.length - 1]) || 100;
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
type Row = [string, (seed: number, ch: 'SAM' | 'JENSEN') => ReturnType<typeof play>];
const rows: Row[] = [
  ['planner', (s, c) => play(s, c, plannerPolicy)],
  ['planner, partner frozen', (s, c) => play(s, c, plannerPolicy, { frozenPartner: true })],
  ['idle (do nothing)', (s, c) => play(s, c, idlePolicy)],
  ['reckless', (s, c) => play(s, c, recklessPolicy(s))],
  ['novice (hints, +1.5s think)', (s, c) => play(s, c, novicePolicy(s), { think: 1.5 })],
  ['novice, relaxed 300s', (s, c) => play(s, c, novicePolicy(s), { think: 1.5, relaxed: true })],
];
console.log('policy'.padEnd(30), 'char'.padEnd(7), 'win%'.padStart(6), 'medSec'.padStart(7), 'p90'.padStart(6), 'fade%'.padStart(6));
for (const [name, f] of rows) for (const ch of ['SAM', 'JENSEN'] as const) {
  const secs: number[] = []; let w = 0, fade = 0;
  for (let seed = 1; seed <= n; seed++) { const r = f(seed, ch); if (r.won) { w++; secs.push(r.seconds); } if (r.model.faded) fade++; }
  secs.sort((a, b) => a - b);
  console.log(name.padEnd(30), ch.padEnd(7), (100 * w / n).toFixed(0).padStart(6), String(med(secs)).padStart(7), String(secs[Math.floor(secs.length * 0.9)] ?? '-').padStart(6), (100 * fade / n).toFixed(0).padStart(6));
}
// what each character has to do (planner action histogram)
for (const ch of ['SAM', 'JENSEN'] as const) {
  const h = new Map<string, number>(); let runs = 0;
  for (let seed = 1; seed <= n; seed++) { const r = play(seed, ch, plannerPolicy); runs++; for (const k of r.actions.keys()) h.set(k, (h.get(k) ?? 0) + 1); }
  console.log(ch, 'share of runs using each action:', [...h.entries()].sort().map(([k, v]) => `${k}:${Math.round(100 * v / runs)}%`).join(' '));
}
