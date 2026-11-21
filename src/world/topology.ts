// Pure shared topology (no Phaser/DOM). Single source of truth for collision, reach and pathing.
import type { Stats } from '../sim/types';

export type GridCell = { tx: number; ty: number };
export type Realm = 'TOWN' | 'ALIEN';

export const TILE = 16;
export const MAP_W = 20;
export const MAP_H = 11;

// '#' tree/wall  '.' grass  '=' road  '~' water  'b' bridge  'f' ford (shallow)  'F' fence  'G' greenhouse
// 'S' flood-prone sand path  'H' lighthouse
export const MAP_ROWS: string[] = [
  '####################',
  '#....~......GGG....#',
  '#....~......GGG....#',
  '#....~.=========...#',
  '#....~.=.......F...#',
  '#....b.=====.......#',
  '#....~.....FFFFFFFF#',
  '#....f.....SSSSSHS##',
  '#....~.....SSSSSSS##',
  '#~~~~~~~~~~~~~~~~~~#',
  '####################',
];

const cell = (tx: number, ty: number): GridCell => ({ tx, ty });

export const OBJECT_TILES: Record<string, GridCell> = {
  lantern: cell(9, 4),
  bridge: cell(5, 5),
  radio: cell(2, 3),
  greenhouse: cell(13, 3),
  tide: cell(10, 8),
  thread_terminal: cell(2, 7),
  anchor_LANTERN: cell(11, 5),
  anchor_GREENHOUSE: cell(16, 3),
  anchor_LIGHTHOUSE: cell(16, 7),
  stones: cell(3, 5),
  // V3 additions (ids/coords of the above are stable)
  planks: cell(7, 7),      // plank pile, east bank, near the crossing
  woodpile: cell(8, 2),    // dry wood by the trees
};

export const PLAYER_START_TILE: GridCell = cell(7, 5);

const SOLID = new Set(['#', '~', 'F', 'G', 'H']);

export function getWalkability(world: Stats, flags: string[], realm: Realm = 'TOWN'): boolean[][] {
  const bridgeOk = realm === 'ALIEN' || !flags.includes('BRIDGE_CLOSED');
  const fordOk = realm === 'ALIEN' || world.water <= 1;
  const sandOk = flags.includes('COAST_OPEN') && world.water <= 2;
  return MAP_ROWS.map(row => [...row].map(ch => {
    if (ch === 'b') return bridgeOk;
    if (ch === 'f') return fordOk;
    if (ch === 'S') return sandOk;
    return !SOLID.has(ch);
  }));
}

const inBounds = (c: GridCell) => c.tx >= 0 && c.ty >= 0 && c.tx < MAP_W && c.ty < MAP_H;

function walkOf(w: boolean[][], c: GridCell): boolean { return inBounds(c) && w[c.ty][c.tx]; }

export function canWalk(world: Stats, flags: string[], from: GridCell, to: GridCell, realm: Realm = 'TOWN'): boolean {
  if (Math.abs(from.tx - to.tx) + Math.abs(from.ty - to.ty) !== 1) return false;
  return walkOf(getWalkability(world, flags, realm), to);
}

const NB: GridCell[] = [cell(1, 0), cell(-1, 0), cell(0, 1), cell(0, -1)];

function reachableTiles(w: boolean[][], origin: GridCell): Map<string, GridCell | null> {
  const prev = new Map<string, GridCell | null>();
  const key = (c: GridCell) => c.tx + ',' + c.ty;
  prev.set(key(origin), null);
  const q: GridCell[] = [origin];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (const d of NB) {
      const n = cell(c.tx + d.tx, c.ty + d.ty);
      if (!walkOf(w, n) || prev.has(key(n))) continue;
      prev.set(key(n), c);
      q.push(n);
    }
  }
  return prev;
}

const near = (a: GridCell, b: GridCell) => Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty)) <= 1;

export function getNearbyInteractables(world: Stats, flags: string[], origin: GridCell, realm: Realm = 'TOWN'): string[] {
  void world; void flags; void realm;
  return Object.keys(OBJECT_TILES).filter(id => near(origin, OBJECT_TILES[id]));
}

export function getReachableObjects(world: Stats, flags: string[], origin: GridCell, realm: Realm = 'TOWN'): string[] {
  const seen = reachableTiles(getWalkability(world, flags, realm), origin);
  return Object.keys(OBJECT_TILES).filter(id => [...seen.keys()].some(k => {
    const [tx, ty] = k.split(',').map(Number);
    return near(cell(tx, ty), OBJECT_TILES[id]);
  }));
}

/** Shortest walkable path (excluding `from`) to a tile within interaction range of the object; [] if already in range. */
export function pathTo(world: Stats, flags: string[], from: GridCell, objectId: string, realm: Realm = 'TOWN'): GridCell[] | null {
  const obj = OBJECT_TILES[objectId];
  if (!obj) return null;
  if (near(from, obj)) return [];
  const prev = reachableTiles(getWalkability(world, flags, realm), from);
  let best: GridCell | null = null;
  // BFS insertion order is distance order, so the first hit is nearest.
  for (const k of prev.keys()) {
    const [tx, ty] = k.split(',').map(Number);
    if (near(cell(tx, ty), obj)) { best = cell(tx, ty); break; }
  }
  if (!best) return null;
  const path: GridCell[] = [];
  for (let c: GridCell | null = best; c && !(c.tx === from.tx && c.ty === from.ty); c = prev.get(c.tx + ',' + c.ty) ?? null) path.push(c);
  return path.reverse();
}

// ---------- V3: sites (information granularity shared by the partner) ----------
export type Site = 'CLEARING' | 'CROSSING' | 'GARDEN' | 'TOWER' | 'BEACON';
export const OBJECT_SITE: Record<string, Site> = {
  lantern: 'CLEARING', anchor_LANTERN: 'CLEARING', woodpile: 'CLEARING',
  bridge: 'CROSSING', tide: 'CROSSING', planks: 'CROSSING',
  greenhouse: 'GARDEN', anchor_GREENHOUSE: 'GARDEN',
  radio: 'TOWER', stones: 'TOWER', thread_terminal: 'TOWER',
  anchor_LIGHTHOUSE: 'BEACON',
};
/** The river runs down column 5; tiles with tx <= 4 are the far (west) bank. */
export const isWestBank = (tx: number): boolean => tx <= 4;
