import Phaser from 'phaser';
import type { Layer, TileView } from '../api';
import { ORIGIN_Y, floorTexture } from './isoTex';

/** Screen projection of the 2:1 iso grid (tile 64x32 scaled by S). */
export class Iso {
  constructor(public S: number, public cx: number, public cy: number) {}
  x(gx: number, gy: number): number { return this.cx + (gx - gy) * 32 * this.S; }
  y(gx: number, gy: number): number { return this.cy + (gx + gy) * 16 * this.S; }
  /** screen position of the tile's diamond centre */
  p(gx: number, gy: number): { x: number; y: number } { return { x: this.x(gx, gy), y: this.y(gx, gy) }; }
  /** diamond outline points (screen) for a tile, optionally inset */
  diamond(gx: number, gy: number, inset = 0): Phaser.Math.Vector2[] {
    const c = this.p(gx, gy), hw = 32 * this.S - inset * 2, hh = 16 * this.S - inset;
    return [new Phaser.Math.Vector2(c.x, c.y - hh), new Phaser.Math.Vector2(c.x + hw, c.y), new Phaser.Math.Vector2(c.x, c.y + hh), new Phaser.Math.Vector2(c.x - hw, c.y)];
  }
}

export const hash2 = (x: number, y: number): number => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };

const ROCK_SPRITES: { key: string; k: number }[] = [
  { key: 'garden/small_apple_tree_with_red_apples', k: 0.85 }, { key: 'garden/lilac_bush_in_bloom', k: 1.05 },
  { key: 'garden/wooden_garden_shed_with_a_small_window', k: 0.72 }, { key: 'garden/small_glass_greenhouse_drawn_opaque_in_light_blue_tones', k: 0.72 },
];

interface Cell { sig: string; objs: Phaser.GameObjects.GameObject[]; floor: Phaser.GameObjects.Image }
export interface LayerOpts { reduceMotion: boolean; floorBase: number; objBase: number; alpha: number }

/** One renderable grid (floor diamonds + object sprites). Two instances are used: the live map and the Peek overlay. */
export class TileLayer {
  private cells: Cell[][] = [];
  private all = new Set<Phaser.GameObjects.GameObject>();
  private vis = true;
  constructor(private scene: Phaser.Scene, private iso: Iso, private o: LayerOpts) {}

  update(map: TileView[][], layer: Layer, pins: Set<string>, weather?: (x: number, y: number) => boolean): void {
    for (let y = 0; y < map.length; y++) {
      this.cells[y] ??= [];
      for (let x = 0; x < map[y].length; x++) {
        const tv = map[y][x], w = !!(weather?.(x, y));
        const sig = `${layer}|${tv.kind}|${tv.lit ? 1 : 0}|${tv.crate ? 1 : 0}|${pins.has(x + ',' + y) ? 1 : 0}|${w ? 1 : 0}|${(tv as { sap?: boolean }).sap ? 1 : 0}`;
        const cur = this.cells[y][x];
        if (cur && cur.sig === sig) continue;
        if (cur) this.kill(cur);
        this.cells[y][x] = this.build(x, y, tv, layer, sig, pins.has(x + ',' + y), w);
      }
    }
  }

  setVisible(v: boolean): void { this.vis = v; this.all.forEach(o => (o as unknown as { setVisible(b: boolean): void }).setVisible(v)); }
  destroy(): void { this.cells.forEach(r => r.forEach(c => c && this.kill(c))); this.cells = []; }
  /** screen y of an object slot for depth sorting */
  objDepth(sy: number): number { return this.o.objBase + sy; }

  private kill(c: Cell): void {
    for (const o of [c.floor, ...c.objs]) { this.scene.tweens.killTweensOf(o); this.all.delete(o); o.destroy(); }
  }

  private reg<T extends Phaser.GameObjects.GameObject>(o: T, cell: Cell): T {
    (o as unknown as { setVisible(b: boolean): void }).setVisible(this.vis);
    this.all.add(o); cell.objs.push(o); return o;
  }

  private build(x: number, y: number, tv: TileView, layer: Layer, sig: string, pinned: boolean, weather: boolean): Cell {
    const sc = this.scene, S = this.iso.S, c = this.iso.p(x, y), fut = layer === 'FUTURE';
    const floor = sc.add.image(c.x, c.y, floorTexture(tv.kind, layer, x, y)).setOrigin(0.5, ORIGIN_Y).setScale(S).setDepth(this.o.floorBase + (x + y) * 0.01).setAlpha(this.o.alpha);
    this.all.add(floor); floor.setVisible(this.vis);
    const cell: Cell = { sig, objs: [], floor };
    const od = this.o.objBase + c.y, still = this.o.reduceMotion;
    const img = (key: string, dx: number, dy: number, k: number, tint?: number, depthAdd = 0): Phaser.GameObjects.Image => {
      const im = sc.add.image(c.x + dx * S, c.y + dy * S, key).setOrigin(0.5, 1).setScale(S * k).setDepth(od + depthAdd).setAlpha(this.o.alpha);
      if (tint !== undefined) im.setTint(tint);
      return this.reg(im, cell);
    };
    const flat = (key: string, k: number, tint: number, add = true, depth = this.o.floorBase + 0.5 + (x + y) * 0.01): Phaser.GameObjects.Image => {
      const im = sc.add.image(c.x, c.y, key).setScale(S * k, S * k * 0.5).setTint(tint).setDepth(depth).setAlpha(this.o.alpha);
      if (add) im.setBlendMode(Phaser.BlendModes.ADD);
      return this.reg(im, cell);
    };
    const rune = (tint: number, k: number, lit: boolean): void => {
      const r = this.reg(sc.add.sprite(c.x, c.y, 'portals/tide_rune_circle').setScale(S * k, S * k * 0.5).setTint(tint).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(this.o.floorBase + 0.5 + (x + y) * 0.01).setAlpha(lit ? this.o.alpha : this.o.alpha * 0.5), cell);
      if (!still) r.play('f2-rune'); else r.setFrame(3);
      if (lit) flat('vfx/p_light_01', 0.16, tint);
    };
    const sparkle = (key: string, tint: number, n: number, rise: number): void => {
      for (let i = 0; i < n; i++) {
        const o = sc.add.image(c.x + (i - (n - 1) / 2) * 12 * S, c.y - 4 * S, key).setTint(tint).setScale(0.05 * S).setBlendMode(key.includes('smoke') ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
          .setDepth(od + 50).setAlpha(key.includes('smoke') ? 0.3 : 0.9);
        this.reg(o, cell);
        if (!still) sc.tweens.add({ targets: o, y: o.y - rise * S, alpha: 0, scale: o.scale * (key.includes('smoke') ? 2 : 1.6), duration: 1500 + i * 400, delay: i * 500 + (hash2(x, y) % 700), repeat: -1 });
      }
    };

    switch (tv.kind) {
      case 'ROCK': {
        const r = x + y < 2 ? ROCK_SPRITES[1] : ROCK_SPRITES[hash2(x, y) % ROCK_SPRITES.length];   // low bush at the apex so it never hits the banner
        img(r.key, 0, 10, r.k * 1.0, fut ? 0x8794a0 : undefined);
        break;
      }
      case 'SOIL': break;
      case 'ROOTED': img('garden/potted_daisy', 0, 8, 0.8); break;
      case 'VINE':
        img('home/potted_fern', -9, 6, 0.55, 0x9cff7a); img('home/potted_fern', 11, 10, 0.5, 0x7bf06a);
        break;
      case 'BARK': sparkle('vfx/p_star_01', 0xffe27a, 3, 18); break;
      case 'DUST': sparkle('vfx/p_smoke_08', 0xc8c4bc, 3, 14); break;
      case 'SAP_WELL': img('garden/wooden_rain_barrel_under_a_drainpipe', 0, 12, 0.7, 0xffc060); break;
      case 'ROOT_PLATE': rune(0xffc850, 0.95, !!tv.lit); break;
      case 'CONDUIT_PLATE': rune(0x6fe8ff, 0.95, !!tv.lit); break;
      case 'CONDUIT_P': rune(0xffd070, 1.05, true); flat('vfx/p_circle_05', 0.12, 0xffc040); break;
      case 'CONDUIT_F': rune(0x6fe8ff, 1.05, true); flat('vfx/p_circle_05', 0.12, 0x40e0ff); break;
      case 'RUIN': img('garden/garden_gnome_holding_a_lantern', 0, 10, 1.15, 0xa8a8a8); break;
      case 'RIFT': {
        const p = this.reg(sc.add.sprite(c.x, c.y, 'portals/tide_idle').setScale(S * 0.5, S * 0.26).setDepth(this.o.floorBase + 0.6 + (x + y) * 0.01).setAlpha(this.o.alpha).setBlendMode(Phaser.BlendModes.ADD), cell);
        if (!still) p.play('f2-rift'); break;
      }
      default: break;
    }
    if ((tv as { sap?: boolean }).sap) {
      const o = this.reg(sc.add.image(c.x, c.y - 10 * S, 'vfx/p_light_01').setTint(0xffb830).setScale(0.09 * S).setBlendMode(Phaser.BlendModes.ADD).setDepth(od + 40), cell);
      if (!still) sc.tweens.add({ targets: o, scale: o.scale * 1.4, alpha: 0.5, yoyo: true, repeat: -1, duration: 600 });
    }
    if (tv.crate) img('garden/bag_of_soil', 0, 12, 1.0, undefined, 2);
    if (pinned) {
      const ring = flat('vfx/p_circle_05', 0.13, 0xffffff, true, od + 1);
      const star = flat('vfx/p_star_01', 0.07, 0xffe9a0, true, od + 1);
      if (!still) sc.tweens.add({ targets: [ring, star], scaleX: ring.scaleX * 1.18, alpha: this.o.alpha * 0.55, yoyo: true, repeat: -1, duration: 700 });
    }
    if (weather) {
      const g = this.reg(sc.add.graphics().setDepth(od + 60), cell);
      g.lineStyle(2, 0xff5a4a, 1).strokePoints(this.iso.diamond(x, y, 4), true);
      const t = this.reg(sc.add.bitmapText(c.x, c.y - 6 * S, 'fonts/Pepper16-Bold', '!', 16).setOrigin(0.5).setTint(0xff6a5a).setDepth(od + 61), cell);
      if (!still) sc.tweens.add({ targets: [g, t], alpha: 0.35, yoyo: true, repeat: -1, duration: 500 });
    }
    return cell;
  }
}

export function ensureViewAnims(scene: Phaser.Scene): void {
  const A = scene.anims;
  if (!A.exists('f2-rune')) A.create({ key: 'f2-rune', frames: A.generateFrameNumbers('portals/tide_rune_circle', { start: 0, end: 11 }), frameRate: 10, repeat: -1 });
  if (!A.exists('f2-rift')) A.create({ key: 'f2-rift', frames: A.generateFrameNumbers('portals/tide_idle', { start: 0, end: 11 }), frameRate: 12, repeat: -1 });
  if (!A.exists('f2-charge')) A.create({ key: 'f2-charge', frames: A.generateFrameNumbers('vfx/charge', { start: 0, end: 41 }), frameRate: 40, repeat: 0 });
  for (const col of ['red', 'blue'] as const) for (let d = 0; d < 8; d++) {
    if (A.exists(`f2-${col}-idle-${d}`)) continue;
    A.create({ key: `f2-${col}-idle-${d}`, frames: A.generateFrameNumbers('myconid/' + col, { start: d * 40, end: d * 40 + 7 }), frameRate: 5.3, repeat: -1 });
    A.create({ key: `f2-${col}-walk-${d}`, frames: A.generateFrameNumbers('myconid/' + col, { start: d * 40 + 8, end: d * 40 + 15 }), frameRate: 12, repeat: -1 });
    A.create({ key: `f2-${col}-hit-${d}`, frames: A.generateFrameNumbers('myconid/' + col, { start: d * 40 + 24, end: d * 40 + 31 }), frameRate: 24, repeat: 0 });
  }
}
