import Phaser from 'phaser';
import type { Layer } from '../api';

/**
 * Isometric floor textures DERIVED at runtime from imported 32x32 square tiles:
 * canvas affine transform (rotate 45 deg + squash 2:1, nearest neighbour, no smoothing) into a 64x32 diamond,
 * plus a few stacked, darkened copies of the same transformed tile as the tile's side faces (thickness).
 * A transformation of imported art, not new art. See docs/DC_FOREST2_VIEW.md.
 */
export const TW = 64, TH = 32, SIDE = 8;
/** texture height incl. side faces; the diamond centre sits at y = TH/2 */
export const TEX_H = TH + SIDE;
export const ORIGIN_Y = (TH / 2) / TEX_H;

interface Def { key: string; src: string; tint: number; sides?: boolean; dark?: number }

const DEFS: Def[] = [
  { key: 'iso/lawn_a', src: 'tiles/front_lawn', tint: 0xfff0b8 },
  { key: 'iso/lawn_b', src: 'tiles/front_lawn', tint: 0xe9dc9c },
  { key: 'iso/path_gold', src: 'tiles/garden_gravel_path', tint: 0xffe0a0 },
  { key: 'iso/wood_amber', src: 'tiles/wood_planks_light', tint: 0xffd890 },
  { key: 'iso/soil', src: 'tiles/flower_bed_soil', tint: 0xffe6c8 },
  { key: 'iso/vine', src: 'tiles/front_lawn', tint: 0x6bff4a },
  { key: 'iso/bark', src: 'tiles/garden_gravel_path', tint: 0xffc830 },
  { key: 'iso/ruin_a', src: 'tiles/garden_gravel_path', tint: 0x7a8794 },
  { key: 'iso/ruin_b', src: 'tiles/garden_gravel_path', tint: 0x636f7c },
  { key: 'iso/ruin_cyan', src: 'tiles/garden_gravel_path', tint: 0x4f8ea0 },
  { key: 'iso/dust', src: 'tiles/garden_gravel_path', tint: 0xb4b0aa },
  { key: 'iso/gap', src: 'tiles/garden_gravel_path', tint: 0x0b0a14, sides: false },
];


function make(scene: Phaser.Scene, d: Def): void {
  const src = scene.textures.get(d.src).getSourceImage() as CanvasImageSource & { width: number; height: number };
  // 1) tint the square source (multiply) on a temp canvas
  const tmp = document.createElement('canvas'); tmp.width = src.width; tmp.height = src.height;
  const t = tmp.getContext('2d')!; t.imageSmoothingEnabled = false;
  t.drawImage(src, 0, 0);
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = '#' + d.tint.toString(16).padStart(6, '0'); t.fillRect(0, 0, tmp.width, tmp.height);
  // 2) affine: x' = u - v + 32, y' = (u + v) / 2 (+ offset)  => 64x32 diamond
  const tex = scene.textures.createCanvas(d.key, TW, TEX_H)!;
  const c = tex.getContext(); c.imageSmoothingEnabled = false; c.clearRect(0, 0, TW, TEX_H);
  const k = TW / 2 / (src.width as number);          // scale a 32px source to a 64px wide diamond
  const draw = (dy: number) => { c.setTransform(k, k / 2, -k, k / 2, TW / 2, dy); c.drawImage(tmp, 0, 0); };
  if (d.sides !== false) {
    for (let i = SIDE; i >= 1; i--) draw(i);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, TW, TEX_H);
    c.globalCompositeOperation = 'source-over';
  }
  draw(0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  // crisp diamond rim so adjacent tiles read as separate cells
  c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1; c.beginPath();
  c.moveTo(0.5, TH / 2); c.lineTo(TW / 2, 0.5); c.lineTo(TW - 0.5, TH / 2); c.lineTo(TW / 2, TH - 0.5); c.closePath(); c.stroke();
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function buildIsoTextures(scene: Phaser.Scene): void {
  for (const d of DEFS) if (!scene.textures.exists(d.key)) make(scene, d);
}

/** floor texture for a tile kind in a layer. (x + y) parity gives a light checker. */
export function floorTexture(kind: string, layer: Layer, x: number, y: number): string {
  const par = (x + y) & 1;
  switch (kind) {
    case 'GAP': return 'iso/gap';
    case 'SOIL': case 'ROOTED': return 'iso/soil';
    case 'VINE': return 'iso/vine';
    case 'BARK': return 'iso/bark';
    case 'DUST': return 'iso/dust';
    case 'CONDUIT_P': case 'BEACON': return 'iso/wood_amber';
    case 'CONDUIT_F': return 'iso/ruin_cyan';
    case 'ROOT_PLATE': return 'iso/path_gold';
    case 'CONDUIT_PLATE': return 'iso/ruin_cyan';
    default: return layer === 'PAST' ? (par ? 'iso/lawn_b' : 'iso/lawn_a') : (par ? 'iso/ruin_b' : 'iso/ruin_a');
  }
}
