// Dev: print the planner trace of one config. npx vite-node scripts/forest_trace.ts -- SAM 15 [attempt]
import { candidateConfig } from '../src/sim/puzzle';
import { newEngine, modelRun } from '../src/sim/verify';
import { planStep, objectiveHint } from '../src/sim/planner';
const a = process.argv.slice(-3).filter(x => x !== '--');
const [ch, seed, att] = [a[0] as 'SAM' | 'JENSEN', Number(a[1]), Number(a[2] ?? 0)];
const cfg = candidateConfig(seed, att, ch);
console.log(cfg.sig);
const e = newEngine(seed, cfg);
let last = '';
const r = modelRun(e, s => {
  const c = planStep(s)!; const h = objectiveHint(s);
  const line = `${JSON.stringify(c)} :: ${h.text}`;
  const t = `${s.v2.tick}|f${s.player.inventory.fuel}|p${s.player.inventory.plank}|${s.link}|d${Math.round(s.realityDrift)}|s${Math.round(s.bondStrain)}|${s.partner.site}${s.partner.crossed ? 'X' : ''}`;
  if (c.type !== 'MOVE' || line !== last) console.log(t, line);
  last = line; return c;
});
console.log(r.won, r.seconds, 'fade', r.fade, 'steps', r.steps);
const s = r.state;
console.log('player flags', s.nodes[s.player.nodeId].flags.join(','), 'water', s.nodes[s.player.nodeId].world.water);
console.log('partner flags', s.nodes[s.partner.nodeId].flags.join(','), s.partner.site, 'crossed', s.partner.crossed, 'knows', s.partner.knowledge, 'heard', s.partner.heard, 'inv', JSON.stringify(s.partner.inventory), JSON.stringify(s.partner.taken));
console.log('contact', s.v2.contact, 'pending', s.v2.pendingContact);
