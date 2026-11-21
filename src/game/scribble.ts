// SCRIBBLE renderer (Gate B). Every visible scene object is an imported CC0 PNG from public/assets/imported/
// (listed in public/assets/manifest.json): Kenney Scribble Dungeons / Scribble Platformer + the GaidamakUA ink forest.
// No Graphics-drawn scene objects. World units are the logical 320x176 grid (TILE 16); the camera zooms in on the player.
import Phaser from 'phaser';
import type { Identity, SimulationState, Stats } from '../sim/types';
import { MAP_ROWS, MAP_W, MAP_H, TILE, getWalkability, type Realm } from '../world/topology';
import { FORK_OBJECTS, OBJECT_LABELS } from './layout';

export const SK = {
  paper: 0xefe6d6, graphite: 0x3b3a40, amber: 0xe6b66e, cyan: 0x7be0df, pink: 0xe8a0b4,
  alienPaper: 0x1c1728, alienInk: 0xe4d8ff, alienSpore: 0xb89cff,
};

/** Manifest keys actually used by the SCRIBBLE scene (key = manifest key, texture key = 'k:' + key). */
export const USED_ASSETS = [
  'ink-forest/forest',
  'scribble-dungeons/bridge', 'scribble-dungeons/bridge_end', 'scribble-dungeons/campfire', 'scribble-dungeons/door_closed',
  'scribble-dungeons/door_open', 'scribble-dungeons/floor_planks', 'scribble-dungeons/grass', 'scribble-dungeons/path',
  'scribble-dungeons/path_crossing', 'scribble-dungeons/path_curve', 'scribble-dungeons/planks', 'scribble-dungeons/plants',
  'scribble-dungeons/puddle', 'scribble-dungeons/stairs_down', 'scribble-dungeons/tiles_decorative', 'scribble-dungeons/tree',
  'scribble-dungeons/wall', 'scribble-dungeons/wall_corner', 'scribble-dungeons/wall_curve', 'scribble-dungeons/wall_damaged',
  'scribble-dungeons/wall_half', 'scribble-dungeons/water', 'scribble-dungeons/wood',
  'scribble-platformer/character_roundYellow', 'scribble-platformer/character_roundGreen',
];
const K = (n: string): string => 'k:' + n;
const SD = (n: string): string => K('scribble-dungeons/' + n);

export function preloadScribble(scene: Phaser.Scene): void {
  const base = (import.meta as any).env?.BASE_URL ?? './';
  scene.load.setPath(`${base}assets/imported/`.replace('//', '/'));
  for (const k of USED_ASSETS) scene.load.image(K(k), k + '.png');
  scene.load.on('complete', () => { (window as any).__loadedTextures = USED_ASSETS.filter(k => scene.textures.exists(K(k))); });
}

/** After load: forest frames, and SAM = character_roundGreen recoloured cyan (tint-only transform of the imported file). */
export function prepareScribbleTextures(scene: Phaser.Scene): void {
  const f = scene.textures.get(K('ink-forest/forest'));
  for (let r = 0; r < 12; r++) for (let c = 0; c < 18; c++) if (!f.has(`f${c}_${r}`)) f.add(`f${c}_${r}`, 0, c * 64, r * 64, 64, 64);
  if (scene.textures.exists('sam')) return;
  const src = scene.textures.get(K('scribble-platformer/character_roundGreen')).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d')!; x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], g = d.data[i + 1];
    if (g - r > 25) { d.data[i] = Math.min(255, r * 1.15); d.data[i + 1] = Math.min(255, g * 1.14); d.data[i + 2] = Math.min(255, g * 1.45); }
  }
  x.putImageData(d, 0, 0);
  scene.textures.addCanvas('sam', c);
}
export const charTexture = (id: Identity | undefined): string => (id === 'cyan' ? 'sam' : K('scribble-platformer/character_roundYellow'));

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export interface ScribbleCtx {
  w: Stats; flags: string[]; realm: Realm; s: Readonly<SimulationState>; ghost: boolean;
}
export function ctxOf(s: Readonly<SimulationState>, nodeId: string, ghost = false): ScribbleCtx | null {
  const n = s.nodes[nodeId]; if (!n) return null;
  return { w: n.world, flags: n.flags, realm: s.v2?.realm ?? 'TOWN', s, ghost };
}

const SAGE = [0xc9d6b4, 0xd2dcbe, 0xc2d0ae];
const SAND = 0xf0dcab, PATH = 0xe6d3a8, WATER = 0xbfe2e8;
const D = Math.PI / 2;

// ======================================================================================================
// Static layer (redrawn only when world state changes)
// ======================================================================================================
export function drawScribbleWorld(scene: Phaser.Scene, c: Phaser.GameObjects.Container, cx: ScribbleCtx): void {
  const { w, flags, realm, s } = cx;
  const alien = realm === 'ALIEN';
  const walk = getWalkability(w, flags, realm);
  const tintOf = (t: number): number => (alien ? (t & 0xe0e0ff) | 0x9080c0 : t);
  /** Place an imported image; (tx,ty) are fractional tile coordinates of the sprite CENTRE, size in tiles. */
  const put = (key: string, tx: number, ty: number, size = 1, o: { tint?: number; a?: number; rot?: number; fx?: boolean; fy?: boolean; frame?: string } = {}): Phaser.GameObjects.Image => {
    const im = scene.add.image(tx * TILE, ty * TILE, key, o.frame).setDisplaySize(size * TILE, size * TILE);
    if (o.tint !== undefined) im.setTint(tintOf(o.tint));
    if (o.a !== undefined) im.setAlpha(o.a);
    if (o.rot) im.setRotation(o.rot);
    if (o.fx) im.setFlipX(true);
    if (o.fy) im.setFlipY(true);
    c.add(im); return im;
  };
  const at = (tx: number, ty: number) => ({ x: tx + 0.5, y: ty + 0.5 });
  const ch = (tx: number, ty: number): string => (MAP_ROWS[ty]?.[tx]) ?? '#';
  const isPath = (tx: number, ty: number): boolean => ch(tx, ty) === '=' || (tx === 6 && ty === 5);
  const lampLit = w.light >= 2;
  const alive = w.growth >= 2;
  const lhLit = !!s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned || w.light >= 3;
  const bridgeOk = walk[5][5];

  // ---- ground: sage grass, sand, water; path pieces on top ----
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const t = ch(tx, ty), h = hash(tx, ty), p = at(tx, ty);
    if (t === '~' || t === 'f' || t === 'b') { put(SD('water'), p.x, p.y, 1.02, { tint: WATER, rot: (h % 4) * D }); continue; }
    if (t === 'S') { put(SD('grass'), p.x, p.y, 1.02, { tint: SAND, rot: (h % 4) * D }); if (!walk[ty][tx]) put(SD('water'), p.x, p.y, 1.02, { tint: WATER, a: 0.85 }); continue; }
    put(SD('grass'), p.x, p.y, 1.02, { tint: SAGE[h % 3], rot: (h % 4) * D, fx: (h & 8) === 8 });
  }
  // path: straight / curve / crossing chosen from neighbouring path cells
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (!isPath(tx, ty)) continue;
    const p = at(tx, ty);
    const n = [isPath(tx, ty - 1), isPath(tx + 1, ty), isPath(tx, ty + 1), isPath(tx - 1, ty)]; // N E S W
    const cnt = n.filter(Boolean).length;
    let key = 'path', rot = 0;
    if (cnt >= 3) key = 'path_crossing';
    else if (cnt === 2 && n[0] && n[2]) { key = 'path'; rot = 0; }
    else if (cnt === 2 && n[1] && n[3]) { key = 'path'; rot = D; }
    else if (cnt === 2) { key = 'path_curve'; const k = n[1] && n[2] ? 0 : n[2] && n[3] ? 1 : n[3] && n[0] ? 2 : 3; rot = k * D; }
    else if (n[1] || n[3]) rot = D;
    put(SD(key), p.x, p.y, 1.02, { tint: PATH, rot });
  }
  // a few puddles on the stream bank (reads as damp ground)
  for (const [tx, ty] of [[4, 2], [6, 7], [4, 8]]) put(SD('puddle'), tx + 0.5, ty + 0.55, 0.7, { tint: WATER, a: 0.9, rot: hash(tx, ty) % 4 * D });
  // ford (shallow crossing) at (5,7)
  put(SD('puddle'), 5.5, 7.5, 0.9, { tint: walk[7][5] ? SAND : WATER, a: 0.95 });

  // ---- forest border: ink-forest crops over moss, inner edge softened by tree sprites ----
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (ch(tx, ty) !== '#') continue;
    const p = at(tx, ty);
    put(SD('grass'), p.x, p.y, 1.02, { tint: 0xa9bb98 });
    put(K('ink-forest/forest'), p.x, p.y, 1.02, { frame: `f${tx % 2}_${4 + (ty % 2)}`, tint: 0x4a5a46 });
  }
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (ch(tx, ty) !== '#') continue;
    const h = hash(tx, ty); if (h % 3 === 2) continue;
    const inner = (ty === 1 || tx === 1 || ch(tx, ty - 1) !== '#' || ch(tx - 1, ty) !== '#' || ch(tx + 1, ty) !== '#' || ch(tx, ty + 1) !== '#');
    if (!inner && h % 2) continue;
    put(SD('tree'), tx + 0.5, ty + 0.35, 1.55 + (h % 3) * 0.12, { tint: [0xb9c9a2, 0xc4d1ac, 0xaebf9a][h % 3], fx: (h & 4) === 4 });
  }

  // ---- bank bushes (walk-through decoration, away from objects and paths) ----
  for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < MAP_W - 1; tx++) {
    if (ch(tx, ty) !== '.' || hash(tx, ty) % 13 !== 0 || isPath(tx, ty)) continue;
    put(SD('plants'), tx + 0.5, ty + 0.6, 0.62, { tint: 0x8fae7a, fx: (hash(tx, ty) & 2) === 2 });
  }

  // ---- bridge (5,5) + planks pile ----
  if (bridgeOk) put(SD('bridge'), 5.5, 5.5, 1.02, { tint: 0xe3c796, rot: D });
  else { put(SD('bridge_end'), 5.5, 5.5, 1.02, { tint: 0xe3c796, rot: D }); put(SD('planks'), 5.6, 6.5, 0.7, { rot: 0.5, tint: 0xe3c796, a: 0.9 }); }
  put(SD('planks'), 6.55, 4.35, 0.8, { rot: -0.4, tint: 0xe3c796 });

  // ---- garden / greenhouse 3x2 at tiles 12..14, 1..2 ----
  for (let tx = 12; tx <= 14; tx++) for (let ty = 1; ty <= 2; ty++) put(SD('floor_planks'), tx + 0.5, ty + 0.5, 1.0, { tint: alive ? 0xe9e1c8 : 0xd9ccb0 });
  put(SD('wall_corner'), 12.5, 1.5, 1.0); put(SD('wall_corner'), 14.5, 1.5, 1.0, { fx: true });
  put(SD(alive ? 'wall' : 'wall_damaged'), 13.5, 1.5, 1.0);
  put(SD('wall_corner'), 12.5, 2.5, 1.0, { fy: true }); put(SD('wall_corner'), 14.5, 2.5, 1.0, { fx: true, fy: true });
  put(SD('door_open'), 13.5, 2.55, 1.0);
  if (alive) for (const [tx, ty, f] of [[12.9, 1.95, false], [13.9, 1.95, true], [12.75, 2.35, true], [14.15, 2.35, false]] as const) put(SD('plants'), tx, ty, 0.62, { tint: alien ? 0xb89cff : 0x86bf72, fx: f });
  // hedge line (topology 'F'): bushes, no wall tiles
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (ch(tx, ty) !== 'F') continue;
    const h = hash(tx, ty);
    put(SD('plants'), tx + 0.5, ty + 0.55, 1.05, { tint: alien ? 0xb89cff : 0x86a874, fx: (h & 2) === 2 });
    put(SD('plants'), tx + 0.5, ty + 0.75, 0.8, { tint: 0x9bb888, fx: (h & 4) === 4 });
  }

  // ---- clearing fire (lantern, 9,4): foreground, slightly larger ----
  put(SD('campfire'), 9.5, 4.45, 1.45, lampLit ? { tint: 0xffc77a } : { tint: 0x9d9a94, a: 0.9 });
  // lantern anchor (11,5): rune plate
  put(SD('tiles_decorative'), 11.5, 5.5, 0.7, { rot: 0.4, tint: 0xe0d6c0, a: 0.9 });
  // garden anchor (16,3)
  put(SD('tiles_decorative'), 16.5, 3.5, 0.7, { rot: -0.3, tint: 0xe0d6c0, a: 0.9 });

  // ---- west bank: hum stones (radio 2,3), echo stones (3,5), thread stone (2,7) ----
  put(SD('tiles_decorative'), 2.5, 3.5, 0.9, { rot: 0.18, tint: 0xd8d2c4 });
  put(SD('tiles_decorative'), 3.5, 5.5, 1.1, { rot: -0.1, tint: s.v2?.examined?.includes('stones') ? 0xf1d3dc : 0xdcd6c8 });
  put(SD('tiles_decorative'), 3.0, 5.1, 0.5, { rot: 0.9, tint: 0xcfc8b8 });
  put(SD('tiles_decorative'), 2.5, 7.5, 0.8, { rot: D, tint: 0xd0e3e0 });

  // ---- sluice / tidal gate (10,8) over the water at (10,9) ----
  put(SD('wood'), 10.5, 9.5, 1.0, { tint: 0xd9c39a });
  put(SD(walk[8][10] ? 'door_open' : 'door_closed'), 10.5, 8.5 + (walk[8][10] ? 0 : 0.3), 1.0);

  // ---- beacon (lighthouse H at 16,7): stairs + wall_curve ring + campfire ----
  { const cxp = 16.5, cyp = 7.5, sz = 0.62;
    put(SD('stairs_down'), cxp, cyp, 0.9, { tint: 0xe6dccb });
    put(SD('wall_curve'), cxp - sz / 2, cyp - sz / 2, sz); put(SD('wall_curve'), cxp + sz / 2, cyp - sz / 2, sz, { rot: D });
    put(SD('wall_curve'), cxp + sz / 2, cyp + sz / 2, sz, { rot: 2 * D }); put(SD('wall_curve'), cxp - sz / 2, cyp + sz / 2, sz, { rot: 3 * D });
    put(SD('campfire'), cxp, cyp - 0.1, 0.85, lhLit ? { tint: 0xffc77a } : { tint: 0x9d9a94, a: 0.9 });
  }
}

/** Interaction caption: plain text on a parchment label, no bubble. */
export interface Apparition { x: number; y: number; until: number; label: string }
export class ScribbleFx {
  private cap: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene) {
    this.cap = scene.add.text(0, 0, '', {
      fontFamily: 'Georgia, "DejaVu Serif", serif', fontSize: '20px', color: '#3b3a40', align: 'center',
      backgroundColor: '#efe6d6', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(9).setVisible(false);
  }
  clear(): void { this.cap.setVisible(false); }
  /** (ox,oy) = focused object position in world px. */
  prompt(focusId: string | null, ox: number, oy: number): void {
    if (!focusId) { this.cap.setVisible(false); return; }
    const z = this.scene.cameras.main.zoom;
    const verbs = FORK_OBJECTS.has(focusId) ? 'E keep · Q send · F let be' : 'E use';
    this.cap.setText(`${OBJECT_LABELS[focusId] ?? focusId}\n${verbs}`).setScale(1 / z).setVisible(true).setPosition(ox, oy - 11);
  }
}

/** No procedural ambience in the SCRIBBLE scene (kept for API compatibility). */
export function drawScribbleAmbient(_g: Phaser.GameObjects.Graphics, _cx: ScribbleCtx, _t: number, _reduce: boolean, _focusId: string | null, _drawn: { lit: boolean; lhLit: boolean }): void { /* intentionally empty */ }
export const identityColour = (id: Identity | undefined): number => (id === 'cyan' ? SK.cyan : SK.amber);
export const otherColour = (id: Identity | undefined): number => (id === 'cyan' ? SK.amber : SK.cyan);
export { MAP_W };
