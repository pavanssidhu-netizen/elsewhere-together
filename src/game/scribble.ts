// SCRIBBLE renderer: graphite sketch on warm paper, built from the CC0 Kenney "Scribble Dungeons" PNGs
// (public/assets/scribble, https://kenney.nl) plus procedural ink strokes for landmarks. World units are the
// logical 320x180 grid (TILE 16); the camera zoom is INK_SCALE (4) so each 64px PNG is drawn 1:1 and strokes stay crisp.
import Phaser from 'phaser';
import type { Identity, SimulationState, Stats } from '../sim/types';
import { MAP_ROWS, MAP_W, MAP_H, TILE, OBJECT_TILES, getWalkability, type Realm } from '../world/topology';
import { FORK_OBJECTS, OBJECT_LABELS } from './layout';

export const SK = {
  paper: 0xefe6d6, graphite: 0x3b3a40, amber: 0xe6b66e, cyan: 0x7be0df, pink: 0xe8a0b4,
  alienPaper: 0x1c1728, alienInk: 0xe4d8ff, alienSpore: 0xb89cff, grass: 0xf3ecdc, sand: 0xf0dcab, water: 0xcfe9ea, path: 0xe2d1ac,
};
const IMGS = ['tree', 'plants', 'campfire', 'puddle', 'bridge', 'water', 'grass', 'floor_path', 'chest', 'planks', 'wall_edge'];

export function preloadScribble(scene: Phaser.Scene): void {
  const base = (import.meta as any).env?.BASE_URL ?? './';
  scene.load.setPath(`${base}assets/scribble/`.replace('//', '/'));
  for (const n of IMGS) scene.load.image('sc_' + n, n + '.png');
}

/** Inverted-ink copies for the ALIEN realm: dark strokes become pale, light paper becomes transparent. */
export function prepareScribbleTextures(scene: Phaser.Scene): void {
  for (const n of IMGS) {
    if (scene.textures.exists('sci_' + n) || !scene.textures.exists('sc_' + n)) continue;
    const src = scene.textures.get('sc_' + n).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d')!; x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
      const a = d.data[i + 3] / 255 * Math.min(1, ((255 - lum) / 255) * 1.7);
      d.data[i] = 232; d.data[i + 1] = 222; d.data[i + 2] = 255; d.data[i + 3] = Math.round(a * 255);
    }
    x.putImageData(d, 0, 0);
    scene.textures.addCanvas('sci_' + n, c);
  }
}

// ---- deterministic helpers (never Math.random) ----
const jr = (i: number, s: number): number => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v) - 0.5; };
const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
type G = Phaser.GameObjects.Graphics;

function ln(g: G, x0: number, y0: number, x1: number, y1: number, col: number, a: number, w: number, seed: number): void {
  const mx = (x0 + x1) / 2 + jr(1, seed) * 0.9, my = (y0 + y1) / 2 + jr(2, seed) * 0.9;
  g.lineStyle(w, col, a); g.beginPath(); g.moveTo(x0, y0); g.lineTo(mx, my); g.lineTo(x1, y1); g.strokePath();
}
function poly(g: G, pts: [number, number][], fill: number | null, fa: number, line: number, la: number, w: number, close = true): void {
  if (fill !== null) { g.fillStyle(fill, fa); g.fillPoints(pts.map(([x, y]) => ({ x, y })), true); }
  g.lineStyle(w, line, la); g.strokePoints(pts.map(([x, y]) => ({ x, y })), close);
}
function ell(g: G, cx: number, cy: number, rx: number, ry: number, fill: number | null, fa: number, line: number, la: number, w: number, seed = 0): void {
  const pts: [number, number][] = [];
  for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2, f = 1 + jr(k, seed) * 0.06; pts.push([cx + Math.cos(t) * rx * f, cy + Math.sin(t) * ry * f]); }
  poly(g, pts, fill, fa, line, la, w);
}
function rect(g: G, x: number, y: number, w: number, h: number, fill: number | null, fa: number, line: number, la: number, lw: number): void {
  poly(g, [[x, y], [x + w, y + jr(x, y) * 0.5], [x + w, y + h], [x + jr(y, x) * 0.5, y + h]], fill, fa, line, la, lw);
}
function stipple(g: G, x: number, y: number, w: number, h: number, n: number, seed: number, col: number, a: number): void {
  g.fillStyle(col, a);
  for (let i = 0; i < n; i++) g.fillCircle(x + (jr(i, seed) + 0.5) * w, y + (jr(i, seed + 7) + 0.5) * h, 0.3);
}
function glow(g: G, cx: number, cy: number, r: number, col: number, a: number): void {
  for (let k = 4; k >= 1; k--) { g.fillStyle(col, a * (1 - k / 5) * 0.55); g.fillCircle(cx, cy, (r * k) / 4); }
}
function arc(g: G, cx: number, cy: number, r: number, a0: number, a1: number, col: number, a: number, w: number): void {
  g.lineStyle(w, col, a); g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokePath();
}

export interface ScribbleCtx {
  w: Stats; flags: string[]; realm: Realm; s: Readonly<SimulationState>; ghost: boolean;
}
export function ctxOf(s: Readonly<SimulationState>, nodeId: string, ghost = false): ScribbleCtx | null {
  const n = s.nodes[nodeId]; if (!n) return null;
  return { w: n.world, flags: n.flags, realm: s.v2?.realm ?? 'TOWN', s, ghost };
}

// ======================================================================================================
// Static layer (redrawn only when world state changes)
// ======================================================================================================
export function drawScribbleWorld(scene: Phaser.Scene, c: Phaser.GameObjects.Container, cx: ScribbleCtx): void {
  const { w, flags, realm, s, ghost } = cx;
  const alien = realm === 'ALIEN';
  const INK = alien ? SK.alienInk : SK.graphite;
  const tex = (n: string) => (alien ? 'sci_' : 'sc_') + n;
  const walk = getWalkability(w, flags, realm);
  const examined = s.v2?.examined ?? [];
  const img = (n: string, x: number, y: number, size: number, tint?: number, a = 1, flip = false, rot = 0): Phaser.GameObjects.Image => {
    const i = scene.add.image(x, y, tex(n)).setOrigin(0.5, 0.5).setDisplaySize(size, size).setAlpha(a);
    if (tint !== undefined) i.setTint(tint);
    if (flip) i.setFlipX(true);
    if (rot) i.setRotation(rot);
    c.add(i); return i;
  };
  const gfx = (): G => { const g = scene.add.graphics(); c.add(g); return g; };
  if (!ghost) c.add(scene.add.rectangle(0, 0, 320, 180, alien ? SK.alienPaper : SK.paper).setOrigin(0, 0));

  const bridgeOk = walk[5][5];
  const lampLit = w.light >= 2;
  const alive = w.growth >= 2;
  const lhAligned = !!s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned;
  const lhLit = lhAligned || w.light >= 3;

  // ---- ground ----
  const gGround = gfx();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const ch = MAP_ROWS[ty][tx], x = tx * TILE, y = ty * TILE, h = hash(tx, ty), mx = x + 8, my = y + 8;
    const isWater = ch === '~' || ch === 'f' || ch === 'b';
    if (isWater) {
      img('water', mx, my, TILE, alien ? 0xb89cff : SK.water, alien ? 0.55 : 1);
      for (let k = 0; k < 3; k++) { // wave strokes
        const wy = y + 3 + k * 5 + jr(h, k) * 1.2, wx = x + 1.5 + ((h >> (k * 3)) % 5);
        ln(gGround, wx, wy, wx + 3, wy - 0.7, INK, 0.5, 0.45, h + k); ln(gGround, wx + 3, wy - 0.7, wx + 6, wy, INK, 0.5, 0.45, h + k + 3);
      }
      continue;
    }
    const tone = ch === '=' ? SK.path : ch === 'S' ? SK.sand : ((h % 3) === 0 ? 0xeee3cf : SK.grass);
    img(ch === '=' ? 'floor_path' : 'grass', mx, my, TILE, alien ? 0xd6c8ff : tone, 1, (h & 1) === 1);
    if (ch === '#') continue;
    if (ch === '=') stipple(gGround, x, y, 16, 16, 7, h, INK, 0.5);
    else if (ch === 'S') stipple(gGround, x, y, 16, 16, 10, h, INK, 0.55);
    else if (h % 3 === 1) { // grass tufts
      const tx0 = x + 3 + (h % 7), ty0 = y + 9 + ((h >> 3) % 4);
      for (let k = 0; k < 3; k++) ln(gGround, tx0 + k * 1.6, ty0, tx0 + k * 1.6 + (k - 1) * 0.9, ty0 - 2.6 + (k === 1 ? -0.8 : 0), alien ? SK.alienSpore : INK, 0.6, 0.45, h + k);
    }
  }

  // ---- trees / border ----
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (MAP_ROWS[ty][tx] !== '#') continue;
    const h = hash(tx, ty);
    img('tree', tx * TILE + 8, ty * TILE + 8, TILE + 2 + (h % 3), alien ? 0xcdb4ff : (ty === 0 || tx === 0 || tx === MAP_W - 1) ? 0xbcc9a8 : 0xc9d3b4, 1, (h & 2) === 2);
  }

  // ---- alien realm: overgrowth everywhere ----
  if (alien) {
    for (let ty = 1; ty < MAP_H - 2; ty++) for (let tx = 1; tx < MAP_W - 1; tx++) {
      const ch = MAP_ROWS[ty][tx], h = hash(tx, ty);
      if (ch === '~' || ch === 'G' || ch === 'H') continue;
      if (h % 5 < 2) img('plants', tx * TILE + 8, ty * TILE + 8, TILE + 4, 0xb89cff, 0.95, (h & 4) === 4);
      if (h % 11 === 0) { const gg = gfx(); ell(gg, tx * TILE + 8, ty * TILE + 6, 2.2, 2.6, SK.alienSpore, 0.35, SK.alienInk, 0.8, 0.4, h); }
    }
  }

  // ---- fences ----
  const gF = gfx();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (MAP_ROWS[ty][tx] !== 'F') continue;
    const x = tx * TILE, y = ty * TILE;
    ln(gF, x, y + 7, x + 16, y + 7, INK, 0.9, 0.6, tx); ln(gF, x, y + 11, x + 16, y + 11, INK, 0.9, 0.6, tx + 4);
    for (const px of [x + 2, x + 8, x + 14]) rect(gF, px - 0.8, y + 4, 1.6, 10, alien ? 0x4a3a6a : 0xd9c39a, 1, INK, 0.9, 0.5);
  }

  // ---- sand flood (from topology: sand not walkable) ----
  const gW = gfx();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (MAP_ROWS[ty][tx] !== 'S' || walk[ty][tx]) continue;
    const x = tx * TILE, y = ty * TILE, h = hash(tx, ty);
    gW.fillStyle(alien ? 0x7a5cd6 : 0x7fcfd6, 0.62); gW.fillRect(x, y + 1, 16, 15);
    for (let k = 0; k < 3; k++) { const wy = y + 4 + k * 4.5, wx = x + 1 + ((h >> k) % 4); ln(gW, wx, wy, wx + 4, wy - 0.8, INK, 0.6, 0.5, h + k); ln(gW, wx + 4, wy - 0.8, wx + 8, wy, INK, 0.6, 0.5, h + k + 2); }
  }
  // ---- ford stones (visible when shallow) ----
  { const x = 5 * TILE, y = 7 * TILE, ok = walk[7][5];
    for (let k = 0; k < 3; k++) { ell(gW, x + 3 + k * 5, y + 8 + (k % 2) * 2, 2.2, 1.6, ok ? 0xe9e2d4 : 0xbfd8d8, ok ? 1 : 0.5, INK, ok ? 0.95 : 0.4, 0.5, k); }
    if (!ok) for (let k = 0; k < 3; k++) ln(gW, x + 2 + k * 5, y + 5, x + 6 + k * 5, y + 4.4, INK, 0.5, 0.45, k);
  }

  // ---- bridge ----
  { const x = 5 * TILE, y = 5 * TILE; const g = gfx();
    if (bridgeOk) {
      img('bridge', x + 8, y + 8, TILE, 0xe3c796);
      for (let k = 0; k < 5; k++) ln(g, x + 3 + k * 2.5, y + 3, x + 3 + k * 2.5, y + 13, INK, 0.55, 0.45, k);
    } else { // broken: two stubs off the banks, loose planks in the water
      rect(g, x, y + 4, 4.5, 8, 0xe3c796, 1, INK, 0.95, 0.6); rect(g, x + 11.5, y + 4, 4.5, 8, 0xe3c796, 1, INK, 0.95, 0.6);
      ln(g, x + 4.5, y + 5, x + 6.3, y + 8.5, INK, 0.9, 0.55, 3); ln(g, x + 11.5, y + 5, x + 9.6, y + 9, INK, 0.9, 0.55, 5);
      poly(g, [[x + 6, y + 10], [x + 10.4, y + 12.2], [x + 9.8, y + 13.5], [x + 5.4, y + 11.4]], 0xe3c796, 1, INK, 0.9, 0.5);
      poly(g, [[x + 7.5, y + 3], [x + 11, y + 2], [x + 11.4, y + 3.3], [x + 8, y + 4.4]], 0xe3c796, 0.9, INK, 0.9, 0.45);
      arc(g, x + 8, y + 8, 3.6, 0, Math.PI * 1.4, INK, 0.5, 0.4);
    }
  }

  // ---- nursery (greenhouse 3x2 at tiles 12..14, 1..2) ----
  { const x0 = 12 * TILE, y0 = 1 * TILE, W = 48, g = gfx();
    img('puddle', x0 + 24, y0 + 30, 40, alien ? 0xb89cff : 0x9bdadd, w.water >= 2 ? 0.95 : 0.55);
    rect(g, x0 + 1, y0 + 8, W - 2, 22, alien ? 0x3a2f55 : 0xe4f1ee, 0.75, INK, 0.95, 0.7);
    poly(g, [[x0 - 1, y0 + 8], [x0 + 24, y0 + 0.5], [x0 + W + 1, y0 + 8]], alien ? 0x3a2f55 : 0xeaf3f0, 0.85, INK, 0.95, 0.7, true);
    for (let k = 1; k < 6; k++) ln(g, x0 + k * 8, y0 + 8, x0 + k * 8, y0 + 30, INK, 0.45, 0.4, k);
    ln(g, x0 + 1, y0 + 18, x0 + W - 1, y0 + 18, INK, 0.45, 0.4, 9);
    if (alive) {
      for (let k = 0; k < 4; k++) img('plants', x0 + 7 + k * 11, y0 + 22, 15, alien ? 0xb89cff : 0x86bf72, 1, k % 2 === 1);
      for (let k = 0; k < 4; k++) { g.fillStyle(SK.pink, 0.95); g.fillCircle(x0 + 10 + k * 11, y0 + 16 + (k % 2) * 3, 1.3); g.lineStyle(0.4, INK, 0.9); g.strokeCircle(x0 + 10 + k * 11, y0 + 16 + (k % 2) * 3, 1.3); }
    } else {
      for (let k = 0; k < 5; k++) { const sx = x0 + 7 + k * 9; ln(g, sx, y0 + 29, sx - 1, y0 + 22, 0x9a8460, 0.95, 0.6, k); ln(g, sx - 1, y0 + 22, sx + 2.5, y0 + 20.5 + (k % 2), 0x9a8460, 0.95, 0.55, k + 3); }
    }
    const door = [[x0 + 20, y0 + 30], [x0 + 20, y0 + 24], [x0 + 28, y0 + 24], [x0 + 28, y0 + 30]] as [number, number][];
    poly(g, door, 0xd9c39a, 0.9, INK, 0.9, 0.55, false);
    if (w.water >= 2) for (let k = 0; k < 4; k++) { const wx = x0 + 3 + k * 11; ln(g, wx, y0 + 31.5, wx + 4, y0 + 31, 0x3d8f99, 0.9, 0.5, k); ln(g, wx + 4, y0 + 31, wx + 8, y0 + 31.6, 0x3d8f99, 0.9, 0.5, k + 1); }
  }

  // ---- old lamp (9,4) ----
  { const x = 9 * TILE + 8, y = 4 * TILE + 8, g = gfx();
    if (lampLit) { glow(g, x, y - 8, 22, SK.amber, 0.5); img('campfire', x, y + 3, 11, SK.amber, 0.9); }
    else ell(g, x + 3, y + 5, 3.4, 1.2, 0x8a8478, 0.4, INK, 0.5, 0.4);
    ln(g, x, y + 5, x, y - 8, INK, 1, 0.8, 1); ln(g, x - 3, y + 5, x + 3, y + 5, INK, 1, 0.8, 2);
    ln(g, x, y - 8, x + 3.5, y - 9, INK, 1, 0.7, 3);
    poly(g, [[x + 1.5, y - 10.5], [x + 5.5, y - 10.5], [x + 5.5, y - 5.5], [x + 1.5, y - 5.5]], lampLit ? SK.amber : 0xdad4c4, 1, INK, 1, 0.65);
    poly(g, [[x + 0.8, y - 10.5], [x + 3.5, y - 12.5], [x + 6.2, y - 10.5]], 0xb9b2a2, 1, INK, 1, 0.6);
    if (!lampLit) { ln(g, x + 2, y - 10, x + 5, y - 6, INK, 0.8, 0.4, 4); ln(g, x + 5, y - 10, x + 2, y - 6, INK, 0.8, 0.4, 5); }
  }

  // ---- stones (3,5) ----
  { const x = 3 * TILE + 8, y = 5 * TILE + 12, g = gfx();
    const seen = examined.includes('stones');
    if (seen) { ell(g, x, y - 3, 11, 6, SK.pink, 0.16, SK.pink, 0.7, 0.5); }
    else arc(g, x, y - 3, 10, 0.3, 2.9, SK.pink, 0.45, 0.45);
    for (const [dx, hh, ww] of [[-5, 9, 4], [0, 13, 4.6], [5, 8, 3.8]] as const) {
      poly(g, [[x + dx - ww / 2, y], [x + dx - ww / 2 - 0.2, y - hh + 2], [x + dx, y - hh], [x + dx + ww / 2, y - hh + 2], [x + dx + ww / 2, y]], alien ? 0x3a2f55 : 0xdcd6c8, 1, INK, 1, 0.65);
      ln(g, x + dx - 0.8, y - hh + 4, x + dx + 0.8, y - hh + 4, seen ? SK.pink : INK, 0.9, 0.45, dx); ln(g, x + dx, y - hh + 4, x + dx, y - hh + 7, seen ? SK.pink : INK, 0.9, 0.45, dx + 1);
    }
  }

  // ---- signal mast (2,3) ----
  { const x = 2 * TILE + 8, y = 3 * TILE + 15, g = gfx();
    const top = y - 33;
    ln(g, x - 6, y, x - 1.2, top, INK, 1, 0.8, 1); ln(g, x + 6, y, x + 1.2, top, INK, 1, 0.8, 2);
    for (let k = 0; k < 5; k++) { const t0 = k / 5, t1 = (k + 1) / 5, xa = x - 6 + 4.8 * t0, xb = x + 6 - 4.8 * t1; ln(g, xa, y + (top - y) * t0, xb, y + (top - y) * t1, INK, 0.85, 0.5, k); ln(g, x + 6 - 4.8 * t0, y + (top - y) * t0, x - 6 + 4.8 * t1, y + (top - y) * t1, INK, 0.85, 0.5, k + 8); }
    ln(g, x, top, x, top - 6, INK, 1, 0.7, 7); ell(g, x, top - 7.2, 1.6, 1.6, w.signal >= 2 ? SK.cyan : w.signal === 1 ? 0xa9c9cb : 0xe9a39e, 1, INK, 1, 0.55);
    if (w.signal >= 1) for (let k = 1; k <= (w.signal >= 2 ? 3 : 1); k++) {
      arc(g, x, top - 7.2, 3 + k * 3, -Math.PI * 0.85, -Math.PI * 0.15, w.signal >= 2 ? SK.cyan : 0x7aa7aa, 0.9 - k * 0.15, 0.7);
    } else { ln(g, x - 2.4, top - 10, x + 2.4, top - 4.8, 0xd45a54, 1, 0.7, 3); ln(g, x + 2.4, top - 10, x - 2.4, top - 4.8, 0xd45a54, 1, 0.7, 4); }
    rect(g, x - 7, y - 1, 14, 2.5, 0xd9c39a, 1, INK, 1, 0.55);
  }

  // ---- thread terminal (2,7) ----
  { const x = 2 * TILE + 8, y = 7 * TILE + 8, g = gfx();
    img('chest', x, y + 1, 16, alien ? 0xcdb4ff : 0xcfc2e0);
    rect(g, x - 3.5, y - 4.5, 7, 4.5, 0x2c2a38, 1, INK, 1, 0.55);
    g.fillStyle(SK.pink, 1); g.fillCircle(x - 1.2, y - 2.3, 0.7); g.fillStyle(SK.cyan, 1); g.fillCircle(x + 1.4, y - 2.3, 0.7);
    arc(g, x - 4.2, y + 6, 3, Math.PI * 1.1, Math.PI * 2.1, SK.amber, 1, 0.8); arc(g, x + 4.2, y + 6, 3, Math.PI * 0.9, Math.PI * 1.9, SK.cyan, 1, 0.8);
  }

  // ---- tidal gate (10,8) ----
  { const x = 10 * TILE, y = 8 * TILE, g = gfx(); const lvl = Math.max(0, Math.min(3, w.water));
    g.fillStyle(0x7fcfd6, 0.7); g.fillRect(x + 3, y + 14 - (lvl + 1) * 2.8, 10, (lvl + 1) * 2.8);
    rect(g, x + 1, y + 2, 2.4, 13, 0xd9c39a, 1, INK, 1, 0.6); rect(g, x + 12.6, y + 2, 2.4, 13, 0xd9c39a, 1, INK, 1, 0.6);
    for (let k = 0; k < 3; k++) rect(g, x + 3.4, y + 4 + k * 3.8, 9.2, 2.6, 0xe3c796, 0.95, INK, 0.9, 0.5);
    for (let k = 0; k < 4; k++) ln(g, x + 14.8, y + 13 - k * 3, x + 16.4, y + 13 - k * 3, k <= lvl ? 0x2f8c97 : INK, 0.9, 0.5, k);
  }

  // ---- lighthouse (16,7) ----
  { const bx = 16 * TILE + 8, by = 7 * TILE + 15, g = gfx(); const top = by - 42;
    poly(g, [[bx - 7, by], [bx - 4.2, top], [bx + 4.2, top], [bx + 7, by]], alien ? 0x3a2f55 : 0xeee8dc, 1, INK, 1, 0.75);
    for (let k = 0; k < 3; k++) { const y1 = by - 6 - k * 13, y2 = y1 - 6; const f1 = (by - y1) / 42, f2 = (by - y2) / 42; poly(g, [[bx - 7 + 2.8 * f1, y1], [bx - 7 + 2.8 * f2, y2], [bx + 7 - 2.8 * f2, y2], [bx + 7 - 2.8 * f1, y1]], alien ? 0x7a5cd6 : 0xefc6d0, 0.85, INK, 0.6, 0.35); }
    rect(g, bx - 5.5, top - 6, 11, 6, lhLit ? SK.amber : 0xd3ccbc, 1, INK, 1, 0.7);
    poly(g, [[bx - 6.5, top - 6], [bx, top - 11.5], [bx + 6.5, top - 6]], 0xb9b2a2, 1, INK, 1, 0.7);
    ln(g, bx - 5.5, top - 3, bx + 5.5, top - 3, INK, 0.7, 0.35, 1); poly(g, [[bx - 1.8, by], [bx - 1.8, by - 6], [bx + 1.8, by - 6], [bx + 1.8, by]], 0x8f7a58, 1, INK, 1, 0.5, false);
    if (lhLit) glow(g, bx, top - 3, 20, SK.amber, 0.7);
  }

  // ---- anchors: ground sigils ----
  for (const id of ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'] as const) {
    const t = OBJECT_TILES['anchor_' + id]; const a = s.anchors.find(q => q.id === id);
    const x = t.tx * TILE + 8, y = t.ty * TILE + (id === 'LIGHTHOUSE' ? 20 : 8), g = gfx();
    if (a?.aligned) {
      glow(g, x, y, 14, SK.amber, 0.7);
      ell(g, x, y, 6.8, 4.6, null, 0, SK.amber, 1, 1.1); ell(g, x, y, 4.6, 3.1, null, 0, SK.cyan, 1, 1.1);
      for (let k = 0; k < 8; k++) { const th = k * Math.PI / 4; ln(g, x + Math.cos(th) * 8, y + Math.sin(th) * 5.4, x + Math.cos(th) * 10.4, y + Math.sin(th) * 7, SK.amber, 0.9, 0.5, k); }
    } else {
      // dashed sigil ring + one half-ring per being that has prepared this anchor
      for (let k = 0; k < 12; k += 2) arc(g, x, y, 6.2, k * Math.PI / 6, (k + 1) * Math.PI / 6, INK, 0.7, 0.5);
      if (a?.playerReady) arc(g, x, y, 4.4, Math.PI * 0.5, Math.PI * 1.5, SK.amber, 1, 1.1);
      if (a?.partnerReady) arc(g, x, y, 4.4, -Math.PI * 0.5, Math.PI * 0.5, SK.cyan, 1, 1.1);
      g.fillStyle(INK, 0.7); g.fillCircle(x, y, 0.7);
    }
  }

  // ---- world-instability haze ----
  if (!ghost && w.instability > 40) { const g = gfx(); const col = alien ? SK.alienSpore : 0xa89bdb; for (const [px, py, r] of [[30, 22, 36], [290, 150, 40], [250, 30, 22]] as const) glow(g, px, py, r, col, 0.4); }
}

// ======================================================================================================
// Dynamic layer: figures, prompt bubble, apparitions, light, sparks
// ======================================================================================================
export interface Apparition { x: number; y: number; until: number; label: string }

export class ScribbleFx {
  private bubble: Phaser.GameObjects.Text;
  private tag: Phaser.GameObjects.Text;
  private bubbleG: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene) {
    const mk = (size: number, col: string) => scene.add.text(0, 0, '', { fontFamily: 'Georgia, "DejaVu Serif", serif', fontSize: size + 'px', color: col, align: 'center' }).setOrigin(0.5, 1).setResolution(5).setDepth(9).setVisible(false);
    this.bubbleG = scene.add.graphics().setDepth(8);
    this.bubble = mk(4.6, '#3b3a40');
    this.tag = mk(3.6, '#2b6f77');
  }

  clear(): void { this.bubble.setVisible(false); this.tag.setVisible(false); this.bubbleG.clear(); }

  /** Sketched figure: amber or cyan body, graphite outline. `a` alpha; `ghost` draws a dashed outline. */
  figure(g: G, x: number, y: number, col: number, face: number, bob: number, a: number, ghost: boolean, alien: boolean): void {
    const INK = alien ? SK.alienInk : SK.graphite;
    g.fillStyle(0x000000, 0.14 * a); g.fillEllipse(x, y + 0.5, 9, 3);
    const by = y - bob;
    if (ghost) { for (let k = 0; k < 10; k++) arc(g, x, by - 6.5, 5.6, k * 0.628, k * 0.628 + 0.33, col, a, 0.9); }
    ell(g, x, by - 4.3, 3.9, 4.5, col, 0.95 * a, INK, a, ghost ? 0.4 : 0.8, 1);
    ell(g, x, by - 10.6, 3.4, 3.3, col, 0.95 * a, INK, a, ghost ? 0.4 : 0.8, 2);
    g.fillStyle(INK, a); g.fillCircle(x + face * 1.5 - 0.9, by - 10.9, 0.5); g.fillCircle(x + face * 1.5 + 0.9, by - 10.9, 0.5);
    ln(g, x - 1.8, by + 0.2, x - 1.8, by + 1.2, INK, a, 0.6, 3); ln(g, x + 1.8, by + 0.2, x + 1.8, by + 1.2, INK, a, 0.6, 4);
  }

  /** Verb prompt bubble anchored to the focused object. */
  prompt(focusId: string | null, tx: number, ty: number, flapT: number): void {
    this.bubbleG.clear();
    if (!focusId) { this.bubble.setVisible(false); return; }
    const fork = FORK_OBJECTS.has(focusId);
    const label = OBJECT_LABELS[focusId] ?? focusId;
    const verbs = fork ? 'E keep    Q send across    F let it be' : 'E use';
    this.bubble.setText(`${label}\n${verbs}`).setVisible(true);
    const bw = Math.max(this.bubble.width, 30) / 5 * 5 / 1, bh = this.bubble.height;
    const w = this.bubble.displayWidth + 6, h = this.bubble.displayHeight + 4;
    void bw; void bh;
    const o = OBJECT_TILES[focusId];
    const cxp = Phaser.Math.Clamp(o.tx * TILE + 8, w / 2 + 2, 320 - w / 2 - 2);
    const top = Math.max(h + 2, o.ty * TILE - (focusId === 'radio' || focusId === 'anchor_LIGHTHOUSE' ? 24 : 6) + Math.sin(flapT * 3) * 0.6);
    const y = Math.min(top, 176);
    this.bubble.setPosition(cxp, y - 2);
    const g = this.bubbleG;
    g.fillStyle(0xfffaf0, 0.96); g.fillRoundedRect(cxp - w / 2, y - h, w, h, 1.6);
    g.lineStyle(0.6, SK.graphite, 1); g.strokeRoundedRect(cxp - w / 2, y - h, w, h, 1.6);
    g.fillStyle(0xfffaf0, 0.96); g.fillTriangle(cxp - 1.6, y, cxp + 1.6, y, cxp, y + 2.6);
    g.lineStyle(0.6, SK.graphite, 1); g.lineBetween(cxp - 1.6, y, cxp, y + 2.6); g.lineBetween(cxp + 1.6, y, cxp, y + 2.6);
    g.fillStyle(SK.amber, 1); g.fillCircle(cxp - w / 2 + 2.2, y - h + 2.4, 0.9);
    void tx; void ty;
  }

  label(show: boolean, x: number, y: number, a: number, text = 'VARIANT / ECHO'): void {
    this.tag.setVisible(show).setText(text).setPosition(x, y).setAlpha(a);
  }
}

/** Per-frame ambient lights/sparks (call each frame with the live graphics). */
export function drawScribbleAmbient(g: G, cx: ScribbleCtx, t: number, reduce: boolean, focusId: string | null, drawn: { lit: boolean; lhLit: boolean }): void {
  const { w, realm, s } = cx;
  const alien = realm === 'ALIEN';
  const flick = reduce ? 0 : Math.sin(t * 5.1) * 0.05 + Math.sin(t * 8.3) * 0.03;
  if (drawn.lit) glow(g, 9 * TILE + 11.5, 4 * TILE - 0.5, 16 + flick * 20, SK.amber, 0.22 + flick);
  if (drawn.lhLit) {
    const sw = reduce ? 0 : Math.sin(t * 0.5) * 14, bx = 16 * TILE + 8, by = 7 * TILE - 30;
    g.fillStyle(SK.amber, 0.14); g.fillTriangle(bx, by, bx - 130, by - 32 + sw, bx - 130, by + 40 + sw);
    g.fillStyle(SK.amber, 0.08); g.fillTriangle(bx, by, bx + 40, by - 10 - sw, bx + 40, by + 18 - sw);
  }
  if (w.signal >= 2 && !reduce) { const k = (t * 0.8) % 1; arc(g, 2 * TILE + 8, 3 * TILE + 15 - 40, 4 + k * 16, -Math.PI * 0.85, -Math.PI * 0.15, SK.cyan, 0.5 * (1 - k), 0.5); }
  if (s.v2?.examined?.includes('stones') && !reduce) { const k = (t * 0.5) % 1; arc(g, 3 * TILE + 8, 5 * TILE + 9, 3 + k * 12, 0, Math.PI * 2, SK.pink, 0.55 * (1 - k), 0.5); }
  if (alien && !reduce) for (let i = 0; i < 26; i++) { // drifting spores
    const sx = (jr(i, 3) + 0.5) * 320, sy = ((jr(i, 4) + 0.5) * 180 - t * (2 + (i % 5)) * 1.3 + 400) % 180;
    g.fillStyle(SK.alienSpore, 0.35 + 0.25 * Math.sin(t + i)); g.fillCircle(sx + Math.sin(t * 0.6 + i) * 3, sy, 0.5 + (i % 3) * 0.2);
  }
  void focusId;
}
export const identityColour = (id: Identity | undefined): number => (id === 'cyan' ? SK.cyan : SK.amber);
export const otherColour = (id: Identity | undefined): number => (id === 'cyan' ? SK.amber : SK.cyan);
export { MAP_W };
