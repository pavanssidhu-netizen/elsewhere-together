// Fixed world layout. TILE=16, map 20x11 => 320x176 (4px strip at bottom of the 320x180 canvas).
export const TILE = 16;
export const MAP_W = 20;
export const MAP_H = 11;
export const VIEW_W = 320;
export const VIEW_H = 180;

// '#' tree/wall  '.' grass  '=' road  '~' water  'b' bridge  'F' fence  'G' greenhouse  'S' sand  'H' lighthouse
export const MAP_ROWS: string[] = [
  '####################',
  '#....~......GGG....#',
  '#....~......GGG....#',
  '#....~.=========...#',
  '#....~.=.......F...#',
  '#....b.=====.......#',
  '#....~.........F...#',
  '#....~.......SSSSH.#',
  '#....~......SSSSSS.#',
  '#~~~~~~~~~~~~~~~~~~#',
  '####################',
];

export const BLOCKED = new Set(['#', '~', 'F', 'G', 'H']);

export interface Pt { x: number; y: number }
const c = (tx: number, ty: number): Pt => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

export const OBJECT_POSITIONS: Record<string, Pt> = {
  lantern: c(9, 4),
  bridge: c(5, 5),
  radio: c(2, 3),
  greenhouse: c(13, 3),
  tide: c(10, 8),
  anchor_LANTERN: c(11, 5),
  anchor_GREENHOUSE: c(16, 3),
  anchor_LIGHTHOUSE: c(16, 7),
  thread_terminal: c(2, 7),
};

export const OBJECT_LABELS: Record<string, string> = {
  lantern: 'LANTERN', bridge: 'BRIDGE', radio: 'RADIO TOWER', greenhouse: 'GREENHOUSE', tide: 'TIDE GAUGE',
  anchor_LANTERN: 'ANCHOR: LANTERN', anchor_GREENHOUSE: 'ANCHOR: GREENHOUSE',
  anchor_LIGHTHOUSE: 'ANCHOR: LIGHTHOUSE', thread_terminal: 'THREAD TERMINAL (REST)',
};

export const PLAYER_START: Pt = c(7, 5);
export const INTERACT_RADIUS = 18;
export const MOVE_SPEED = 58;

export const PALETTE = {
  midnight: 0x111626, deepBlue: 0x1b263b, teal: 0x4c8790, mist: 0xb2c4ce,
  amber: 0xe6b66e, cyan: 0x7be0df, violet: 0xa89bdb, coral: 0xe47f7c,
};

export function isBlockedPx(x: number, y: number): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return BLOCKED.has(MAP_ROWS[ty][tx]);
}
