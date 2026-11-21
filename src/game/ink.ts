/**
 * INK art style: a procedural "loose hand-drawn sketch" renderer. Everything here is original and deterministic
 * (seeded hash noise, never Math.random), so every load and every screenshot is identical.
 *
 * Pipeline (per sprite frame or portrait):
 *   1. A TONE MAP assigns each hi-res pixel one tone (paper, grey patch, teal, deep blue, amber, ink ...).
 *      For sprites the map is built from the existing 16x16 / 12x16 pixel frames: each source pixel is classified
 *      into a tone, then the map is sampled at INK_SCALE x resolution with bilinear voting (rounds off the pixel
 *      steps) and a smooth noise DOMAIN WARP (wobble). For portraits the map comes from analytic shapes.
 *   2. FILL: tone colours are sampled with a small smooth offset and per-pixel jitter, so grey patches are
 *      mis-registered against the line art and have sponge/dithered edges ("don't quite stay inside the lines").
 *   3. HATCH: short, broken diagonal strokes inside tones flagged `hatch` (shadow areas).
 *   4. OUTLINE: tone boundaries become ink strokes: discs stamped along the edge with noise-varied radius
 *      (uneven weight), occasional gaps, plus a faint second offset line for the sketchy double stroke.
 */
// (palette duplicated here on purpose: sprites.ts imports this module, so importing PAL back would be circular)
import { ART_LIGHT } from './artStyle';
const PAL = { teal: '#4c8790', mist: '#b2c4ce', amber: '#e6b66e', cyan: '#7be0df', violet: '#a89bdb', coral: '#e47f7c' } as const;

/** Tunable look constants (all in hi-res pixels, i.e. 1/INK_SCALE of a logical pixel). */
const CFG_LIGHT = {
  wobble: 2.2,        // outline wobble amplitude (domain warp)
  lineWidth: 1.0,     // global ink line weight multiplier
  gap: 0.80,          // noise threshold above which outline breaks (lower = more gaps)
  doubleLine: true,   // faint second sketch stroke along silhouettes
  hatchSpacing: 6,    // px between hatch strokes (higher = sparser)
  hatchWidth: 1.5,    // hatch stroke thickness
  hatchAlpha: 0.72,
  hatchBreak: 0.42,   // noise threshold for a hatch stroke to exist (higher = shorter, sparser strokes)
  misreg: 2.6,        // patch mis-registration vs. the lines
  sponge: 1.7,        // per-pixel jitter of patch edges (rough edge)
  pores: 0.06,        // fraction of sponge pores (light specks) in grey patches
  grain: 0.05,        // paper grain amplitude
  objectLine: 1.0,    // extra line weight for objects/beings/interactables (calm ground/water/walls use 1)
  calmTicks: 3,       // grass-tick strokes per ground tile
  patchThr: 0.5,      // ground patch noise threshold (higher = fewer, larger tone patches)
};
// DARK paper: calmer (fewer, larger marks on ground/water/walls) and bolder outlines on objects
const CFG_DARK: typeof CFG_LIGHT = {
  ...CFG_LIGHT, wobble: 2.4, lineWidth: 1.0, gap: 0.86, hatchSpacing: 9, hatchWidth: 1.7, hatchAlpha: 0.55, hatchBreak: 0.55,
  misreg: 3.2, sponge: 1.5, pores: 0.025, grain: 0.035, objectLine: 1.7, calmTicks: 1, patchThr: 0.6,
};
export const INK_CFG = ART_LIGHT ? CFG_LIGHT : CFG_DARK;

/** Line colour: deep ink on pale paper (INK-LIGHT), pale mist on the dark ground (INK). */
export const INK_RGB: [number, number, number] = ART_LIGHT ? [11, 15, 28] : [178, 196, 206];
const DEEP_INK: [number, number, number] = [11, 15, 28]; // #0b0f1c
const TEAL_RGB: [number, number, number] = [76, 135, 144];

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ───────────── tones ─────────────
export const TN = {
  NONE: 0, PAPER: 1, HI: 2, GPATCH: 3, PATCH: 4, TEAL: 5, DEEP: 6, INK: 7, AMBER: 8, AMBER_H: 9, CYAN: 10, CYAN_H: 11,
  VIOLET: 12, CORAL: 13, GLOW_V: 14, GLOW_A: 15, SHADOW: 16,
} as const;

interface Tone { rgb: [number, number, number]; a: number; soft: boolean; hatch: boolean; fixed: boolean; bias: number }
const tone = (hex: string, o: Partial<Tone> = {}): Tone => ({ rgb: hexRgb(hex), a: 1, soft: false, hatch: false, fixed: false, bias: 1.35, ...o });
const TONES: Tone[] = [];
TONES[TN.NONE] = tone('#000000', { a: 0, soft: true, bias: 1 });
if (ART_LIGHT) {
  TONES[TN.PAPER] = tone(PAL.mist, { soft: true, bias: 1 });
  TONES[TN.HI] = tone('#e8eef1', { fixed: true });
  TONES[TN.GPATCH] = tone('#8eaab3', { soft: true, bias: 1.1 });
  TONES[TN.PATCH] = tone('#7fa3ab', { hatch: true });
  TONES[TN.TEAL] = tone(PAL.teal, { hatch: true });
  TONES[TN.DEEP] = tone('#2a3c57');
  TONES[TN.INK] = tone('#0b0f1c', { fixed: true, bias: 2 });
  TONES[TN.SHADOW] = tone('#2a3c57', { a: 0.4, soft: true, bias: 1 });
} else { // dark twilight ground; amber/cyan/violet/coral stay reserved for beings, signals, lit lamps/anchors and the thread
  TONES[TN.PAPER] = tone('#1b263b', { soft: true, bias: 1 });
  TONES[TN.HI] = tone('#b2c4ce', { fixed: true });
  TONES[TN.GPATCH] = tone('#22324b', { soft: true, bias: 1.1 });
  TONES[TN.PATCH] = tone('#2b4a60', { hatch: true });
  TONES[TN.TEAL] = tone('#3a6c76', { hatch: true });
  TONES[TN.DEEP] = tone('#24405a');
  TONES[TN.INK] = tone('#0b0f1c', { fixed: true, bias: 2 });
  TONES[TN.SHADOW] = tone('#0b0f1c', { a: 0.4, soft: true, bias: 1 });
}
TONES[TN.AMBER] = tone(PAL.amber, { fixed: true });
TONES[TN.AMBER_H] = tone(PAL.amber, { fixed: true, hatch: true });
TONES[TN.CYAN] = tone(PAL.cyan, { fixed: true });
TONES[TN.CYAN_H] = tone(PAL.cyan, { fixed: true, hatch: true });
TONES[TN.VIOLET] = tone(PAL.violet, { fixed: true });
TONES[TN.CORAL] = tone(PAL.coral, { fixed: true });
TONES[TN.GLOW_V] = tone(PAL.violet, { a: 0.4, soft: true, bias: 1 });
TONES[TN.GLOW_A] = tone(PAL.amber, { a: 0.32, soft: true, bias: 1 });
const PAPER_RGB = TONES[TN.PAPER].rgb;

// ───────────── seeded noise ─────────────
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x: number, y: number, s: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function strSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ───────────── composer ─────────────
export interface ComposeOpts {
  opaque?: boolean;   // frame fully covers its rect (ground tiles): translucent tones are pre-blended on paper
  ticks?: number;     // number of short ink grass-tick strokes
  lineMul?: number;   // multiplier for outline radius (portraits are drawn bigger)
  hatchSpacing?: number;
  gap?: number;
  alphaMul?: number;
  misreg?: number;
  lineRgb?: [number, number, number]; // outline colour (default INK_RGB)
}

function lineWeight(a: number, b: number): number {
  const A = TONES[a], B = TONES[b];
  if (A.soft && B.soft) return 0;
  if (a === TN.INK || b === TN.INK) return 0;
  let w = a === TN.NONE || b === TN.NONE ? 1 : 0.72;
  if (a === TN.HI || b === TN.HI) w *= 0.55;
  return w;
}

function stamp(cov: Float32Array, W: number, H: number, cx: number, cy: number, r: number, k: number): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const c = Math.min(1, Math.max(0, r - d + 0.5)) * k;
    const i = y * W + x; if (c > cov[i]) cov[i] = c;
  }
}

/** toneAt receives WARPED hi-res coordinates (pixel centres at +0.5) and returns a TN id. */
export function inkCompose(W: number, H: number, toneAt: (x: number, y: number) => number, seed: number, o: ComposeOpts = {}): ImageData {
  const C = INK_CFG;
  const T0 = new Uint8Array(W * H), T1 = C.doubleLine ? new Uint8Array(W * H) : null;
  const wob = C.wobble;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = (vn(x * 0.07, y * 0.07, seed) - 0.5) * 2 * wob + (vn(x * 0.3, y * 0.3, seed + 1) - 0.5) * 0.7 * wob;
    const wy = (vn(x * 0.07 + 50, y * 0.07, seed + 2) - 0.5) * 2 * wob + (vn(x * 0.3, y * 0.3 + 50, seed + 3) - 0.5) * 0.7 * wob;
    T0[y * W + x] = toneAt(x + 0.5 + wx, y + 0.5 + wy);
    if (T1) {
      const ux = (vn(x * 0.06 + 9, y * 0.06, seed + 10) - 0.5) * 2 * wob * 1.2, uy = (vn(x * 0.06, y * 0.06 + 9, seed + 11) - 0.5) * 2 * wob * 1.2;
      T1[y * W + x] = toneAt(x + 0.5 + ux + 1.5, y + 0.5 + uy + 1);
    }
  }
  const lm = o.lineMul ?? 1, gapT = o.gap ?? C.gap;
  const cov = new Float32Array(W * H);   // main ink coverage
  const cov2 = new Float32Array(W * H);  // faint second stroke
  const edge = (T: Uint8Array, out: Float32Array, onlySil: boolean, rBase: number, k: number, gap: number, seedOff: number): void => {
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, a = T[i];
      for (let dir = 0; dir < 2; dir++) {
        const b = dir === 0 ? T[i + 1] : T[i + W];
        if (a === b) continue;
        const w = lineWeight(a, b);
        if (w <= 0 || (onlySil && w < 1)) continue;
        if (vn(x * 0.08, y * 0.08, seed + seedOff) > gap) continue; // gap in the line
        const r = rBase * w * lm * C.lineWidth * (0.7 + 0.95 * vn(x * 0.11, y * 0.11, seed + 9));
        stamp(out, W, H, x + (dir === 0 ? 1 : 0.5), y + (dir === 0 ? 0.5 : 1), r, k);
      }
    }
  };
  edge(T0, cov, false, 0.95, 1, gapT, 31);
  if (T1) edge(T1, cov2, true, 0.55, 0.55, 0.62, 47);
  if (o.ticks) {
    for (let t = 0; t < o.ticks; t++) {
      const sx = 8 + hash(t, 1, seed) * (W - 16), sy = 10 + hash(t, 2, seed) * (H - 20);
      const ang = -1.1 + (hash(t, 3, seed) - 0.5) * 0.7, len = W * (0.1 + 0.07 * hash(t, 4, seed));
      for (let u = 0; u <= len; u += 0.7) {
        const bend = Math.sin(u * 0.4) * 0.6;
        stamp(cov, W, H, sx + Math.cos(ang) * u + bend, sy + Math.sin(ang) * u, 0.7 * (1 - u / len * 0.5), 0.55);
      }
    }
  }

  const out = new ImageData(W, H), d = out.data;
  const P = o.hatchSpacing ?? C.hatchSpacing, hw = C.hatchWidth / 2;
  const mr = o.misreg ?? C.misreg;
  const LR = o.lineRgb ?? INK_RGB;
  const fillTone = (x: number, y: number, t0: number): number => {
    const T = TONES[t0];
    if (T.fixed) return t0;
    const dx = (vn(x * 0.05 + 11, y * 0.05, seed + 5) - 0.5) * 2 * mr + (hash(x, y, seed + 6) - 0.5) * 2 * C.sponge;
    const dy = (vn(x * 0.05, y * 0.05 + 11, seed + 7) - 0.5) * 2 * mr + (hash(x, y, seed + 8) - 0.5) * 2 * C.sponge;
    const xx = Math.min(W - 1, Math.max(0, Math.round(x + dx))), yy = Math.min(H - 1, Math.max(0, Math.round(y + dy)));
    const td = T0[yy * W + xx];
    if (t0 === TN.NONE) return td === TN.PATCH || td === TN.GPATCH ? (hash(x, y, seed + 12) > 0.55 ? td : TN.NONE) : TN.NONE; // patch may bleed past the line
    if (td === TN.NONE || TONES[td].fixed) return t0;
    return td;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t0 = T0[i];
    const ft = fillTone(x, y, t0), F = TONES[ft];
    let r = F.rgb[0], g = F.rgb[1], b = F.rgb[2], a = F.a;
    if (ft === TN.PATCH || ft === TN.GPATCH || ft === TN.TEAL) {
      if (hash(x, y, seed + 77) < C.pores) { r += (232 - r) * 0.55; g += (238 - g) * 0.55; b += (241 - b) * 0.55; } // sponge pore
    }
    const gr = 1 + (hash(x, y, seed + 99) - 0.5) * 2 * C.grain; r *= gr; g *= gr; b *= gr;
    if (o.opaque && a < 1) { r = PAPER_RGB[0] + (r - PAPER_RGB[0]) * a * 1.1; g = PAPER_RGB[1] + (g - PAPER_RGB[1]) * a * 1.1; b = PAPER_RGB[2] + (b - PAPER_RGB[2]) * a * 1.1; a = 1; }
    // hatch (uses line-art tone so strokes stay inside the drawn shape)
    if (TONES[t0].hatch) {
      const k = Math.floor((x + y) / P), j = (hash(k, 0, seed + 55) - 0.5) * 2.2;
      const m = (((x + y + j) % P) + P) % P, dd = Math.abs(m - P / 2) / 1.414;
      const present = vn((x - y) * 0.08 + k * 7.3, k * 1.7, seed + 56) > (o.gap !== undefined ? 0.5 : C.hatchBreak) ? 1 : 0;
      const hc = Math.min(1, Math.max(0, hw + 0.5 - dd)) * present * C.hatchAlpha;
      if (hc > 0) {
        const light = !ART_LIGHT && (t0 === TN.PATCH || t0 === TN.TEAL), H = light ? INK_RGB : DEEP_INK, k = light ? hc * 0.6 : hc; // dark ground: mist hatch on blue/teal, ink hatch on amber/cyan
        r += (H[0] - r) * k; g += (H[1] - g) * k; b += (H[2] - b) * k;
      }
    }
    // outlines
    const c = Math.max(cov[i] * 0.96, cov2[i]);
    if (c > 0) { r += (LR[0] - r) * c; g += (LR[1] - g) * c; b += (LR[2] - b) * c; a = Math.max(a, c); }
    const p = i * 4;
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a * 255 * (o.alphaMul ?? 1);
  }
  return out;
}

// ───────────── sprite frames (post-process of the pixel art) ─────────────
const hx = (h: string): number => parseInt(h.slice(1), 16);
const DEFAULT_MAP = new Map<number, number>([
  ['#1b263b', TN.PAPER], ['#16202f', TN.PAPER], ['#223149', TN.GPATCH], ['#111626', TN.INK], ['#4c8790', TN.TEAL],
  ['#2a3850', TN.PATCH], ['#34455f', TN.GPATCH], ['#183049', TN.TEAL], ['#2d5568', TN.DEEP], ['#2b3a55', TN.DEEP],
  ['#3d4f6d', TN.PATCH], ['#6b5a47', TN.DEEP], ['#8a7558', TN.PATCH], ['#b2c4ce', TN.HI], ['#e6b66e', TN.AMBER],
  ['#5d4d3c', TN.DEEP], ['#e47f7c', TN.CORAL], ['#2d5a55', TN.TEAL], ['#1f4440', TN.DEEP], ['#fff2cf', TN.HI],
  ['#35706c', TN.TEAL], ['#7be0a0', TN.DEEP], ['#8896a3', TN.PATCH], ['#7be0df', TN.CYAN], ['#a89bdb', TN.VIOLET],
  ['#a8783a', TN.AMBER_H], ['#f6dca8', TN.HI], ['#3f9ca0', TN.CYAN_H], ['#d4fbfa', TN.HI],
].map(([h, t]) => [hx(h as string), t as number]));
const DEFAULT_KEYS = [...DEFAULT_MAP.keys()];

const OVERRIDES: Record<string, [string, number][]> = {
  ground_dark: [['#111626', TN.GPATCH]],
  water: [['#4c8790', TN.HI], ['#2d5568', TN.DEEP]],
  road: [['#4c8790', TN.HI], ['#2a3850', TN.GPATCH]],
  bridge: [['#4c8790', TN.HI], ['#e6b66e', TN.HI], ['#b2c4ce', TN.HI]],
  bridge_broken: [['#4c8790', TN.HI]],
  tree: [['#4c8790', TN.PATCH], ['#2d5a55', TN.TEAL], ['#5d4d3c', TN.DEEP]],
  wall: [['#2b3a55', TN.TEAL], ['#3d4f6d', TN.PATCH]],
  radio_tower: [['#8896a3', TN.DEEP]],
  greenhouse_alive: [['#4c8790', TN.PATCH], ['#35706c', TN.TEAL]],
};

if (!ART_LIGHT) { // calm areas on the dark ground: few marks, soft tones
  OVERRIDES.ground = [['#4c8790', TN.GPATCH], ['#16202f', TN.PAPER]];
  OVERRIDES.water = [['#183049', TN.DEEP], ['#4c8790', TN.TEAL], ['#2d5568', TN.DEEP]];
  OVERRIDES.road = [['#2a3850', TN.DEEP], ['#4c8790', TN.TEAL], ['#34455f', TN.GPATCH]];
  OVERRIDES.wall = [['#2b3a55', TN.DEEP], ['#3d4f6d', TN.PATCH]];
}

function classify(r: number, g: number, b: number, a: number, ov: Map<number, number> | undefined, cache: Map<number, number>): number {
  if (a < 24) return TN.NONE;
  if (a < 235) {
    if (r > g + 20 && g > b + 15) return TN.GLOW_A;
    if (b > g + 15 && r > g + 8) return TN.GLOW_V;
    return TN.SHADOW;
  }
  const key = (r << 16) | (g << 8) | b;
  const ex = ov?.get(key) ?? DEFAULT_MAP.get(key);
  if (ex !== undefined) return ex;
  if (b - g >= 30 && r - g >= -8) return TN.GLOW_V;          // opaque blend of the violet anchor glow
  const cc = cache.get(key); if (cc !== undefined) return cc;
  let best: number = TN.PAPER, bd = 1e9;
  for (const k of DEFAULT_KEYS) {
    const dr = ((k >> 16) & 255) - r, dg = ((k >> 8) & 255) - g, db = (k & 255) - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bd) { bd = dist; best = DEFAULT_MAP.get(k)!; }
  }
  cache.set(key, best);
  return best;
}

/** Re-render one pixel-art frame (src, w x h) at S x resolution as an ink drawing. */
export function inkFrame(src: ImageData, name: string, S: number, seed: number): ImageData {
  const w = src.width, h = src.height, W = w * S, H = h * S;
  const baseName = name.split('#')[0];
  const ov = OVERRIDES[baseName] ? new Map(OVERRIDES[baseName].map(([c, t]) => [hx(c), t] as [number, number])) : undefined;
  const cache = new Map<number, number>();
  const tones = new Uint8Array(w * h);
  let opaque = true;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4, a = src.data[p + 3];
    if (a < 250) opaque = false;
    tones[i] = classify(src.data[p], src.data[p + 1], src.data[p + 2], a, ov, cache);
  }
  const patchy = baseName === 'ground_dark' || baseName.startsWith('anchor_');
  const patchThr = baseName === 'ground_dark' ? INK_CFG.patchThr + 0.06 : INK_CFG.patchThr;
  const tx = [0, 0, 0, 0], ty = [0, 0, 0, 0], tt = [0, 0, 0, 0], tw = [0, 0, 0, 0];
  const toneAt = (hx_: number, hy_: number): number => {
    const fx = hx_ / S - 0.5, fy = hy_ / S - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const dx = k & 1, dy = k >> 1;
      tx[k] = Math.min(w - 1, Math.max(0, x0 + dx)); ty[k] = Math.min(h - 1, Math.max(0, y0 + dy));
      const t = tones[ty[k] * w + tx[k]], wt = (dx ? ax : 1 - ax) * (dy ? ay : 1 - ay);
      let found = false;
      for (let j = 0; j < n; j++) if (tt[j] === t) { tw[j] += wt; found = true; break; }
      if (!found) { tt[n] = t; tw[n] = wt; n++; }
    }
    let best = tt[0], bs = -1;
    for (let j = 0; j < n; j++) { const sc = tw[j] * TONES[tt[j]].bias; if (sc > bs) { bs = sc; best = tt[j]; } }
    if (patchy && best === TN.PAPER && vn(hx_ * 0.045, hy_ * 0.045, seed + 3) > patchThr) return TN.GPATCH;
    return best;
  };
  const calm = baseName === 'ground' || baseName === 'ground_dark' || baseName === 'water' || baseName === 'road' || baseName === 'wall';
  const ticks = baseName === 'ground' || baseName === 'ground_dark' || baseName === 'fence' ? INK_CFG.calmTicks : 0;
  // dark paper: calm areas get thin teal lines; objects, beings and interactables get thick pale confident outlines
  if (ART_LIGHT) return inkCompose(W, H, toneAt, seed, { opaque, ticks });
  const scenery = baseName === 'tree' || baseName === 'fence'; // decorative: pale but thinner than interactables
  return inkCompose(W, H, toneAt, seed, { opaque, ticks, lineMul: calm ? 0.8 : scenery ? 1.1 : INK_CFG.objectLine, lineRgb: calm ? TEAL_RGB : INK_RGB });
}

// ───────────── portraits ─────────────
export type Expr = 'calm' | 'strained' | 'faint';
export type Being = 'player' | 'partner';

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 ? Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2)) : 0;
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}
function polyDist(x: number, y: number, pts: number[][]): number {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}
const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): number => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
const mirror = (pts: number[][]): number[][] => pts.map(([x, y]) => [320 - x, y]);

const PORTRAIT_PX = 320;
const portraitCache = new Map<string, HTMLCanvasElement>();

/** A hand-inked bust (320x320 canvas, shown at ~160x160 logical). Cached per (being, expression). */
export function portrait(who: Being, expr: Expr): HTMLCanvasElement {
  const key = `${who}:${expr}`;
  const hit = portraitCache.get(key); if (hit) return hit;
  const seed = strSeed(key);
  const face = who === 'player' ? TN.AMBER : TN.CYAN, faceH = who === 'player' ? TN.AMBER_H : TN.CYAN_H;
  const tip = who === 'player' ? TN.CYAN : TN.AMBER;
  const strained = expr === 'strained', faint = expr === 'faint';
  const ey = faint ? 152 : 150, eyeR = faint ? 3.5 : strained ? 8 : 11;
  const eyes = [136, 184];
  const brows: number[][][] = strained
    ? [[[120, 126], [136, 133], [152, 140]]] : faint ? [[[122, 132], [136, 135], [150, 134]]] : [[[121, 130], [136, 122], [151, 127]]];
  const browSet = [brows[0], mirror(brows[0])];
  const mouth = strained ? [[146, 191], [154, 187], [164, 192], [175, 188]] : faint ? [[152, 190], [160, 192], [168, 190]] : [[146, 184], [160, 193], [174, 184]];
  const wisp = [[196, 78], [210, 54], [206, 34]];
  const crack = [[194, 100], [182, 118], [187, 132]];
  const toneAt = (x: number, y: number): number => {
    // pupils / brows / mouth / wisp are drawn as strokes with taper
    for (let k = 0; k < 2; k++) {
      const cx = eyes[k];
      if (faint) {
        if (segDist(x, y, cx - 11, ey - 2, cx + 11, ey) < 2.6) return TN.INK;                     // heavy lid line
        if (ell(x, y, cx, ey + 3, 9, 3.5) < 1 && y > ey + 1) return TN.HI;
        if (ell(x, y, cx + 1, ey + 3, 3, 2.5) < 1) return TN.INK;
      } else if (ell(x, y, cx + 1.5, ey + 2, 4.6, eyeR * 0.62) < 1) return TN.INK;
      if (polyDist(x, y, browSet[k]) < (strained ? 3.4 : 2.6)) return TN.INK;
    }
    if (polyDist(x, y, mouth) < (strained ? 2.4 : 2.1)) return TN.INK;
    if (strained && polyDist(x, y, crack) < 1.7) return TN.INK;
    if (polyDist(x, y, wisp) < 2.2) return ART_LIGHT ? TN.INK : TN.HI;
    if (Math.hypot(x - wisp[2][0], y - wisp[2][1]) < 7) return tip;
    if (!faint) for (let k = 0; k < 2; k++) if (ell(x, y, eyes[k], ey, 11, eyeR) < 1) return TN.HI; // eye whites
    // faint: no eye whites, closed lids
    // face
    const fi = ell(x, y, 160, 150, 56, 62);
    if (fi < 1) {
      if (ell(x, y, 138, 108, 22, 12) < 1) return TN.HI;                       // forehead highlight
      if (who === 'player' && y < 98 + 16 * Math.sin(x * 0.1) + (x - 160) * 0.22) return TN.DEEP; // hair fringe
      if (ell(x, y, 150, 146, 56, 62) > 0.78 && x > 160 - 4 * (strained ? 1 : 0)) return faceH;   // shade crescent
      return face;
    }
    // hood (partner) or hair mass + ears (player)
    if (who === 'partner') {
      if (ell(x, y, 160, 142, 80, 90) < 1) return TN.TEAL;
    } else {
      if (ell(x, y, 160, 128, 66, 76) < 1 && y < 150) return TN.DEEP;
    }
    // shoulders / cloak
    const bi = ell(x, y, 160, 338, 140, 122);
    if (bi < 1 && y > 214) {
      if (segDist(x, y, 118, 236, 160, 276) < 4.2 || segDist(x, y, 202, 236, 160, 276) < 4.2) return TN.HI; // collar
      if (ell(x, y, 140, 322, 140, 122) > 0.9 || x > 215) return faceH;
      return face;
    }
    // loose paper wash behind the bust
    const bl = ell(x, y, 160, 190, 146 + 6 * Math.sin(y * 0.07), 144 + 5 * Math.sin(x * 0.06));
    if (bl < 1) return TN.GPATCH;
    return TN.NONE;
  };
  const t0 = performance.now();
  const img = inkCompose(PORTRAIT_PX, PORTRAIT_PX, toneAt, seed, {
    lineMul: 1.7, hatchSpacing: 9, gap: faint ? 0.6 : strained ? 0.72 : 0.8, alphaMul: faint ? 0.82 : 1, misreg: 5,
  });
  const cv = document.createElement('canvas'); cv.width = cv.height = PORTRAIT_PX;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  portraitCache.set(key, cv);
  inkStats.portraitMs += performance.now() - t0; inkStats.portraits++;
  return cv;
}

export const inkStats = { tilesMs: 0, charsMs: 0, fxMs: 0, frames: 0, portraitMs: 0, portraits: 0 };
