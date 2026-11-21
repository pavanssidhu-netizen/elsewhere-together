// World layout. Grid, objects and walkability live in the pure shared module src/world/topology.ts; this file
// re-exports them and adds the pixel-space helpers the renderers use (logical canvas 320x180, TILE=16).
import { TILE, MAP_W, MAP_H, MAP_ROWS, OBJECT_TILES, PLAYER_START_TILE } from '../world/topology';
export { TILE, MAP_W, MAP_H, MAP_ROWS, OBJECT_TILES, PLAYER_START_TILE };
export { getWalkability, canWalk, getReachableObjects, getNearbyInteractables, pathTo } from '../world/topology';
export type { GridCell } from '../world/topology';

export const VIEW_W = 320;
export const VIEW_H = 180;

export interface Pt { x: number; y: number }
export const tileCentre = (tx: number, ty: number): Pt => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

export const OBJECT_POSITIONS: Record<string, Pt> = Object.fromEntries(
  Object.entries(OBJECT_TILES).map(([id, c]) => [id, tileCentre(c.tx, c.ty)]),
);

export const OBJECT_LABELS: Record<string, string> = {
  lantern: 'OLD LAMP', bridge: 'BRIDGE', radio: 'SIGNAL MAST', greenhouse: 'FLOODED NURSERY', tide: 'TIDAL GATE',
  anchor_LANTERN: 'ANCHOR: LAMP', anchor_GREENHOUSE: 'ANCHOR: NURSERY',
  anchor_LIGHTHOUSE: 'ANCHOR: LIGHTHOUSE', thread_terminal: 'THREAD TERMINAL', stones: 'OLD ECHO STONES',
};
/** Objects that are choices (E keep / Q send across / F let it be). Everything else: E = use. */
export const FORK_OBJECTS = new Set(['lantern', 'bridge', 'radio', 'greenhouse', 'tide']);

export const PLAYER_START: Pt = tileCentre(PLAYER_START_TILE.tx, PLAYER_START_TILE.ty);

export const PALETTE = {
  midnight: 0x111626, deepBlue: 0x1b263b, teal: 0x4c8790, mist: 0xb2c4ce,
  amber: 0xe6b66e, cyan: 0x7be0df, violet: 0xa89bdb, coral: 0xe47f7c, pink: 0xe8a0b4,
};

// Legacy static pixel collision (debug helper only; the scene uses topology.getWalkability(state)).
const BLOCKED = new Set(['#', '~', 'F', 'G', 'H']);
export function isBlockedPx(x: number, y: number): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return BLOCKED.has(MAP_ROWS[ty][tx]);
}
