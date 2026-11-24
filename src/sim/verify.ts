// Model-time harness + config verification. A config is only ever used when the planner wins it as BOTH characters inside the budget.
import type { Command, PuzzleConfig, SimulationState } from './types';
import { SimEngine } from './engine';
import { planStep } from './planner';
import { candidateConfig } from './puzzle';

/** Deterministic model-time costs (seconds). They mirror the scene: 3.5 tiles/s walking, ~1.2 s per interaction, one partner tick per 3 s. */
export const MODEL = { MOVE: 0.3, ACT: 1.2, WAIT: 3.0, PARTNER_TICK: 3.0, BUDGET: 180, RELAXED_BUDGET: 300, INTRO: 4 } as const;

export type Decide = (s: Readonly<SimulationState>) => Command | null;
export interface ModelRun {
  won: boolean; fade: boolean; seconds: number; steps: number; calls: number; partnerTicks: number; timedOut: boolean;
  state: Readonly<SimulationState>; commands: Command[];
}
export interface ModelOpts { budget?: number; partnerClock?: boolean; freezePartner?: boolean; maxSteps?: number }

/** Run a policy against an engine under the model clock. The partner also acts on its own every PARTNER_TICK seconds. */
export function modelRun(e: SimEngine, decide: Decide, o: ModelOpts = {}): ModelRun {
  const budget = o.budget ?? MODEL.BUDGET;
  let t = 0, clock = 0, steps = 0, calls = 0, ticks = 0;
  const commands: Command[] = [];
  const maxSteps = o.maxSteps ?? 2500;
  while (t < budget && steps < maxSteps) {
    const s = e.getState();
    if (s.won || s.phase === 'FADE' || s.phase === 'ENDING') break;
    const c = decide(s);
    if (!c) break;
    e.dispatch(c); commands.push(c); steps++;
    if (c.type === 'CALL') calls++;
    const cost = c.type === 'MOVE' ? MODEL.MOVE : c.type === 'ADVANCE_PARTNER' ? MODEL.WAIT : MODEL.ACT;
    t += cost;
    if (c.type === 'ADVANCE_PARTNER') { clock = 0; ticks++; continue; }
    clock += cost;
    while (o.partnerClock !== false && clock >= MODEL.PARTNER_TICK) {
      clock -= MODEL.PARTNER_TICK;
      if (!e.getState().won) { e.dispatch({ type: 'ADVANCE_PARTNER' }); ticks++; }
    }
  }
  const s = e.getState();
  return { won: s.won, fade: s.phase === 'FADE', seconds: Math.round(t * 10) / 10, steps, calls, partnerTicks: ticks, timedOut: !s.won && t >= budget, state: s, commands };
}

export function newEngine(seed: number, cfg: PuzzleConfig, inPlace = true): SimEngine {
  return new SimEngine(seed, undefined, inPlace, { cfg });
}

/** Planner wins this config? (model seconds) */
export function planOnce(seed: number, cfg: PuzzleConfig, budget: number = MODEL.BUDGET): ModelRun {
  return modelRun(newEngine(seed, cfg), planStep, { budget });
}

export const VERIFY_LIMIT = 120;       // the planner must win with comfortable room to spare
const cache = new Map<string, { cfg: PuzzleConfig; attempts: number }>();

/** The config for (seed, character): the first deterministic candidate whose planner win fits VERIFY_LIMIT. Never returns an unsolved config. */
export function verifiedConfig(seed: number, character: 'SAM' | 'JENSEN'): { cfg: PuzzleConfig; attempts: number } {
  const key = seed + character;
  const hit = cache.get(key);
  if (hit) return hit;
  for (let a = 0; a < 40; a++) {
    const cfg = candidateConfig(seed, a, character);
    const r = planOnce(seed, cfg, VERIFY_LIMIT);
    if (r.won && r.seconds <= VERIFY_LIMIT) { const v = { cfg, attempts: a + 1 }; cache.set(key, v); return v; }
  }
  throw new Error(`no verified puzzle config for seed ${seed} as ${character}`);
}
