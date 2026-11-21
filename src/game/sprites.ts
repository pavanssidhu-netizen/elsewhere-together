/**
 * Programmatic original pixel art for "Elsewhere, Together". No image files: everything is drawn
 * onto canvas textures at runtime by `registerTextures(scene)` (call once, e.g. in the Boot/Preload scene
 * create(); safe to call again, it skips textures that exist).
 *
 * ── TEXTURES (use as the first arg of scene.add.image / sprite) ───────────────────────────────
 *   TEX.tiles  'et_tiles'  16x16 frames, frame names are the TILE.* strings below
 *   TEX.chars  'et_chars'  12x16 frames for both beings, frame names via charFrame()/CHAR_FRAMES
 *   TEX.fx     'et_fx'     small effects: FX.rain (2x6), FX.spark (3x3), FX.ring (16x16 pulse ring), FX.glow (16x16 soft glow)
 *
 * ── TILE frame keys (TEX.tiles) ───────────────────────────────────────────────────────────────
 *   road ground ground_dark water wall fence bridge bridge_broken tree
 *   lamp_lit lamp_broken greenhouse_alive greenhouse_withered lighthouse_lit lighthouse_dark
 *   radio_tower thread_terminal
 *   anchor_lantern_lit anchor_lantern_unlit anchor_greenhouse_lit anchor_greenhouse_unlit
 *   anchor_lighthouse_lit anchor_lighthouse_unlit
 *   Also: TILE.anchor(id, lit) helper, e.g. TILE.anchor('LANTERN', true).
 *   Tall things (tree, lamp, lighthouse, radio tower) are drawn on a transparent background so place a
 *   `ground` tile underneath. Water/ground/road/wall/fence/bridge are opaque.
 *
 * ── CHARACTER frame keys (TEX.chars), 12x16, origin (0.5, 1) recommended ──────────────────────
 *   Names: `${who}_${dir}_${anim}_${i}`  who: player|partner, dir: down|up|side, anim: idle(0-1)|walk(0-3)
 *   'side' faces RIGHT; use sprite.setFlipX(true) for left. Helper: charFrame('player','side','walk',2).
 *   Animations registered globally (play with sprite.play(key)):
 *     `${who}_idle_${dir}` (2 frames, 2 fps), `${who}_walk_${dir}` (4 frames, 8 fps), dir: down|up|side
 *   Helper: animKey('player','walk','down'). Partner is cyan; both share the same silhouette family.
 *
 * Palette (spec): navy #111626, deep #1b263b, teal #4c8790, mist #b2c4ce, amber #e6b66e,
 *                 cyan #7be0df, violet #a89bdb, coral #e47f7c.
 */
import Phaser from 'phaser';
import { ART_INK, INK_SCALE } from './artStyle';
import { inkFrame, strSeed, inkStats } from './ink';

export const PAL = {
  navy: '#111626', deep: '#1b263b', teal: '#4c8790', mist: '#b2c4ce',
  amber: '#e6b66e', cyan: '#7be0df', violet: '#a89bdb', coral: '#e47f7c',
} as const;

const TILE_SIZE = 16;
const CHAR_W = 12;
const CHAR_H = 16;

/** Display scale for sprites/tiles: 1 in PIXEL style, 1/INK_SCALE in INK style (ink textures are INK_SCALE x bigger). */
export const SPRITE_SCALE = ART_INK ? 1 / INK_SCALE : 1;
/** INK only: number of extra ground variants (frames `ground#1..`, `ground_dark#1..`) to break up tiling. */
export const GROUND_VARIANTS = 4;

export const TEX = { tiles: 'et_tiles', chars: 'et_chars', fx: 'et_fx' } as const;

export const TILE = {
  road: 'road', ground: 'ground', ground_dark: 'ground_dark', water: 'water', wall: 'wall', fence: 'fence',
  bridge: 'bridge', bridge_broken: 'bridge_broken', tree: 'tree',
  lamp_lit: 'lamp_lit', lamp_broken: 'lamp_broken',
  greenhouse_alive: 'greenhouse_alive', greenhouse_withered: 'greenhouse_withered',
  lighthouse_lit: 'lighthouse_lit', lighthouse_dark: 'lighthouse_dark',
  radio_tower: 'radio_tower', thread_terminal: 'thread_terminal',
  anchor(id: 'LANTERN' | 'GREENHOUSE' | 'LIGHTHOUSE', lit: boolean): string {
    return `anchor_${id.toLowerCase()}_${lit ? 'lit' : 'unlit'}`;
  },
} as const;

export const FX = { rain: 'rain', spark: 'spark', ring: 'ring', glow: 'glow' } as const;

export type Who = 'player' | 'partner';
export type Dir = 'down' | 'up' | 'side';
export type Anim = 'idle' | 'walk';

export function charFrame(who: Who, dir: Dir, anim: Anim, i: number): string {
  return `${who}_${dir}_${anim}_${i}`;
}
export function animKey(who: Who, anim: Anim, dir: Dir): string {
  return `${who}_${anim}_${dir}`;
}

// Ordered tile list = sheet layout (8 per row).
const TILE_ORDER = [
  'road', 'ground', 'ground_dark', 'water', 'wall', 'fence', 'bridge', 'bridge_broken',
  'tree', 'lamp_lit', 'lamp_broken', 'greenhouse_alive', 'greenhouse_withered', 'lighthouse_lit', 'lighthouse_dark', 'radio_tower',
  'thread_terminal', 'anchor_lantern_lit', 'anchor_lantern_unlit', 'anchor_greenhouse_lit', 'anchor_greenhouse_unlit',
  'anchor_lighthouse_lit', 'anchor_lighthouse_unlit',
] as const;

type Ctx = CanvasRenderingContext2D;

function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

/** Tiny deterministic PRNG so textures are identical every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(c: Ctx, ox: number, oy: number, cols: string[], n: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) rect(c, ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), 1, 1, cols[Math.floor(r() * cols.length)]);
}

// ───────────────────────────── tiles ─────────────────────────────

function drawGround(c: Ctx, x: number, y: number, dark: boolean, variant = 0): void {
  rect(c, x, y, 16, 16, dark ? '#16202f' : '#1b263b');
  speckle(c, x, y, dark ? ['#111626', '#1b263b'] : ['#223149', '#4c8790', '#16202f'], 14, (dark ? 7 : 3) + variant * 17);
}

function drawGlow(c: Ctx, cx: number, cy: number, r: number, col: string, a: number): void {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = col;
  for (let d = r; d > 0; d -= 2) {
    c.globalAlpha = a * (1 - d / (r + 2)) * 0.9;
    c.beginPath();
    c.arc(cx, cy, d, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawTile(c: Ctx, name: string, x: number, y: number): void {
  switch (name) {
    case 'road':
      rect(c, x, y, 16, 16, '#2a3850');
      speckle(c, x, y, ['#34455f', '#1b263b', '#4c8790'], 10, 11);
      rect(c, x, y + 7, 4, 1, '#4c8790'); rect(c, x + 8, y + 7, 4, 1, '#4c8790');
      break;
    case 'ground': drawGround(c, x, y, false); break;
    case 'ground_dark': drawGround(c, x, y, true); break;
    case 'ground#1': case 'ground#2': case 'ground#3': drawGround(c, x, y, false, +name.slice(7)); break;
    case 'ground_dark#1': case 'ground_dark#2': case 'ground_dark#3': drawGround(c, x, y, true, +name.slice(12)); break;
    case 'water':
      rect(c, x, y, 16, 16, '#183049');
      for (let i = 0; i < 4; i++) {
        rect(c, x + ((i * 5) % 12), y + 2 + i * 4, 5, 1, '#4c8790');
        rect(c, x + ((i * 7 + 6) % 11), y + 4 + i * 4, 3, 1, '#2d5568');
      }
      break;
    case 'wall':
      rect(c, x, y, 16, 16, '#2b3a55');
      for (let r2 = 0; r2 < 4; r2++) {
        rect(c, x, y + r2 * 4 + 3, 16, 1, '#111626');
        const off = r2 % 2 ? 4 : 0;
        for (let k = off; k < 16; k += 8) rect(c, x + k, y + r2 * 4, 1, 4, '#111626');
        rect(c, x, y + r2 * 4, 16, 1, '#3d4f6d');
      }
      break;
    case 'fence':
      drawGround(c, x, y, false);
      rect(c, x, y + 6, 16, 2, '#6b5a47'); rect(c, x, y + 10, 16, 2, '#6b5a47');
      for (const px of [1, 7, 13]) { rect(c, x + px, y + 3, 2, 11, '#8a7558'); rect(c, x + px, y + 3, 2, 1, '#b2c4ce'); }
      break;
    case 'bridge':
      rect(c, x, y, 16, 16, '#183049');
      rect(c, x, y + 2, 16, 12, '#8a7558');
      for (let k = 0; k < 16; k += 4) rect(c, x + k, y + 2, 1, 12, '#5d4d3c');
      rect(c, x, y + 2, 16, 1, '#e6b66e'); rect(c, x, y + 13, 16, 1, '#5d4d3c');
      rect(c, x, y, 16, 2, '#b2c4ce'); rect(c, x, y + 14, 16, 2, '#b2c4ce');
      break;
    case 'bridge_broken':
      rect(c, x, y, 16, 16, '#183049');
      rect(c, x, y + 2, 5, 12, '#8a7558'); rect(c, x + 11, y + 2, 5, 12, '#8a7558');
      rect(c, x + 5, y + 5, 2, 2, '#5d4d3c'); rect(c, x + 9, y + 9, 2, 2, '#5d4d3c');
      rect(c, x + 4, y + 2, 1, 12, '#111626'); rect(c, x + 11, y + 2, 1, 12, '#111626');
      rect(c, x + 6, y + 12, 4, 1, '#4c8790'); rect(c, x + 3, y + 14, 5, 1, '#4c8790');
      rect(c, x, y, 5, 2, '#b2c4ce'); rect(c, x + 11, y, 5, 2, '#b2c4ce');
      rect(c, x + 7, y + 2, 1, 1, '#e47f7c'); rect(c, x + 8, y + 3, 1, 1, '#e47f7c');
      break;
    case 'tree':
      rect(c, x + 7, y + 10, 2, 6, '#5d4d3c');
      rect(c, x + 3, y + 3, 10, 8, '#2d5a55'); rect(c, x + 5, y + 1, 6, 4, '#2d5a55');
      rect(c, x + 4, y + 4, 4, 3, '#4c8790'); rect(c, x + 8, y + 7, 4, 2, '#1f4440');
      break;
    case 'lamp_lit':
      drawGlow(c, x + 8, y + 4, 8, '#e6b66e', 0.35);
      rect(c, x + 7, y + 6, 2, 10, '#2b3a55'); rect(c, x + 5, y + 14, 6, 2, '#2b3a55');
      rect(c, x + 5, y + 1, 6, 5, '#e6b66e'); rect(c, x + 6, y + 2, 4, 3, '#fff2cf'); rect(c, x + 5, y, 6, 1, '#2b3a55');
      break;
    case 'lamp_broken':
      rect(c, x + 7, y + 7, 2, 9, '#2b3a55'); rect(c, x + 5, y + 14, 6, 2, '#2b3a55');
      rect(c, x + 5, y + 3, 6, 4, '#3d4f6d'); rect(c, x + 7, y + 4, 1, 3, '#111626');
      rect(c, x + 4, y + 8, 1, 1, '#e47f7c'); rect(c, x + 11, y + 9, 1, 1, '#e47f7c');
      break;
    case 'greenhouse_alive':
      rect(c, x + 1, y + 5, 14, 11, '#2b3a55');
      rect(c, x + 2, y + 6, 12, 9, '#35706c'); rect(c, x + 3, y + 3, 10, 3, '#4c8790'); rect(c, x + 5, y + 1, 6, 2, '#b2c4ce');
      rect(c, x + 7, y + 6, 1, 9, '#b2c4ce'); rect(c, x + 2, y + 10, 12, 1, '#b2c4ce');
      rect(c, x + 4, y + 11, 2, 3, '#7be0a0'); rect(c, x + 10, y + 12, 2, 2, '#7be0a0'); rect(c, x + 9, y + 8, 2, 2, '#e6b66e');
      break;
    case 'greenhouse_withered':
      rect(c, x + 1, y + 5, 14, 11, '#2b3a55');
      rect(c, x + 2, y + 6, 12, 9, '#2a3850'); rect(c, x + 3, y + 3, 10, 3, '#3d4f6d'); rect(c, x + 5, y + 1, 6, 2, '#8896a3');
      rect(c, x + 7, y + 6, 1, 9, '#8896a3'); rect(c, x + 2, y + 10, 12, 1, '#8896a3');
      rect(c, x + 4, y + 13, 2, 1, '#6b5a47'); rect(c, x + 10, y + 13, 2, 1, '#6b5a47'); rect(c, x + 5, y + 12, 1, 1, '#6b5a47');
      rect(c, x + 12, y + 7, 1, 1, '#e47f7c');
      break;
    case 'lighthouse_lit':
    case 'lighthouse_dark': {
      const lit = name === 'lighthouse_lit';
      if (lit) drawGlow(c, x + 8, y + 3, 8, '#e6b66e', 0.4);
      rect(c, x + 5, y + 6, 6, 10, '#b2c4ce'); rect(c, x + 4, y + 14, 8, 2, '#8896a3');
      rect(c, x + 5, y + 8, 6, 2, '#e47f7c'); rect(c, x + 5, y + 12, 6, 2, '#e47f7c');
      rect(c, x + 4, y + 5, 8, 1, '#2b3a55'); rect(c, x + 5, y + 1, 6, 4, lit ? '#e6b66e' : '#2b3a55');
      if (lit) rect(c, x + 7, y + 2, 2, 2, '#fff2cf'); else rect(c, x + 7, y + 2, 2, 2, '#111626');
      rect(c, x + 6, y, 4, 1, '#2b3a55');
      break;
    }
    case 'radio_tower':
      rect(c, x + 7, y + 3, 2, 13, '#8896a3');
      for (let k = 0; k < 4; k++) { rect(c, x + 7 - k, y + 15 - k * 3, 1, 1, '#8896a3'); rect(c, x + 8 + k, y + 15 - k * 3, 1, 1, '#8896a3'); rect(c, x + 7 - k, y + 12 - k * 3, 2 + k * 2, 1, '#4c8790'); }
      rect(c, x + 6, y + 1, 4, 2, '#4c8790'); rect(c, x + 7, y, 2, 1, '#e47f7c');
      break;
    case 'thread_terminal':
      drawGround(c, x, y, false);
      rect(c, x + 3, y + 5, 10, 9, '#2b3a55'); rect(c, x + 4, y + 6, 8, 5, '#111626');
      rect(c, x + 5, y + 7, 6, 1, '#7be0df'); rect(c, x + 5, y + 9, 4, 1, '#e6b66e');
      rect(c, x + 5, y + 12, 6, 1, '#4c8790'); rect(c, x + 2, y + 14, 12, 1, '#16202f');
      break;
    default:
      if (name.startsWith('anchor_')) drawAnchor(c, name, x, y);
  }
}

function drawAnchor(c: Ctx, name: string, x: number, y: number): void {
  const lit = name.endsWith('_lit');
  const kind = name.split('_')[1];
  drawGround(c, x, y, true);
  const col = lit ? PAL.violet : '#3d4f6d';
  if (lit) drawGlow(c, x + 8, y + 8, 8, PAL.violet, 0.45);
  rect(c, x + 2, y + 13, 12, 1, lit ? '#a89bdb' : '#2b3a55'); // plinth line
  if (kind === 'lantern') {
    rect(c, x + 6, y + 3, 4, 1, col); rect(c, x + 5, y + 4, 6, 7, col); rect(c, x + 6, y + 5, 4, 5, lit ? '#fff2cf' : '#111626'); rect(c, x + 6, y + 11, 4, 1, col);
  } else if (kind === 'greenhouse') {
    rect(c, x + 7, y + 4, 2, 8, col); rect(c, x + 4, y + 5, 3, 2, col); rect(c, x + 9, y + 7, 3, 2, col); rect(c, x + 5, y + 11, 6, 1, col);
  } else {
    rect(c, x + 7, y + 3, 2, 9, col); rect(c, x + 5, y + 6, 6, 1, col); rect(c, x + 5, y + 4, 1, 2, col); rect(c, x + 10, y + 4, 1, 2, col); rect(c, x + 6, y + 12, 4, 1, col);
  }
}

// ───────────────────────────── characters ─────────────────────────────

interface Look { body: string; shade: string; light: string }
const LOOKS: Record<Who, Look> = {
  player: { body: PAL.amber, shade: '#a8783a', light: '#f6dca8' },
  partner: { body: PAL.cyan, shade: '#3f9ca0', light: '#d4fbfa' },
};

/**
 * Draw a 12x16 being. Small round-headed cloak figure with a Thread tail-wisp.
 * frame: walk 0..3 (legs/bob), idle 0..1 (breathe).
 */
function drawChar(c: Ctx, ox: number, oy: number, who: Who, dir: Dir, anim: Anim, i: number): void {
  const L = LOOKS[who];
  const walk = anim === 'walk';
  const bob = walk ? (i % 2 === 1 ? -1 : 0) : (i === 1 ? 1 : 0); // idle: breathe 1px lower
  const step = walk ? [0, 1, 0, -1][i] : 0;
  const top = oy + 1 + (walk ? bob : 0);
  const idleDip = anim === 'idle' ? bob : 0;

  // shadow
  rect(c, ox + 2, oy + 15, 8, 1, 'rgba(17,22,38,0.55)');

  // legs
  const legY = oy + 13;
  if (dir === 'side') {
    rect(c, ox + 5 + step, legY, 2, 2, L.shade);
    rect(c, ox + 5 - step, legY, 2, 2, '#2b3a55');
  } else {
    rect(c, ox + 3, legY + (step > 0 ? -1 : 0), 2, 2, L.shade);
    rect(c, ox + 7, legY + (step < 0 ? -1 : 0), 2, 2, L.shade);
  }

  // cloak body
  const bx = dir === 'side' ? 3 : 2;
  const bw = dir === 'side' ? 6 : 8;
  rect(c, ox + bx, top + 7 + idleDip, bw, 6 - idleDip, L.body);
  rect(c, ox + bx, top + 11, bw, 1, L.shade);
  rect(c, ox + bx + (dir === 'side' ? 0 : 0), top + 7 + idleDip, 1, 5, L.light); // rim light

  // head
  const hx = dir === 'side' ? 3 : 2;
  const hw = dir === 'side' ? 7 : 8;
  rect(c, ox + hx, top + idleDip, hw, 7, L.body);
  rect(c, ox + hx + 1, top - 1 + idleDip, hw - 2, 1, L.body);
  rect(c, ox + hx + 1, top + idleDip, hw - 2, 1, L.light);

  // face / eyes
  if (dir === 'down') {
    rect(c, ox + 4, top + 3 + idleDip, 1, 2, PAL.navy); rect(c, ox + 7, top + 3 + idleDip, 1, 2, PAL.navy);
  } else if (dir === 'side') {
    rect(c, ox + 8, top + 3 + idleDip, 1, 2, PAL.navy);
  } else {
    rect(c, ox + 3, top + 1 + idleDip, 6, 1, L.shade); // back of head hood seam
  }

  // Thread wisp (tail antenna) — link between beings
  const wx = dir === 'side' ? 2 : 9;
  rect(c, ox + wx, top - 1 + idleDip, 1, 1, L.light);
  rect(c, ox + wx + (i % 2 ? 1 : 0), top - 2 + idleDip, 1, 1, who === 'player' ? PAL.cyan : PAL.amber);
}

// ───────────────────────────── registration ─────────────────────────────

function addFrames(tex: Phaser.Textures.CanvasTexture, frames: [string, number, number, number, number][]): void {
  for (const [n, x, y, w, h] of frames) if (!tex.has(n)) tex.add(n, 0, x, y, w, h);
}

type FrameDef = [string, number, number, number, number];

/**
 * Create a canvas texture `key` of size w x h from `draw` (which paints the PIXEL art and returns frame rects).
 * PIXEL style: the pixel art is used as is (NEAREST). INK style: every frame is re-rendered by the ink post-process
 * at INK_SCALE x, with the SAME key and frame names (frame rects scaled), LINEAR filtered.
 */
function makeSheet(tm: Phaser.Textures.TextureManager, key: string, w: number, h: number, draw: (c: Ctx) => FrameDef[], stat: 'tilesMs' | 'charsMs' | 'fxMs', smooth = false): void {
  if (!ART_INK) {
    const t = tm.createCanvas(key, w, h); if (!t) return;
    addFrames(t, draw(t.getContext()));
    t.refresh(); t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return;
  }
  const t0 = performance.now();
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sc = src.getContext('2d')!;
  const frames = draw(sc);
  const S = INK_SCALE;
  const t = tm.createCanvas(key, w * S, h * S); if (!t) return;
  const c = t.getContext();
  if (smooth) { // fx: soft sprites are just smoothly upscaled
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, w * S, h * S);
  } else {
    for (const [n, x, y, fw, fh] of frames) {
      c.putImageData(inkFrame(sc.getImageData(x, y, fw, fh), n, S, strSeed(key + n)), x * S, y * S);
      inkStats.frames++;
    }
  }
  addFrames(t, frames.map(([n, x, y, fw, fh]) => [n, x * S, y * S, fw * S, fh * S] as FrameDef));
  t.refresh(); t.setFilter(Phaser.Textures.FilterMode.LINEAR);
  inkStats[stat] += performance.now() - t0;
}

export function registerTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;

  if (!tm.exists(TEX.tiles)) {
    const cols = 8;
    const order: string[] = [...TILE_ORDER];
    if (ART_INK) for (let v = 1; v < GROUND_VARIANTS; v++) order.push(`ground#${v}`, `ground_dark#${v}`);
    const rows = Math.ceil(order.length / cols);
    makeSheet(tm, TEX.tiles, cols * TILE_SIZE, rows * TILE_SIZE, (c) => {
      const frames: FrameDef[] = [];
      order.forEach((name, idx) => {
        const x = (idx % cols) * TILE_SIZE;
        const y = Math.floor(idx / cols) * TILE_SIZE;
        drawTile(c, name, x, y);
        frames.push([name, x, y, TILE_SIZE, TILE_SIZE]);
      });
      return frames;
    }, 'tilesMs');
  }

  if (!tm.exists(TEX.chars)) {
    const whos: Who[] = ['player', 'partner'];
    const dirs: Dir[] = ['down', 'up', 'side'];
    // layout: one row per (who, dir, anim); 4 columns
    const rowsList: { who: Who; dir: Dir; anim: Anim; n: number }[] = [];
    for (const who of whos) for (const dir of dirs) { rowsList.push({ who, dir, anim: 'idle', n: 2 }); rowsList.push({ who, dir, anim: 'walk', n: 4 }); }
    makeSheet(tm, TEX.chars, CHAR_W * 4, CHAR_H * rowsList.length, (c) => {
      const frames: FrameDef[] = [];
      rowsList.forEach((r, ri) => {
        for (let i = 0; i < r.n; i++) {
          drawChar(c, i * CHAR_W, ri * CHAR_H, r.who, r.dir, r.anim, i);
          frames.push([charFrame(r.who, r.dir, r.anim, i), i * CHAR_W, ri * CHAR_H, CHAR_W, CHAR_H]);
        }
      });
      return frames;
    }, 'charsMs');
    // animations
    for (const who of whos) for (const dir of dirs) {
      const idleKey = animKey(who, 'idle', dir);
      const walkKey = animKey(who, 'walk', dir);
      if (!scene.anims.exists(idleKey)) scene.anims.create({
        key: idleKey, frameRate: 2, repeat: -1,
        frames: [0, 1].map((i) => ({ key: TEX.chars, frame: charFrame(who, dir, 'idle', i) })),
      });
      if (!scene.anims.exists(walkKey)) scene.anims.create({
        key: walkKey, frameRate: 8, repeat: -1,
        frames: [0, 1, 2, 3].map((i) => ({ key: TEX.chars, frame: charFrame(who, dir, 'walk', i) })),
      });
    }
  }

  if (!tm.exists(TEX.fx)) {
    makeSheet(tm, TEX.fx, 40, 16, (c) => {
      // rain streak at (0,0) 2x6
      rect(c, 1, 0, 1, 3, PAL.mist); rect(c, 0, 3, 1, 3, PAL.teal);
      // spark at (4,0) 3x3 plus shape
      rect(c, 5, 0, 1, 3, PAL.cyan); rect(c, 4, 1, 3, 1, PAL.cyan);
      // ring at (8,0) 16x16 -> only 16 wide; place at x=8..24
      c.strokeStyle = PAL.violet; c.lineWidth = 1;
      c.beginPath(); c.arc(16, 8, 6.5, 0, Math.PI * 2); c.stroke();
      // glow at (24,0)
      drawGlow(c, 32, 8, 8, PAL.mist, 0.5);
      return [[FX.rain, 0, 0, 2, 6], [FX.spark, 4, 0, 3, 3], [FX.ring, 8, 0, 16, 16], [FX.glow, 24, 0, 16, 16]];
    }, 'fxMs', true);
  }
  if (ART_INK) console.info(`[ink] textures: tiles ${inkStats.tilesMs.toFixed(0)}ms, chars ${inkStats.charsMs.toFixed(0)}ms, fx ${inkStats.fxMs.toFixed(0)}ms (${inkStats.frames} frames @${INK_SCALE}x)`);
}
