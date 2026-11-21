// Regenerates src/sim/tests/replays/{win,fade,secret}.json (+ .trace.jsonl event traces). Run: npx vite-node scripts/gen_replays.ts
process.env.BOTS_NO_MAIN = '1';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SimEngine } from '../src/sim/engine';
import type { Command } from '../src/sim/types';

const { runBot } = await import('./bots');
mkdirSync('src/sim/tests/replays', { recursive: true });

function save(name: string, policy: Parameters<typeof runBot>[0], seed: number, want: 'WIN' | 'FADE', secret = false): void {
  let r = runBot(policy, seed);
  for (let i = seed; (r.outcome !== want || (secret && !r.secret)) && i < seed + 300; i++) r = runBot(policy, i);
  if (r.outcome !== want || (secret && !r.secret)) throw new Error('no ' + name + ' seed found');
  const e = new SimEngine(r.seed, undefined, true);
  const trace: string[] = [];
  for (const c of r.commands as Command[]) {
    const evs = e.dispatch(c);
    const keep = evs.filter(x => x.type !== 'REJECTED' || true);
    trace.push(JSON.stringify({ tick: e.getState().v2.tick, cmd: c, events: keep }));
  }
  writeFileSync(`src/sim/tests/replays/${name}.json`, JSON.stringify({ seed: r.seed, policy, expect: want, secret, commands: r.commands }));
  writeFileSync(`src/sim/tests/replays/${name}.trace.jsonl`, trace.join('\n') + '\n');
  console.log(name, 'seed', r.seed, policy, r.outcome, 'cmds', r.commands.length);
}
save('win', 'planner', 1, 'WIN');
// V5: the fade replay is a genuine cascade (divert -> fire in dry brush -> forced calls), not idleness
{
  const { proofScripts } = await import('../src/sim/proofs');
  const e = new SimEngine(5, undefined, true); const trace: string[] = [];
  for (const c of proofScripts.B) trace.push(JSON.stringify({ tick: e.getState().v2.tick, cmd: c, events: e.dispatch(c) }));
  if (e.getState().phase !== 'FADE') throw new Error('proof B did not fade');
  writeFileSync('src/sim/tests/replays/fade.json', JSON.stringify({ seed: 5, policy: 'proofB', expect: 'FADE', secret: false, commands: proofScripts.B }));
  writeFileSync('src/sim/tests/replays/fade.trace.jsonl', trace.join('\n') + '\n');
  console.log('fade seed 5 proofB FADE cmds', proofScripts.B.length);
}
save('secret', 'secret_hunter', 1, 'WIN', true);
