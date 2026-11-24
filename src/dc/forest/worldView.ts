// The drawn forest: terrain from imported Nasha tiles, objects from imported garden sprites, a scrolling blue "river" made from an imported tile.
// Everything here is imported art (no Graphics scene art). `refresh(state)` re-reads the sim; it never decides anything.
import Phaser from 'phaser';
import { MAP_H, MAP_ROWS, MAP_W, OBJECT_TILES, SMOKE_TILES, TILE, getWalkability, tileOf } from '../../world/topology';
import type { SimulationState } from '../../sim/types';
import { Beacon } from '../shared/beacon';
import { FEET, h2, px } from './layout';

const G = (n: string) => 'garden/' + n;
const TREE = G('small_apple_tree_with_red_apples');
const HEDGES = [G('lilac_bush_in_bloom'), TREE, TREE];
const WATER = 0x3d93e0, WATER_DEEP = 0x2a6fc0, SAND = 0xe8dcae, DRY_LAWN = 0xe0d79a;

export interface Placed { id: string; x: number; y: number }

export class WorldView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly beacon: Beacon;
  private scene: Phaser.Scene;
  private water!: Phaser.GameObjects.TileSprite;
  private land: (Phaser.GameObjects.Image | null)[][] = [];
  private sand: Phaser.GameObjects.Image[] = [];
  private deck!: Phaser.GameObjects.Image;
  private stubs: Phaser.GameObjects.Image[] = [];
  private gate!: Phaser.GameObjects.Image;
  private wheel!: Phaser.GameObjects.Image;
  private mast!: Phaser.GameObjects.Image;
  private mastGlow!: Phaser.GameObjects.Image;
  private slab!: Phaser.GameObjects.Image;
  private slabGlyph!: Phaser.GameObjects.Image;
  private beds!: Phaser.GameObjects.Image;
  private soil!: Phaser.GameObjects.TileSprite;
  private woodStrips: Phaser.GameObjects.Image[] = [];
  private plankStrips: Phaser.GameObjects.Image[] = [];
  private woodCont!: Phaser.GameObjects.Container;
  private plankCont!: Phaser.GameObjects.Container;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glints: Phaser.GameObjects.Sprite[] = [];
  private spin = 0;
  private turning = true;
  private lastKey = '';
  private reduce: boolean;
  private focusRing: Phaser.GameObjects.Image;
  private focusArrow: Phaser.GameObjects.Image;
  readonly tint = { dry: false };

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, state: Readonly<SimulationState>, reduceMotion: boolean) {
    this.scene = scene; this.layer = layer; this.reduce = reduceMotion;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { layer.add(o); return o; };
    const img = (x: number, y: number, key: string, d = 0, ox = 0.5, oy = 1) => add(scene.add.image(x, y, key).setOrigin(ox, oy).setDepth(d));
    const flags = state.nodes[state.player.nodeId].flags;
    const tex = scene.textures.get('tiles/wood_planks_light');
    if (!tex.has('strip_a')) { tex.add('strip_a', 0, 0, 0, 32, 7); tex.add('strip_b', 0, 0, 8, 32, 7); tex.add('strip_c', 0, 0, 16, 32, 7); tex.add('end', 0, 0, 24, 8, 7); }

    // ---- river: one scrolling blue tile layer under the land
    this.water = add(scene.add.tileSprite(0, 0, MAP_W * TILE, MAP_H * TILE, 'tiles/flower_bed_soil').setOrigin(0, 0).setTint(WATER).setDepth(-1000)) as Phaser.GameObjects.TileSprite;
    const ripple = add(scene.add.tileSprite(0, 0, MAP_W * TILE, MAP_H * TILE, 'tiles/front_lawn').setOrigin(0, 0).setTint(0xa8e0ff).setAlpha(0.28).setDepth(-999).setBlendMode(Phaser.BlendModes.ADD)) as Phaser.GameObjects.TileSprite;
    const flow = (_t: number, dtms: number) => { const d = dtms / 1000; if (reduceMotion) return; this.water.tilePositionX += d * 7; this.water.tilePositionY += d * 3; ripple.tilePositionX -= d * 11; ripple.tilePositionY += d * 6; };
    scene.events.on('update', flow);
    scene.events.once('shutdown', () => scene.events.off('update', flow));

    // ---- land
    for (let ty = 0; ty < MAP_H; ty++) {
      this.land[ty] = [];
      for (let tx = 0; tx < MAP_W; tx++) {
        const ch = MAP_ROWS[ty][tx];
        if (ch === '~' || ch === 'b' || ch === 'f' || ch === 'S') { this.land[ty][tx] = null; continue; }
        const key = ch === '=' ? 'tiles/garden_gravel_path' : 'tiles/front_lawn';
        const t = add(scene.add.image(tx * TILE, ty * TILE, key).setOrigin(0, 0).setDepth(-900));
        t.setFlipX(h2(tx, ty, 1) < 0.5).setFlipY(h2(tx, ty, 2) < 0.5);
        this.land[ty][tx] = t;
      }
    }
    // dynamic land: ford stones (5,7) and the sand path
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const ch = MAP_ROWS[ty][tx];
      if (ch === 'f' || ch === 'S') {
        const t = add(scene.add.image(tx * TILE, ty * TILE, 'tiles/garden_gravel_path').setOrigin(0, 0).setDepth(-890).setTint(ch === 'S' ? SAND : 0xc9d3dc).setVisible(false));
        t.setData('cell', ch + tx + ',' + ty); this.sand.push(t);
      }
    }
    // bridge deck + broken stubs
    this.deck = add(scene.add.image(5 * TILE, 5 * TILE, 'tiles/wood_planks_light').setOrigin(0, 0).setDepth(-880).setVisible(false));
    for (const [dx, dy, fr] of [[2, 3, 'strip_a'], [20, 21, 'strip_b'], [4, 26, 'strip_c']] as const) {
      this.stubs.push(add(scene.add.image(5 * TILE + dx, 5 * TILE + dy, 'tiles/wood_planks_light', fr).setOrigin(0, 0).setDepth(-870).setAngle(dx * 2 - 5).setTint(0xa08060)));
    }
    for (const dy of [-6, 28]) add(scene.add.image(5 * TILE + 16, 5 * TILE + 16 + dy, G('wooden_rail_fence_section')).setScale(0.3).setDepth(-860).setTint(0xcfa77a));

    // ---- decoration: trees around the edge, fences, greenhouse, shed
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const ch = MAP_ROWS[ty][tx];
      const bx = px(tx), by = (ty + 1) * TILE - 2;
      if (ch === '#' && !(ty === MAP_H - 1)) {
        const key = ty === 0 || ty === MAP_H - 2 && false ? TREE : HEDGES[Math.floor(h2(tx, ty, 3) * HEDGES.length)];
        const s = key === TREE ? 0.85 : 0.8;
        img(bx + (h2(tx, ty, 4) - 0.5) * 6, by, key, by).setScale(s);
      } else if (ch === '#') {
        img(bx, by, HEDGES[1], by - 40).setScale(0.8).setAlpha(0.0);
      } else if (ch === 'F') {
        img(bx, by + 1, G('wooden_rail_fence_section'), by).setScale(0.48);
      }
    }
    img(13 * TILE + 16, 3 * TILE - 3, G('small_glass_greenhouse_drawn_opaque_in_light_blue_tones'), 3 * TILE).setScale(1.35);
    img(16 * TILE + 16, 7 * TILE + 30, G('wooden_garden_shed_with_a_small_window'), 7 * TILE + 30).setScale(0.82);
    // small touches
    img(px(3), 6 * TILE + 28, G('little_hedgehog'), 6 * TILE + 28).setScale(0.6);
    img(px(14), 5 * TILE + 30, G('sleeping_cat_curled_up'), 5 * TILE + 30).setScale(0.6);
    img(px(11), 5 * TILE + 30, G('garden_gnome_holding_a_lantern'), 5 * TILE + 30).setScale(0.62);
    img(px(16), 3 * TILE + 28, G('potted_daisy'), 3 * TILE + 28).setScale(0.7);
    img(px(2), 7 * TILE + 30, G('wooden_bench_with_a_cream_canvas_seat'), 7 * TILE + 30).setScale(0.62);
    img(px(11), 1 * TILE + 24, G('wooden_rain_barrel_under_a_drainpipe'), 1 * TILE + 24).setScale(0.45);
    img(px(7), 1 * TILE + 26, G('stack_of_three_terracotta_pots'), 1 * TILE + 26).setScale(0.8);

    // ---- garden beds (grown / withered)
    this.beds = img(px(17), 2 * TILE + 24, G('long_raised_flower_bed_with_tulips'), 2 * TILE + 24).setScale(0.8).setVisible(false);
    this.soil = add(scene.add.tileSprite(16 * TILE, 2 * TILE - 2, 64, 26, 'tiles/flower_bed_soil').setOrigin(0, 0).setDepth(2 * TILE - 6).setTint(0x8a6a4a)) as Phaser.GameObjects.TileSprite;
    this.soil.setVisible(false);

    // ---- the beacon (shared object)
    const lt = OBJECT_TILES.lantern;
    this.beacon = new Beacon(scene, px(lt.tx), (lt.ty + 1) * TILE - 4, { scale: 0.85, dusty: true });
    this.beacon.setDepth((lt.ty + 1) * TILE - 4);
    layer.add(this.beacon);

    // ---- wheel + sluice gate
    const wt = OBJECT_TILES.wheel, tt = OBJECT_TILES.tide;
    this.wheel = img(px(wt.tx), (wt.ty + 1) * TILE - 2, G('pinwheel_on_a_stick'), (wt.ty + 1) * TILE).setScale(1.35).setOrigin(0.5, 0.65);
    this.gate = img(px(tt.tx), (tt.ty + 1) * TILE + 2, G('wooden_rail_fence_gate'), (tt.ty + 1) * TILE + 1).setScale(0.5);
    // ---- signal mast (radio)
    const rt = OBJECT_TILES.radio;
    this.mastGlow = add(scene.add.image(px(rt.tx), rt.ty * TILE - 6, 'vfx/p_light_01').setScale(0.16).setTint(0x7be0df).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.15).setDepth((rt.ty + 1) * TILE + 2));
    this.mast = img(px(rt.tx), (rt.ty + 1) * TILE - 2, G('birdhouse_on_a_tall_wooden_pole'), (rt.ty + 1) * TILE).setScale(1.15).setTint(0xcfe3f0);
    // ---- carved stone
    const it = OBJECT_TILES.inscription;
    this.slab = img(px(it.tx), (it.ty + 1) * TILE - 2, 'tiles/garden_gravel_path', (it.ty + 1) * TILE).setTint(0x8f98a8).setScale(0.8, 1.3);
    this.slabGlyph = add(scene.add.image(px(it.tx), (it.ty + 1) * TILE - 18, 'runes/32x32_tide_runes_32x32_sheet', 13).setBlendMode(Phaser.BlendModes.ADD).setTint(0x7be0df).setAlpha(0.9).setDepth((it.ty + 1) * TILE + 1)) as Phaser.GameObjects.Image;
    scene.tweens.add({ targets: this.slabGlyph, alpha: { from: 0.45, to: 1 }, duration: 1300, yoyo: true, repeat: -1 });
    // ---- thread stones (rune circle on the ground)
    const st = OBJECT_TILES.stones;
    if (!scene.anims.exists('dc-rune')) scene.anims.create({ key: 'dc-rune', frames: scene.anims.generateFrameNumbers('portals/tide_rune_circle', { start: 0, end: 11 }), frameRate: 10, repeat: -1 });
    add(scene.add.sprite(px(st.tx), px(st.ty) + 4, 'portals/tide_rune_circle').setScale(1.1, 0.7).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(-500).play('dc-rune'));
    // the other rune circle by the bench
    add(scene.add.sprite(px(2), px(7) + 8, 'portals/tide_rune_circle').setScale(0.9, 0.55).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(-500).play('dc-rune'));

    // ---- piles (built from imported plank-tile strips)
    this.woodCont = add(scene.add.container(0, 0).setDepth(0)) as Phaser.GameObjects.Container;
    this.plankCont = add(scene.add.container(0, 0).setDepth(0)) as Phaser.GameObjects.Container;
    for (let i = 0; i < 3; i++) {
      const w = scene.add.image(0, -i * 6, 'tiles/wood_planks_light', 'strip_b').setTint(0xa86b32).setScale(0.8, 1.15).setOrigin(0.5, 1);
      const cap = scene.add.image(11, -i * 6, 'vfx/p_circle_05').setScale(0.025).setTint(0xd9a066).setOrigin(0.5, 1.4);
      this.woodCont.add([w, cap]); this.woodStrips.push(w);
      const p = scene.add.image(0, -i * 5, 'tiles/wood_planks_light', 'strip_a').setTint(0xf2dcb4).setScale(0.9, 1).setOrigin(0.5, 1).setAngle(i === 1 ? 2 : -1);
      this.plankCont.add(p); this.plankStrips.push(p);
    }
    this.placePiles(state);

    // ---- ambience: smoke / embers, water glints
    this.smoke = scene.add.particles(0, 0, 'vfx/p_smoke_08', { lifespan: 2400, speedY: { min: -26, max: -14 }, speedX: { min: -5, max: 8 }, scale: { start: 0.06, end: 0.17 }, alpha: { start: 0.5, end: 0 }, frequency: 220, tint: 0x6e6a66, emitting: false });
    this.embers = scene.add.particles(0, 0, 'vfx/p_flare_01', { lifespan: 900, speedY: { min: -28, max: -8 }, scale: { start: 0.05, end: 0 }, alpha: { start: 0.9, end: 0 }, frequency: 160, tint: 0xff9a3c, blendMode: 'ADD', emitting: false });
    this.smoke.setDepth(5000); this.embers.setDepth(5000);
    layer.add(this.smoke); layer.add(this.embers);
    if (!scene.anims.exists('dc-wavy')) scene.anims.create({ key: 'dc-wavy', frames: scene.anims.generateFrameNumbers('vfx/wavy_blue', { start: 0, end: 29 }), frameRate: 12, repeat: -1 });
    if (!reduceMotion) for (const [gx, gy] of [[5, 2], [5, 7], [8, 9], [14, 9], [3, 9]] as const) {
      const g = add(scene.add.sprite(px(gx), px(gy), 'vfx/wavy_blue').setScale(0.2).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(-800).play({ key: 'dc-wavy', startFrame: Math.floor(h2(gx, gy) * 20) }));
      this.glints.push(g);
    }
    this.focusRing = add(scene.add.image(0, 0, 'vfx/p_circle_05').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1c9).setScale(0.1, 0.06).setAlpha(0).setDepth(4000));
    this.focusArrow = add(scene.add.image(0, 0, 'vfx/p_star_04').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1c9).setScale(0.05).setAlpha(0).setDepth(4001));
    void flags;
    this.refresh(state);
  }

  private placePiles(state: Readonly<SimulationState>): void {
    const flags = state.nodes[state.player.nodeId].flags;
    const w = tileOf('woodpile', flags), p = tileOf('planks', flags);
    this.woodCont.setPosition(px(w.tx) - 2, (w.ty + 1) * TILE - 6).setDepth((w.ty + 1) * TILE);
    this.plankCont.setPosition(px(p.tx), (p.ty + 1) * TILE - 6).setDepth((p.ty + 1) * TILE);
  }

  /** Re-read the sim: bridge, ford, sand path, wheel, gate, garden, dry/fire tints and piles. */
  refresh(state: Readonly<SimulationState>): void {
    const n = state.nodes[state.player.nodeId];
    const f = n.flags;
    const alien = state.v2.realm === 'ALIEN';
    const walk = getWalkability(n.world, f, state.v2.realm);
    const key = [f.join(','), n.world.water, alien, state.player.taken.wood, state.player.taken.plank].join('|');
    // dynamic land
    for (const t of this.sand) {
      const cell = (t.getData('cell') as string).slice(1).split(',').map(Number);
      t.setVisible(!!walk[cell[1]][cell[0]]);
    }
    const bridgeOk = walk[5][5];
    this.deck.setVisible(bridgeOk);
    this.stubs.forEach(s => s.setVisible(!bridgeOk));
    // wheel and gate
    this.turning = f.includes('WHEEL_TURNING') && !alien;
    const open = f.includes('WATER_DIVERTED');
    this.gate.setTint(open ? 0x9fd6a8 : 0xd9a066).setScale(0.5, open ? 0.28 : 0.5).setAlpha(open ? 0.85 : 1);
    this.water.setTint(open ? WATER_DEEP : n.world.water >= 3 ? WATER_DEEP : WATER);
    this.mastGlow.setAlpha(f.includes('RADIO_CLEAR') ? 0.9 : f.includes('RADIO_SMOKE') ? 0.05 : this.turning ? 0.3 : 0.1);
    this.slab.setAlpha(1);
    // garden
    const grown = f.includes('GARDEN_GROWN'), withered = f.includes('GARDEN_WITHERED');
    this.beds.setVisible(grown); this.soil.setVisible(withered);
    // dry grass / fire
    const dry = f.includes('DRY'), fire = f.includes('FIRE_SPREAD');
    this.tint.dry = dry;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = this.land[ty][tx];
      if (!t || MAP_ROWS[ty][tx] === '=') continue;
      const v = 0.94 + 0.06 * h2(tx, ty, 9);
      const base = dry ? DRY_LAWN : 0xffffff;
      const c = Phaser.Display.Color.IntegerToColor(base);
      t.setTint(Phaser.Display.Color.GetColor(Math.round(c.red * v), Math.round(c.green * v), Math.round(c.blue * v)));
    }
    const smoky = f.includes('SMOKE') && !alien;
    this.smoke.stop(); this.embers.stop();
    if (smoky) {
      this.smoke.setPosition(SMOKE_TILES[0].tx * TILE + 24, SMOKE_TILES[0].ty * TILE + 20); this.smoke.start();
    }
    if (fire) { this.embers.setPosition(SMOKE_TILES[1].tx * TILE + 18, SMOKE_TILES[1].ty * TILE + 26); this.embers.start(); }
    // piles
    this.placePiles(state);
    const wl = 3 - state.player.taken.wood, pl = 3 - state.player.taken.plank;
    this.woodStrips.forEach((s, i) => { s.setVisible(i < wl); });
    this.woodCont.each((c: Phaser.GameObjects.GameObject, idx: number) => (c as Phaser.GameObjects.Image).setVisible(Math.floor(idx / 2) < wl));
    this.plankStrips.forEach((s, i) => s.setVisible(i < pl));
    // alien realm: the whole forest grows over with strange leaves
    this.layer.setAlpha(1);
    this.lastKey = key;
    // beacon
    this.syncBeacon(state);
  }

  syncBeacon(state: Readonly<SimulationState>): void {
    const a = state.nodes[state.player.nodeId].flags.includes('LANTERN_LIT');
    const c = state.nodes[state.partner.nodeId].flags.includes('LANTERN_LIT');
    this.beacon.setDusty(!a && !c).setFlame(a, c);
  }

  update(dt: number): void {
    if (this.turning) this.spin += dt * 4; else this.spin += dt * 0.15;
    this.wheel.setAngle((this.spin * 57.3) % 360);
    if (this.mast) this.mast.setAngle(Math.sin(this.spin * 0.4) * 0.8);
  }

  /** Pixel centre of an object's tile (standing spot for echoes). */
  posOf(id: string, state: Readonly<SimulationState>): { x: number; y: number } {
    const t = tileOf(id, state.nodes[state.player.nodeId].flags);
    return { x: px(t.tx), y: px(t.ty) };
  }

  setFocus(id: string | null, state: Readonly<SimulationState>, tms: number): { x: number; y: number } | null {
    if (!id) { this.focusRing.setAlpha(0); this.focusArrow.setAlpha(0); return null; }
    const p = this.posOf(id, state);
    const pulse = 0.65 + 0.25 * Math.sin(tms / 260);
    this.focusRing.setPosition(p.x, p.y + 12).setAlpha(pulse);
    this.focusArrow.setPosition(p.x, p.y - 24 + Math.sin(tms / 200) * 2).setAlpha(0.95).setAngle(tms / 12);
    return p;
  }
}
export { FEET };
