// npx vite-node scripts/forest_verify_stats.ts -- 300
import { verifiedConfig, planOnce } from '../src/sim/verify';
const n = Number(process.argv[process.argv.length - 1]) || 100;
const sigs = new Set<string>(); const tpl: Record<string, number> = {}; const att: number[] = []; const secs: number[] = [];
const t0 = Date.now();
for (const ch of ['SAM', 'JENSEN'] as const) for (let seed = 1; seed <= n; seed++) {
  const { cfg, attempts } = verifiedConfig(seed, ch);
  sigs.add(cfg.sig); tpl[ch + ' ' + cfg.template] = (tpl[ch + ' ' + cfg.template] ?? 0) + 1; att.push(attempts);
  secs.push(planOnce(seed, cfg).seconds);
}
secs.sort((a, b) => a - b);
console.log('distinct sigs', sigs.size, 'of', 2 * n, 'ms', Date.now() - t0);
console.log('attempts mean', (att.reduce((a, b) => a + b, 0) / att.length).toFixed(2), 'max', Math.max(...att));
console.log('model secs median', secs[Math.floor(secs.length / 2)], 'p90', secs[Math.floor(secs.length * 0.9)], 'max', secs[secs.length - 1]);
console.log(tpl);
