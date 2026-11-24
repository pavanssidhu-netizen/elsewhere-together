// Headless players for the forest: the same ForestModel the scene uses, driven by policies under the deterministic model clock.
import { MODEL } from '../../sim/verify';
import { act, hintToCommand, objectiveHint, planStep, shuffle, wait } from '../../sim/planner';
import { hash32, mulberry32 } from '../../sim/rng';
import { OBJECT_TILES } from '../../world/topology';
import type { Command, PhysicalAction, SimulationState } from '../../sim/types';
import { ForestModel } from './forestModel';

export type Policy = (s: Readonly<SimulationState>) => Command | null;
export interface PlayOpts { think?: number; frozenPartner?: boolean; relaxed?: boolean; maxSteps?: number }
export interface PlayResult { won: boolean; lost: boolean; seconds: number; steps: number; model: ForestModel; actions: Map<string, number> }

export function play(seed: number, character: 'SAM' | 'JENSEN', policy: Policy, o: PlayOpts = {}): PlayResult {
  const m = new ForestModel(seed, character, !!o.relaxed);
  const st = m.engine.getState() as SimulationState; void st;
  if (o.frozenPartner) (m.engine as unknown as { state: SimulationState }).state.partnerFrozen = true;
  const actions = new Map<string, number>();
  let steps = 0;
  const max = o.maxSteps ?? 4000;
  while (!m.won && !m.lost && steps < max) {
    const c = policy(m.state);
    if (!c) break;
    m.dispatch(c); steps++;
    if (c.type === 'INTERACT') { const k = `${c.action ?? 'default'}@${c.objectId}`; actions.set(k, (actions.get(k) ?? 0) + 1); }
    if (c.type === 'CALL') actions.set('CALL', (actions.get('CALL') ?? 0) + 1);
    if (c.type === 'ADVANCE_PARTNER') m.tick(MODEL.WAIT, false);
    else m.tick((c.type === 'MOVE' ? MODEL.MOVE : MODEL.ACT) + (c.type === 'MOVE' ? 0 : (o.think ?? 0)));
  }
  return { won: m.won, lost: m.lost || (!m.won && steps >= max), seconds: Math.round(m.elapsed * 10) / 10, steps, model: m, actions };
}

export const plannerPolicy: Policy = planStep;
/** Does nothing: lets the partner and the clock run. */
export const idlePolicy: Policy = () => ({ type: 'ADVANCE_PARTNER' });

/** Burns fuel on calls and signal holds, never rests (the V5 "reckless" bot). */
export function recklessPolicy(seed: number): Policy {
  const rng = mulberry32(hash32(seed, 'reckless'));
  return s => {
    if (s.player.inventory.fuel < 1) {
      if (s.player.taken.wood < 3) return act(s, 'woodpile', 'GATHER') ?? wait(s);
      return act(s, 'greenhouse', 'HARVEST') ?? wait(s);
    }
    const r = rng();
    if (r < 0.5) return { type: 'CALL' };
    if (r < 0.8) return act(s, 'radio', 'HOLD_SIGNAL') ?? { type: 'CALL' };
    return act(s, 'lantern', 'RELIGHT') ?? { type: 'CALL' };
  };
}

/** A hint-following first-timer: reads the hint, but wanders off sometimes and does not always grasp "call across". */
export function novicePolicy(seed: number): Policy {
  const rng = mulberry32(hash32(seed, 'novice'));
  const objs = Object.keys(OBJECT_TILES);
  const acts: PhysicalAction[] = ['RELIGHT', 'BRACE', 'TUNE', 'GATHER', 'REST', 'OBSERVE'];
  let detour = 0, target = 'lantern';
  return s => {
    if (detour > 0) { detour--; return act(s, target) ?? shuffle(s); }
    if (rng() < 0.12) { detour = 6; target = objs[Math.floor(rng() * objs.length)]; return act(s, target, rng() < 0.4 ? acts[Math.floor(rng() * acts.length)] : undefined) ?? shuffle(s); }
    const h = objectiveHint(s);
    if (h.action === 'CALL' && rng() < 0.35) return wait(s);
    if (h.action === 'REST' && rng() < 0.4) return shuffle(s);
    return hintToCommand(s, h) ?? wait(s);
  };
}
