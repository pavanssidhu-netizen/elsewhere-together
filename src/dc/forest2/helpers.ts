// Test/report helpers (not imported by the game).
import type { Input, Order, RoomId, Stage, StageView } from './api';
import { createStage } from './sim';
import { referenceSolution } from './solutions';
import { roomVariant, type Variant } from './rooms';

export const ORDERS: Order[] = ['PAST_FIRST', 'FUTURE_FIRST'];
export const ROOM_IDS: RoomId[] = [1, 2, 3];

/** One seed per variant (0..3). */
export function variantSeeds(): number[] {
  const out: number[] = [-1, -1, -1, -1];
  for (let s = 0; out.includes(-1) && s < 2000; s++) {
    const v = roomVariant(s);
    if (out[v] === -1) out[v] = s;
  }
  return out;
}
export const seedForVariant = (v: Variant) => variantSeeds()[v];

export function feed(s: Stage, inputs: Input[]): StageView {
  let v = s.view();
  for (const i of inputs) { v = s.input(i); if (v.status !== 'PLAYING') break; }
  return v;
}
export const mv = (...d: Array<'N' | 'E' | 'S' | 'W'>): Input[] => d.map((dir) => ({ t: 'MOVE', dir }));

export function runRef(room: RoomId, order: Order, seed: number, relaxed = false) {
  const s = createStage(room, order, seed, { relaxed });
  const sol = referenceSolution(room, order, seed);
  let v = feed(s, sol.phase1);
  if (v.status === 'PLAYING') v = s.input({ t: 'END_LOOP' });
  const p1beats = v.beat;
  if (v.status === 'PHASE1_DONE') v = s.beginPhase2();
  v = feed(s, sol.phase2);
  return { s, v, p1beats, spare: v.status === 'CLEARED' ? 20 - v.beat : -1 };
}
