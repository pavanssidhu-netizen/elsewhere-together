// Hand-authored Time-Lock rooms. Pure data + symmetric variant transforms. No Phaser/DOM.
import type { Dir, RoomId, RoomInfo, TileKind, Pt } from './api';
import { hash32, mulberry32 } from '../../shared/rng';

/*
 PAST legend:  . FLOOR  # ROCK  ~ GAP  B BEACON  p CONDUIT_P  s SOIL  W SAP_WELL  R ROOT_PLATE
               o RIFT_P (blocked; Mineral Sap appears here in FUTURE_FIRST)  1 Sam start (floor)
 FUTURE legend (overlay; '.' = inherit weather(past)): # extra ROCK pillar  f CONDUIT_F  u RUIN
               c CONDUIT_PLATE  r RIFT  C FLOOR + CRATE  x DUST  2 Jensen start (floor)
*/
export interface RoomSrc { id: RoomId; name: string; budget: number; past: string[]; future: string[] }

const clean = (rows: string[]) => rows.map((r) => r.replace(/ /g, ''));

export const ROOM_SRC: RoomSrc[] = [
  {
    id: 1, name: 'The Hollow Crossing', budget: 20,
    past: clean([
      '. R . # . .',
      '. . . # . p',
      '. . s ~ . B',
      'W 1 . # . .',
      '. . . # . .',
      '. . . # . .',
    ]),
    future: clean([
      '. . . . . .',
      'u . . . . .',
      '. . . . . .',
      '. 2 . . . f',
      '. . . . c .',
      '. . . . . .',
    ]),
  },
  {
    id: 2, name: 'Twin Gap Glade', budget: 20,
    past: clean([
      '. . . . # . .',
      'W . . . # . .',
      '. 1 . . # . .',
      '. . o s ~ . .',
      '# # # ~ # # #',
      '. . . . R p .',
      'W . . . . B .',
    ]),
    future: clean([
      '. u . . . . .',
      '. . C r . . f',
      '. 2 . . . . .',
      '. . . . . . c',
      '. . . . . . .',
      '. . . . . . .',
      '. . . . . . .',
    ]),
  },
  {
    id: 3, name: 'Pillar Maze Overgrowth', budget: 20,
    past: clean([
      '# # # . . . # #',
      '# # # p B . # #',
      '. 1 # ~ # # # #',
      '. R . s ~ . . .',
      '. o W ~ # # # #',
      '. . # . . . . #',
      '. . # . . . . #',
      '. . # . . . . #',
    ]),
    future: clean([
      '. . . . . . . .',
      '. . . . . . . .',
      '. 2 . . . . . .',
      '. . C r . c f .',
      '. . . . . . . .',
      '. . . . # . . .',
      '. . . . u # . .',
      '. . . . . . . .',
    ]),
  },
];

export const ROOMS: RoomInfo[] = ROOM_SRC.map((r) => ({
  id: r.id, name: r.name, w: r.past[0].length, h: r.past.length, budget: r.budget,
}));

export type Variant = 0 | 1 | 2 | 3; // identity, flip-x, flip-y, rotate-180
export const VARIANT_NAMES = ['identity', 'flip-x', 'flip-y', 'rotate-180'] as const;

export function roomVariant(seed: number): Variant {
  return (Math.floor(mulberry32(hash32('forest2-variant', seed))() * 4) & 3) as Variant;
}

export const variantFlipX = (v: Variant) => v === 1 || v === 3;
export const variantFlipY = (v: Variant) => v === 2 || v === 3;

/** Transform a direction by a variant (used for reference solutions and facing). */
export function transformDir(d: Dir, v: Variant): Dir {
  if (variantFlipX(v) && (d === 'E' || d === 'W')) return d === 'E' ? 'W' : 'E';
  if (variantFlipY(v) && (d === 'N' || d === 'S')) return d === 'N' ? 'S' : 'N';
  return d;
}

function transformRows(rows: string[], v: Variant): string[] {
  let out = rows.map((r) => (variantFlipX(v) ? [...r].reverse().join('') : r));
  if (variantFlipY(v)) out = [...out].reverse();
  return out;
}

export interface RoomDef {
  id: RoomId; name: string; w: number; h: number; budget: number; variant: Variant;
  past: TileKind[][];                 // starting Past map
  futureOv: string[];                 // future overlay rows (see legend), transformed
  startPast: Pt; startFuture: Pt;
  conduitP: Pt; conduitF: Pt;
  riftF: Pt | null; riftP: Pt | null;
  startFacing: Dir;
}

const PAST_CH: Record<string, TileKind> = {
  '.': 'FLOOR', '#': 'ROCK', '~': 'GAP', B: 'BEACON', p: 'CONDUIT_P', s: 'SOIL', W: 'SAP_WELL',
  R: 'ROOT_PLATE', o: 'RIFT', '1': 'FLOOR',
};

export function buildRoom(id: RoomId, variant: Variant): RoomDef {
  const src = ROOM_SRC.find((r) => r.id === id)!;
  const past = transformRows(src.past, variant);
  const fut = transformRows(src.future, variant);
  const h = past.length, w = past[0].length;
  let startPast: Pt = { x: 0, y: 0 }, startFuture: Pt = { x: 0, y: 0 };
  let conduitP: Pt = { x: 0, y: 0 }, conduitF: Pt = { x: 0, y: 0 };
  let riftF: Pt | null = null, riftP: Pt | null = null;
  const grid: TileKind[][] = [];
  for (let y = 0; y < h; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < w; x++) {
      const c = past[y][x];
      const k = PAST_CH[c];
      if (!k) throw new Error(`bad past char ${c} room ${id}`);
      if (c === '1') startPast = { x, y };
      if (c === 'p') conduitP = { x, y };
      if (c === 'o') riftP = { x, y };
      const f = fut[y][x];
      if (f === '2') startFuture = { x, y };
      if (f === 'f') conduitF = { x, y };
      if (f === 'r') riftF = { x, y };
      row.push(k);
    }
    grid.push(row);
  }
  return {
    id, name: src.name, w, h, budget: src.budget, variant, past: grid, futureOv: fut,
    startPast, startFuture, conduitP, conduitF, riftF, riftP,
    startFacing: transformDir('S', variant),
  };
}
