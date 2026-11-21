// Deterministic proof scripts (seed 1): legal MOVE/INTERACT/ADVANCE_PARTNER command arrays for browser demos and tests.
import type { Command, SimulationState } from './types';
import { SimEngine } from './engine';
import { act, planStep, planWin } from './planner';

type Stop = (s: Readonly<SimulationState>) => boolean;
const flag = (s: Readonly<SimulationState>, f: string) => s.nodes[s.player.nodeId].flags.includes(f);

/** Run `next` (a policy returning one command) until `stop`; returns the commands issued. */
function drive(e: SimEngine, next: (s: Readonly<SimulationState>) => Command | null, stop: Stop, max = 600): Command[] {
  const cmds: Command[] = [];
  for (let i = 0; i < max && !stop(e.getState()); i++) {
    const c = next(e.getState());
    if (!c) break;
    e.dispatch(c); cmds.push(c);
  }
  return cmds;
}

/** A: divert, read the carving, follow the other history, tune the radio, contact. */
function proofA(seed: number): Command[] {
  const e = new SimEngine(seed, undefined, true);
  return drive(e, planStep, s => !!s.v2.contact || s.won);
}

/** Wood in hand, water diverted, then the signal fire in dry undergrowth; then wait out the weather. */
function fireScript(e: SimEngine, readFirst: boolean, until: Stop): Command[] {
  return drive(e, s => {
    const known = (s.player.knowledge ?? []).includes('KNOWS_FREQUENCY');
    if (s.player.inventory.fuel < 1 && !flag(s, 'LANTERN_LIT')) return act(s, 'woodpile', 'GATHER');
    if (!flag(s, 'WATER_DIVERTED')) return act(s, 'tide', s.v2.examined.includes('tide') ? 'DIVERT_WATER' : 'OBSERVE');
    if (readFirst && !known) return act(s, 'inscription', 'READ');
    if (!flag(s, 'LANTERN_LIT') && s.player.inventory.fuel >= 1) return act(s, 'lantern', s.v2.examined.includes('lantern') ? 'RELIGHT' : 'OBSERVE');
    return { type: 'ADVANCE_PARTNER' };
  }, until, 700);
}

/** B: divert + fire, then do nothing until the Thread fades. */
function proofB(seed: number): Command[] {
  const e = new SimEngine(seed, undefined, true);
  return fireScript(e, false, s => s.phase === 'FADE');
}

/** C: cascade, then follow the other history from the sluice, then win. */
function proofC(seed: number): Command[] {
  const e = new SimEngine(seed, undefined, true);
  const cmds = fireScript(e, true, s => flag(s, 'FIRE_SPREAD') || s.phase === 'FADE');
  cmds.push(...drive(e, s => act(s, 'tide', 'FOLLOW_ALTERNATE'), s => !flag(s, 'FIRE_SPREAD')));
  cmds.push(...planWin(e));
  return cmds;
}

/** D: the player only waits; the partner acts on its own. */
function proofD(): Command[] { return Array.from({ length: 60 }, () => ({ type: 'ADVANCE_PARTNER' } as Command)); }

export const proofScripts: Record<'A' | 'B' | 'C' | 'D', Command[]> = {
  A: proofA(1), B: proofB(1), C: proofC(1), D: proofD(),
};
export { proofA, proofB, proofC, proofD };
