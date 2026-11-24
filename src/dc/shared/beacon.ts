import Phaser from 'phaser';

/**
 * THE beacon: one shared, recognisable object used by the intro, the forest and the reunion.
 * Composition (all imported art): ancient stone well body + candle lantern on its roof + cyan rune circle on the ground
 * + two arcs of three light pips (amber = the player's side, cyan = the partner's side) + additive glows.
 *  - setDusty(true): grey, unlit, cobwebby (intro start, forest start)
 *  - setProgress(playerPips, partnerPips): lights pips one by one from REAL sim state
 *  - setHarmony(true): both colours resolve into one warm white-gold pulse (ready to synchronise / reunion)
 */
export class Beacon extends Phaser.GameObjects.Container {
  private well: Phaser.GameObjects.Image;
  private lantern: Phaser.GameObjects.Image;
  private rune: Phaser.GameObjects.Sprite;
  private glowA: Phaser.GameObjects.Image;
  private glowC: Phaser.GameObjects.Image;
  private pipsA: Phaser.GameObjects.Image[] = [];
  private pipsC: Phaser.GameObjects.Image[] = [];
  private harmony = false;
  private k: number;

  constructor(scene: Phaser.Scene, x: number, y: number, o: { scale?: number; dusty?: boolean } = {}) {
    super(scene, x, y);
    const k = (this.k = o.scale ?? 2);
    if (!scene.anims.exists('dc-rune')) scene.anims.create({ key: 'dc-rune', frames: scene.anims.generateFrameNumbers('portals/tide_rune_circle', { start: 0, end: 11 }), frameRate: 10, repeat: -1 });
    this.rune = scene.add.sprite(0, 6 * k, 'portals/tide_rune_circle').setScale(k * 1.5, k * 0.7).setAlpha(0.0).setBlendMode(Phaser.BlendModes.ADD).play('dc-rune');
    this.glowA = scene.add.image(-6 * k, -22 * k, 'vfx/p_light_01').setScale(k * 0.2).setTint(0xffb24a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.glowC = scene.add.image(6 * k, -22 * k, 'vfx/p_light_01').setScale(k * 0.2).setTint(0x7be0df).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.well = scene.add.image(0, 0, 'garden/stone_well_with_a_wooden_roof_and_a_bucket').setScale(k).setOrigin(0.5, 1);
    this.lantern = scene.add.image(0, -36 * k, 'home/candle_lantern').setScale(k * 0.6).setOrigin(0.5, 1);
    this.add([this.rune, this.glowA, this.glowC, this.well, this.lantern]);
    for (let i = 0; i < 3; i++) {
      const a = (-0.9 + i * 0.9); // radians around the left / right side of the base
      const ya = -14 * k + Math.sin(a) * 26 * k, xa = Math.cos(a) * 34 * k;
      const pa = scene.add.image(-xa, ya, 'vfx/p_star_01').setScale(k * 0.06).setTint(0xffb24a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18);
      const pc = scene.add.image(xa, ya, 'vfx/p_star_01').setScale(k * 0.06).setTint(0x7be0df).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18);
      this.pipsA.push(pa); this.pipsC.push(pc); this.add([pa, pc]);
    }
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    this.setDusty(o.dusty ?? false);
    scene.tweens.add({ targets: [this.glowA, this.glowC], scale: { from: k * 0.18, to: k * 0.23 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
  }

  setDusty(dusty: boolean): this {
    this.well.setTint(dusty ? 0x8d887c : 0xffffff); this.lantern.setTint(dusty ? 0x77746c : 0xffffff);
    this.rune.setAlpha(dusty ? 0.0 : 0.45);
    return this;
  }
  /** Flame state: amber = your flame burns; cyan = their flame burns (shown as a cyan glow, a sensory echo, never the real thing). */
  setFlame(amber: boolean, cyan: boolean): this {
    this.scene.tweens.add({ targets: this.glowA, alpha: amber ? 0.9 : 0, duration: 400 });
    this.scene.tweens.add({ targets: this.glowC, alpha: cyan ? 0.8 : 0, duration: 400 });
    this.lantern.setTint(amber ? 0xffe2a0 : 0x9a968c); this.rune.setAlpha(amber || cyan ? 0.8 : 0.35);
    return this;
  }
  /** pips: [flame, connection, coordination] for each side. */
  setProgress(player: boolean[], partner: boolean[]): this {
    player.forEach((on, i) => this.lightPip(this.pipsA[i], on));
    partner.forEach((on, i) => this.lightPip(this.pipsC[i], on));
    return this;
  }
  private lightPip(p: Phaser.GameObjects.Image, on: boolean): void {
    const target = on ? 1 : 0.18, s = this.k * (on ? 0.1 : 0.06);
    if (p.alpha === target) return;
    this.scene.tweens.add({ targets: p, alpha: target, scale: s, duration: 350, ease: 'Back.easeOut' });
    if (on) this.scene.tweens.add({ targets: p, scale: s * 1.7, yoyo: true, duration: 180 });
  }
  /** Both sides ready: the colours merge into one white-gold pulse. */
  setHarmony(on: boolean): this {
    if (on === this.harmony) return this;
    this.harmony = on;
    const t = on ? 0xfff2c4 : null;
    for (const g of [this.glowA, this.glowC]) { if (t) g.setTint(t); }
    if (!on) { this.glowA.setTint(0xffb24a); this.glowC.setTint(0x7be0df); }
    this.scene.tweens.add({ targets: [this.glowA, this.glowC], alpha: on ? 1 : 0.7, duration: 600 });
    this.pipsA.forEach(p => p.setTint(on ? 0xfff2c4 : 0xffb24a)); this.pipsC.forEach(p => p.setTint(on ? 0xfff2c4 : 0x7be0df));
    return this;
  }
  pulse(color = 0xffffff): void {
    const r = this.scene.add.image(this.x, this.y - 22 * this.k, 'vfx/p_circle_05').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(this.k * 0.1).setAlpha(0.9).setDepth(this.depth + 1);
    this.scene.tweens.add({ targets: r, scale: this.k * 0.8, alpha: 0, duration: 700, onComplete: () => r.destroy() });
  }
}
