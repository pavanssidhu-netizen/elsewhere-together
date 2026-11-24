import Phaser from 'phaser';
import type { DCScene } from '../base';
import { LINE_BY_ID } from '../content/lines';
import { mulberry32 } from '../../sim/rng';

export const CYAN = 0x7be0df;
export const PINK = 0xe8a0b4;
export const ADD = Phaser.BlendModes.ADD;
export const rngFor = (seed: number) => mulberry32(seed);

/** Make nearest-neighbour filtering apply to bitmap fonts too (Boot only does it for images and sheets). */
export function crispFonts(scene: Phaser.Scene): void {
  for (const k of ['Aurora16-Smooth', 'Pepper16-Bold', 'Jelly16-Regular', 'Karma16-Regular']) scene.textures.get('fonts/' + k)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Render obj only on the given cameras (ignored by every other camera of the scene). Call after the object's children exist. */
export function only<T extends Phaser.GameObjects.GameObject>(scene: Phaser.Scene, obj: T, cams: Phaser.Cameras.Scene2D.Camera[]): T {
  for (const c of scene.cameras.cameras) if (!cams.includes(c)) c.ignore(obj);
  return obj;
}

// ---------- animations -----------------------------------------------------------------------------------------------------
export type MycColor = 'red' | 'blue';
export type MycAct = 'idle' | 'walk' | 'attack';
export const DIR = { S: 0, SW: 1, W: 2, NW: 3, N: 4, NE: 5, E: 6, SE: 7 } as const;
const ACT_COL = { idle: [0, 5.3, -1], walk: [8, 9.6, -1], attack: [16, 7.4, -1] } as const;

export function mycAnim(scene: Phaser.Scene, color: MycColor, act: MycAct, dir: keyof typeof DIR): string {
  const key = `cut-${color}-${act}-${dir}`;
  if (!scene.anims.exists(key)) {
    const [c0, fps, rep] = ACT_COL[act]; const base = DIR[dir] * 40 + c0;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers('myconid/' + color, { start: base, end: base + 7 }), frameRate: fps, repeat: rep });
  }
  return key;
}
/** A myconid whose feet stand on (x, y). */
export function myc(scene: Phaser.Scene, color: MycColor, x: number, y: number, scale: number, dir: keyof typeof DIR = 'S', act: MycAct = 'idle'): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, 'myconid/' + color).setOrigin(0.5, 42 / 64).setScale(scale);
  s.play(mycAnim(scene, color, act, dir));
  return s;
}
export function setMyc(s: Phaser.GameObjects.Sprite, scene: Phaser.Scene, color: MycColor, act: MycAct, dir: keyof typeof DIR): void { s.play(mycAnim(scene, color, act, dir), true); }

const FB: Record<string, number> = { 'vfx/vortex': 30, 'vfx/electric_ring': 30, 'vfx/wavy_blue': 30, 'vfx/wavy_purple': 30, 'vfx/star_explosion': 30, 'vfx/lightstreaks': 30, 'vfx/impact_white': 24, 'vfx/big_hit': 30, 'vfx/explosion': 30 };
export function flipAnim(scene: Phaser.Scene, key: string, fps = 24, loop = false): string {
  const a = `cut-fb-${key}-${fps}-${loop ? 'l' : 'o'}`;
  if (!scene.anims.exists(a)) scene.anims.create({ key: a, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: FB[key] - 1 }), frameRate: fps, repeat: loop ? -1 : 0 });
  return a;
}
/** Predrawn VFX flipbook, additive. One-shot flipbooks destroy themselves. */
export function flip(scene: Phaser.Scene, key: string, x: number, y: number, o: { scale?: number; tint?: number; alpha?: number; rot?: number; fps?: number; loop?: boolean; depth?: number; add?: boolean } = {}): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, key).setScale(o.scale ?? 1).setAlpha(o.alpha ?? 1).setRotation(o.rot ?? 0).setDepth(o.depth ?? 0);
  if (o.add !== false) s.setBlendMode(ADD);
  if (o.tint !== undefined) s.setTint(o.tint);
  s.play(flipAnim(scene, key, o.fps ?? 24, o.loop ?? false));
  if (!o.loop) s.once('animationcomplete', () => s.destroy());
  return s;
}

// ---------- the forest (lawn + garden objects), shared by intro / select / reunion ---------------------------------------
interface Prop { k: string; x: number; y: number; s: number; flip?: boolean }
/** One global 960x540 layout. Props whose x lies in [x0,x1) are built, in local coordinates (x - x0). Centre (x 400-560, y>300) stays free for the beacon. */
const P = (k: string) => 'garden/' + k;
export const FOREST_PROPS: Prop[] = [
  { k: P('small_cottage_with_a_golden_thatched_roof_a_chimney_and_a_wooden_door'), x: 190, y: 250, s: 3 },
  { k: P('small_apple_tree_with_red_apples'), x: 60, y: 300, s: 3.4 },
  { k: P('small_apple_tree_with_red_apples'), x: 800, y: 270, s: 3.4, flip: true },
  { k: P('wooden_garden_shed_with_a_small_window'), x: 650, y: 240, s: 3 },
  { k: P('wooden_rail_fence_section'), x: 340, y: 210, s: 3 }, { k: P('wooden_rail_fence_section'), x: 544, y: 210, s: 3 },
  { k: P('wooden_rail_fence_gate'), x: 442, y: 214, s: 3 },
  { k: P('lilac_bush_in_bloom'), x: 900, y: 330, s: 3 },
  { k: P('garden_gnome_holding_a_lantern'), x: 330, y: 340, s: 3 },
  { k: P('round_flower_bed_with_daisies'), x: 650, y: 345, s: 3 },
  { k: P('wooden_bench_with_a_cream_canvas_seat'), x: 90, y: 400, s: 3 },
  { k: P('wooden_rain_barrel_under_a_drainpipe'), x: 880, y: 420, s: 3 },
  { k: P('potted_daisy'), x: 420, y: 470, s: 3 }, { k: P('little_hedgehog'), x: 560, y: 495, s: 3 },
  { k: P('pinwheel_on_a_stick'), x: 760, y: 360, s: 3 },
];
export interface Forest { c: Phaser.GameObjects.Container; objs: Array<Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite> }
export function buildForest(scene: Phaser.Scene, x0: number, x1: number, o: { padL?: number; padR?: number; padT?: number; padB?: number } = {}): Forest {
  const c = scene.add.container(0, 0);
  const objs: Forest['objs'] = [];
  const L = -(o.padL ?? 0), T = -(o.padT ?? 0), W = x1 - x0 + (o.padL ?? 0) + (o.padR ?? 0), H = 540 + (o.padT ?? 0) + (o.padB ?? 0);
  const lawn = scene.add.tileSprite(L, T, W, H, 'tiles/front_lawn').setOrigin(0).setTileScale(3);
  const path = scene.add.tileSprite(L, 440, W, 80, 'tiles/garden_gravel_path').setOrigin(0).setTileScale(3);
  c.add([lawn, path]); objs.push(lawn, path);
  for (const p of FOREST_PROPS) {
    if (p.x < x0 || p.x >= x1) continue;
    const im = scene.add.image(p.x - x0, p.y, p.k).setOrigin(0.5, 1).setScale(p.s).setFlipX(!!p.flip);
    c.add(im); objs.push(im);
  }
  return { c, objs };
}
export function tintAll(f: Forest, color: number): void { for (const o of f.objs) o.setTint(color); }
export function lerpTint(from: number, to: number, t: number): number {
  const a = Phaser.Display.Color.IntegerToColor(from), b = Phaser.Display.Color.IntegerToColor(to);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

// ---------- captions ---------------------------------------------------------------------------------------------------------
/** Plain bottom caption (dark strip + bitmap text). Content comes from LINE_BY_ID so it always matches the voice file. */
export class Caption {
  readonly c: Phaser.GameObjects.Container;
  private name: Phaser.GameObjects.BitmapText;
  private body: Phaser.GameObjects.BitmapText;
  constructor(scene: DCScene, y = 478) {
    const bg = scene.add.rectangle(0, 0, scene.W, 86, 0x04060d, 0.72);
    const edge = scene.add.rectangle(0, -43, scene.W, 2, CYAN, 0.55);
    this.name = scene.add.bitmapText(-440, -34, 'fonts/Pepper16-Bold', '', 16).setTint(CYAN);
    this.body = scene.add.bitmapText(0, 6, 'fonts/Aurora16-Smooth', '', 24).setTint(0xfff1c9).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(880);
    this.c = scene.add.container(scene.W / 2, y, [bg, edge, this.name, this.body]).setDepth(1000).setVisible(false);
  }
  show(id: string): number {
    const l = LINE_BY_ID[id];
    this.name.setText(l.who === 'TIME_MASTER' ? 'THE TIME MASTER' : l.who).setTint(l.who === 'JENSEN' ? 0xff8a8a : l.who === 'SAM' ? 0x8ab4ff : CYAN);
    this.body.setText(l.text).setY(l.text.length > 62 ? -4 : 6);
    this.c.setVisible(true).setAlpha(0);
    this.c.scene.tweens.add({ targets: this.c, alpha: 1, duration: 200 });
    return l.text.length;
  }
  hide(): void { this.c.setVisible(false); }
}

/** Pacing that works with real voice, synthesised voice and the silent stub alike. */
export const holdFor = (text: string, minMs = 1600): number => minMs + 40 * text.length;
