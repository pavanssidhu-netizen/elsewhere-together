// Pure helpers for the forest scene: tile geometry, directions, interaction labels, bond stress mapping. No Phaser here (unit tested).
import { TILE } from '../../world/topology';
import type { PhysicalAction } from '../../sim/types';

export const px = (t: number): number => t * TILE + TILE / 2;
/** Where a character's feet stand inside a tile. */
export const FEET = 12;

/** myconid sheet rows: S, SW, W, NW, N, NE, E, SE. */
export function dirIndex(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const table: Record<string, number> = { '0,1': 0, '-1,1': 1, '-1,0': 2, '-1,-1': 3, '0,-1': 4, '1,-1': 5, '1,0': 6, '1,1': 7 };
  return table[`${sx},${sy}`];
}

/** Objects the player can use. Marker stones (anchor_*) stay decoration: the beacon itself is the objective. */
export const USABLE = ['lantern', 'woodpile', 'planks', 'bridge', 'tide', 'wheel', 'inscription', 'radio', 'greenhouse', 'stones', 'thread_terminal'] as const;
export type Usable = (typeof USABLE)[number];

export const OBJECT_NAME: Record<Usable, string> = {
  lantern: 'Beacon', woodpile: 'Woodpile', planks: 'Planks', bridge: 'Bridge', tide: 'Sluice gate', wheel: 'Waterwheel', inscription: 'Carved stone',
  radio: 'Signal mast', greenhouse: 'Garden', stones: 'Thread stones', thread_terminal: 'Thread bench',
};

export const SHORT: Partial<Record<PhysicalAction, string>> = {
  RELIGHT: 'Light', GATHER: 'Take', BRACE: 'Mend', DIVERT_WATER: 'Open gate', FOLLOW_ALTERNATE: 'Other history', CLOSE_SLUICE: 'Close gate',
  READ: 'Read', TUNE: 'Tune', HOLD_SIGNAL: 'Hold signal', PROTECT: 'Tend', HARVEST: 'Cut fibre', REST: 'Rest', OBSERVE: 'Look',
};

/** Which verbs are shown for an object, primary first. Disabled ones stay listed (they explain themselves when used). */
export function verbsFor(obj: string, state: { lit: boolean; inherited: boolean; hasAlt: boolean; gridWheelLooked: boolean }): PhysicalAction[] {
  switch (obj) {
    case 'lantern': return state.lit ? ['OBSERVE'] : ['RELIGHT', 'OBSERVE'];
    case 'woodpile': case 'planks': return ['GATHER', 'OBSERVE'];
    case 'bridge': return ['BRACE', 'OBSERVE'];
    case 'tide': return state.inherited ? ['CLOSE_SLUICE', 'OBSERVE'] : state.hasAlt ? ['FOLLOW_ALTERNATE', 'DIVERT_WATER'] : ['DIVERT_WATER', 'OBSERVE'];
    case 'wheel': return ['OBSERVE'];
    case 'inscription': return ['READ'];
    case 'radio': return ['TUNE', 'HOLD_SIGNAL'];
    case 'greenhouse': return ['PROTECT', 'HARVEST'];
    case 'stones': case 'thread_terminal': return ['REST', 'OBSERVE'];
  }
  return ['OBSERVE'];
}

/** 0 = healthy bond, 1 = collapsing. Re-exported mapping used by the scene (the model owns the maths). */
export const stressTint = (v: number): { desat: number; coolAlpha: number; dark: number } => ({ desat: 0.65 * v, coolAlpha: 0.2 * v, dark: 0.28 * v });

/** Short, spoken-length caption time (ms) from the text length. */
export const captionMs = (t: string): number => Math.min(5200, 1700 + t.length * 38);

/** Deterministic small hash for decoration (never gameplay). */
export function h2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** BFS path over a walkability grid (tap-to-walk). Returns the tiles after `from`, or null. */
export function bfs(w: boolean[][], from: { tx: number; ty: number }, to: { tx: number; ty: number }): { tx: number; ty: number }[] | null {
  if (!w[to.ty]?.[to.tx]) return null;
  const key = (c: { tx: number; ty: number }) => c.ty * 64 + c.tx;
  const prev = new Map<number, { tx: number; ty: number } | null>([[key(from), null]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c.tx === to.tx && c.ty === to.ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { tx: c.tx + dx, ty: c.ty + dy };
      if (!w[n.ty]?.[n.tx] || prev.has(key(n))) continue;
      prev.set(key(n), c); q.push(n);
    }
  }
  if (!prev.has(key(to))) return null;
  const out: { tx: number; ty: number }[] = [];
  for (let c: { tx: number; ty: number } | null = to; c && !(c.tx === from.tx && c.ty === from.ty); c = prev.get(key(c)) ?? null) out.push(c);
  return out.reverse();
}
