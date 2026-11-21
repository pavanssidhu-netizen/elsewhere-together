// Regenerates src/sim/tests/replays.fixture.json (fixed WIN / FADE / ALIEN replays). Run: npx vite-node scripts/gen_replays.ts
process.env.BOTS_NO_MAIN = '1';
import { writeFileSync } from 'node:fs';
import { SimEngine } from '../src/sim/engine';
import { act, planWin } from '../src/sim/planner';
import type { Choice, Command } from '../src/sim/types';

const { runBot } = await import('./bots');
const out: Record<string, { seed: number; commands: Command[] }> = {};

out.WIN = { seed: 48219, commands: planWin(new SimEngine(48219).getState()) };

const mal = Array.from({ length: 50 }, (_, i) => runBot('MALICIOUS', i + 1, 600)).find(r => r.outcome === 'FADE')!;
out.FADE = { seed: mal.seed, commands: mal.commands };

{
  const seed = 7, e = new SimEngine(seed, undefined, true), cmds: Command[] = [];
  const go = (obj: string, choice?: Choice) => {
    for (let i = 0; i < 200; i++) {
      const c = act(e.getState(), obj, choice)!;
      e.dispatch(c); cmds.push(c);
      if (c.type === 'INTERACT') return;
    }
    throw new Error('cannot reach ' + obj);
  };
  go('stones');            // look at the old stones first (clue)
  go('lantern', 'ECHO');   // send the lamp across: light 0
  go('radio', 'ECHO');     // send the signal across: signal 0
  go('radio');             // the mast answers: ALIEN
  out.ALIEN = { seed, commands: cmds };
}
writeFileSync('src/sim/tests/replays.fixture.json', JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k, v.seed, v.commands.length);
