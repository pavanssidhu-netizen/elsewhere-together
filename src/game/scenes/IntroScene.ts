import Phaser from 'phaser';
import { DCScene } from '../base';
import { boxText } from '../ui/fit';
import { Beacon } from '../shared/beacon';
import {
  CYAN, PINK, ADD, crispFonts, only, myc, setMyc, flip, flipAnim, buildForest, lerpTint, Caption, rngFor,
} from '../cutscene/kit';

const LINE_Y = 270, ANOM_X = 2000, TL_END = 2500;
type Cam = Phaser.Cameras.Scene2D.Camera;

/** COSMIC_INTRO: press-to-advance narration (tm_intro_1..9). The visuals are driven by the line index, never by a clock; ambient motion keeps running while waiting. */
export class IntroScene extends DCScene {
  constructor() { super('IntroScene'); }
  private alive = true;
  private bg!: Cam; private wld!: Cam; private fc!: Cam; private lc!: Cam; private rc!: Cam; private tc!: Cam;
  private view = { x: 300, zoom: 1.1, bgz: 1, bob: 0, dx: 0 };
  private q: Promise<void> = Promise.resolve();
  private tags: Phaser.GameObjects.BitmapText[] = [];
  private split = { d: 0, on: false };
  private bgLayers: Array<{ t: Phaser.GameObjects.TileSprite; f: number }> = [];
  private tintL!: Phaser.GameObjects.Rectangle; private tintR!: Phaser.GameObjects.Rectangle;
  private caption!: Caption;
  private rm = false;

  create(): void {
    this.alive = true; this.split = { d: 0, on: false }; this.view = { x: 300, zoom: 1.1, bgz: 1, bob: 0, dx: 0 }; this.bgLayers = []; this.q = Promise.resolve(); this.tags = [];
    this.rm = this.dc.settings.reduceMotion;
    crispFonts(this);
    const { W, H } = this;
    this.bg = this.cameras.main; this.bg.setBackgroundColor(0x03040a);
    this.wld = this.cameras.add(0, 0, W, H);
    this.fc = this.cameras.add(0, 0, W, H);
    this.lc = this.cameras.add(0, 0, W / 2, H).setVisible(false);
    this.rc = this.cameras.add(W / 2, 0, W / 2, H).setScroll(W / 2, 0).setVisible(false);
    this.tc = this.cameras.add(0, 0, W, H);
    this.dc.audio.playMusic('cosmic');

    this.buildCosmos(); this.buildForestShot();
    this.caption = new Caption(this); only(this, this.caption.c, [this.tc]);
    // multiply tints that make the two halves look like different realities
    this.tintL = only(this, this.add.rectangle(0, 0, W / 2, H, 0x9fb8ff).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false).setDepth(5), [this.tc]);
    this.tintR = only(this, this.add.rectangle(W / 2, 0, W / 2, H, 0xffd2a0).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false).setDepth(5), [this.tc]);
    this.applyView();

    this.events.once('shutdown', () => { this.alive = false; this.caption.dispose(); this.dc.audio.skipVoice(); this.time.removeAllEvents(); this.tweens.killAll(); });
    this.tc.fadeIn(900, 0, 0, 0);
    this.run().catch(() => { /* scene was stopped mid-sequence */ });
  }

  // ---- scene building ---------------------------------------------------------------------------------------------------
  private buildCosmos(): void {
    const { W, H } = this; const bgc = [this.bg];
    only(this, this.add.image(W / 2, H / 2, 'space/nebula_violet').setScale(1.6).setAlpha(0.7), bgc);
    for (const [k, f, a] of [['space/starfield_white_far', 0.05, 0.9], ['space/starfield_white_mid', 0.12, 0.85], ['space/starfield_white_near', 0.25, 0.8]] as const) {
      const t = only(this, this.add.tileSprite(0, 0, W, H, k).setOrigin(0).setTileScale(1.6).setAlpha(a).setBlendMode(ADD), bgc);
      this.bgLayers.push({ t, f });
    }
    const w = [this.wld];
    // far scenery with parallax
    for (const [k, x, y, s, sf] of [['space/prop-planet-big', 900, 120, 2.5, 0.3], ['space/gas_giant_64', 1500, 410, 3, 0.35], ['space/cratered_moon_64', 260, 120, 2, 0.3], ['space/terran_64', 1300, 90, 2, 0.4], ['space/prop-planet-small', 600, 440, 2.5, 0.4]] as const) {
      only(this, this.add.image(x, y, k).setScale(s).setScrollFactor(sf).setAlpha(0.85), w);
    }
    // the timeline: soft glow + thin bright core, nodes along it
    only(this, this.add.image(TL_END / 2 - 150, LINE_Y, 'vfx/p_light_01').setScale(TL_END / 512 + 0.6, 0.16).setTint(CYAN).setBlendMode(ADD).setAlpha(0.55), w);
    only(this, this.add.rectangle(TL_END / 2 - 150, LINE_Y, TL_END + 300, 3, 0xdafffd).setBlendMode(ADD).setAlpha(0.95), w);
    let i = 0;
    for (let x = -100; x <= TL_END - 100; x += 90, i++) {
      if (Math.abs(x - ANOM_X) < 60) continue;
      const g = only(this, this.add.image(x, LINE_Y, 'vfx/p_light_01').setScale(0.1).setTint(CYAN).setBlendMode(ADD).setAlpha(0.5), w);
      const c = only(this, this.add.image(x, LINE_Y, 'vfx/p_star_04').setScale(0.035).setBlendMode(ADD), w);
      only(this, this.add.rectangle(x, LINE_Y + 18, 2, 10, CYAN, 0.5).setBlendMode(ADD), w);
      only(this, this.add.rectangle(x, LINE_Y - 18, 2, 10, CYAN, 0.5).setBlendMode(ADD), w);
      this.tweens.add({ targets: [g, c], alpha: { from: 0.25, to: 1 }, yoyo: true, repeat: -1, duration: 900, delay: (i * 170) % 900, ease: 'Sine.easeInOut' });
    }
    // light packets travelling along the line
    for (let n = 0; n < 7; n++) {
      const p = only(this, this.add.image(0, LINE_Y, 'vfx/p_star_04').setScale(0.1).setTint(0xdafffd).setBlendMode(ADD), w);
      this.tweens.add({ targets: p, x: { from: -150 + n * 40, to: ANOM_X - 100 }, duration: 9500 + n * 700, delay: n * 1100, repeat: -1, ease: 'Sine.easeIn' });
    }
    // the node that is about to go wrong
    this.aGlow = only(this, this.add.image(ANOM_X, LINE_Y, 'vfx/p_light_01').setScale(0.2).setTint(CYAN).setBlendMode(ADD).setAlpha(0.8), w);
    this.aCore = only(this, this.add.image(ANOM_X, LINE_Y, 'vfx/p_star_04').setScale(0.08).setBlendMode(ADD), w);
    this.aVortex = only(this, this.add.sprite(ANOM_X, LINE_Y, 'vfx/vortex').setScale(1.2).setTint(PINK).setBlendMode(ADD).setAlpha(0).play(flipAnim(this, 'vfx/vortex', 16, true)), w);
    this.aWavy = only(this, this.add.sprite(ANOM_X, LINE_Y, 'vfx/wavy_purple').setScale(1.4).setBlendMode(ADD).setAlpha(0).play(flipAnim(this, 'vfx/wavy_purple', 12, true)), w);
    this.tweens.add({ targets: this.aCore, scale: 0.1, yoyo: true, repeat: -1, duration: 700 });
  }
  private aGlow!: Phaser.GameObjects.Image; private aCore!: Phaser.GameObjects.Image;
  private aVortex!: Phaser.GameObjects.Sprite; private aWavy!: Phaser.GameObjects.Sprite;
  private forestC!: Phaser.GameObjects.Container; private beacon!: Beacon;
  private jen!: Phaser.GameObjects.Sprite; private sam!: Phaser.GameObjects.Sprite;
  private maskImg!: Phaser.GameObjects.Image;

  private buildForestShot(): void {
    const f = buildForest(this, 0, 960, { padL: 600, padR: 600, padT: 400, padB: 400 });
    this.forestC = f.c;
    this.beacon = new Beacon(this, 480, 440, { scale: 3, dusty: true });
    this.jen = myc(this, 'red', 250, 452, 4, 'S');
    this.sam = myc(this, 'blue', 710, 452, 4, 'S');
    for (const o of [f.c, this.beacon, this.jen, this.sam]) only(this, o, [this.fc, this.lc, this.rc]);
    this.maskImg = this.add.image(this.W / 2, this.H / 2, 'vfx/p_light_01').setScale(0.01).setVisible(false);
    for (const c of this.cameras.cameras) c.ignore(this.maskImg);
    f.c.setVisible(false); this.beacon.setVisible(false); this.jen.setVisible(false); this.sam.setVisible(false);
  }
  private forestShow(on: boolean): void { for (const o of [this.forestC, this.beacon, this.jen, this.sam]) o.setVisible(on); }

  // ---- helpers ------------------------------------------------------------------------------------------------------------
  private applyView(): void {
    const v = this.view;
    this.wld.setZoom(v.zoom); this.wld.centerOn(v.x + v.dx, LINE_Y + v.bob);
    this.bg.setZoom(v.bgz);
    for (const l of this.bgLayers) { l.t.tilePositionX = (v.x + v.dx) * l.f; l.t.tilePositionY = v.bob * l.f; }
  }
  update(): void {
    if (!this.alive) return;
    this.applyView();
    if (this.split.on) {
      const d = this.split.d, W = this.W, H = this.H;
      this.lc.setViewport(0, 0, W / 2 - d, H).setScroll(d, 0);
      this.rc.setViewport(W / 2 + d, 0, W / 2 - d, H).setScroll(W / 2, 0);
      this.tintL.width = W / 2 - d; this.tintR.x = W / 2 + d; this.tintR.width = W / 2 - d;
    }
  }
  private wait(ms: number): Promise<void> { return new Promise((res) => { this.time.delayedCall(ms, () => res()); }); }
  private tweenP(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> { return new Promise((res) => { this.tweens.add({ ...cfg, onComplete: () => res() }); }); }
  private ok(): void { if (!this.alive) throw new Error('stopped'); }
  /** One narration line: typed, then waits for Enter / Space / click / tap. Never advances by itself. */
  private async say(id: string): Promise<void> { await this.caption.ask(id); this.ok(); }
  /** Queue a visual stage (runs in order, never blocks the narration). */
  private stage(fn: () => Promise<void> | void): void { this.q = this.q.then(async () => { if (this.alive) await fn(); }).catch(() => undefined); }
  private beep(): void { this.dc.audio.playSfx('beep'); }
  private flash(color: number, peak: number, inMs: number): Promise<void> {
    const r = only(this, this.add.rectangle(0, 0, this.W, this.H, color).setOrigin(0).setDepth(900).setAlpha(0).setBlendMode(ADD), [this.tc]);
    const p = this.rm ? Math.min(peak, 0.35) : peak;
    return this.tweenP({ targets: r, alpha: p, duration: inMs, yoyo: true, hold: 30, ease: 'Quad.easeOut' }).then(() => { r.destroy(); });
  }
  private burst(rand: () => number, n: number, big: number): void {
    for (let i = 0; i < n; i++) {
      const rot = rand() * Math.PI * 2;
      only(this, flip(this, 'vfx/lightstreaks', ANOM_X, LINE_Y, { scale: big * (0.8 + rand() * 0.7), tint: PINK, rot, fps: 16 + Math.floor(rand() * 8), alpha: 0.9, depth: 3 }), [this.wld]);
    }
    only(this, flip(this, 'vfx/electric_ring', ANOM_X, LINE_Y, { scale: big * 1.6, tint: PINK, fps: 18, depth: 3 }), [this.wld]);
    only(this, flip(this, 'vfx/wavy_purple', ANOM_X, LINE_Y, { scale: big * 1.5, fps: 14, depth: 2, alpha: 0.8 }), [this.wld]);
    if (!this.rm) this.wld.shake(260, 0.004);
  }

  // ---- the sequence: line N starts stage N ---------------------------------------------------------------------------------
  private async run(): Promise<void> {
    const rand = rngFor(0x1a7e0);
    // ambient motion that never stops: the camera floats, nodes pulse (tweens above), the anomaly core spins
    this.tweens.add({ targets: this.view, bob: this.rm ? 0 : 10, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.view, dx: this.rm ? 0 : 26, duration: 4600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.aCore, angle: this.rm ? 0 : 360, repeat: -1, duration: 2200 });
    this.time.addEvent({ delay: 1400, loop: true, callback: () => { if (this.view.zoom < 3 && !this.rm) only(this, flip(this, 'vfx/wavy_blue', ANOM_X, LINE_Y, { scale: 0.7, fps: 10, alpha: 0.25, depth: 1 }), [this.wld]); } });
    await this.wait(300); this.ok();

    // line 1: the camera glides along the timeline
    this.tweens.add({ targets: this.view, x: 900, zoom: 1.2, duration: 5000, ease: 'Sine.easeOut' });
    await this.say('tm_intro_1');
    this.beep();
    // line 2: one node distorts
    this.stage(() => {
      this.tweens.add({ targets: this.view, x: 1500, zoom: 1.3, duration: 4500, ease: 'Sine.easeOut' });
      const warp = { t: 0 };
      this.tweens.add({ targets: warp, t: 1, duration: 3200, onUpdate: () => { this.aGlow.setTint(lerpTint(CYAN, PINK, warp.t)); this.aCore.setTint(lerpTint(0xffffff, PINK, warp.t)); } });
      this.tweens.add({ targets: this.aGlow, scale: 0.55, alpha: 1, duration: 3800, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [this.aVortex, this.aWavy], alpha: 0.75, duration: 3000 });
      this.dc.audio.playSfx('branch');
      this.time.delayedCall(1500, () => { if (this.alive) this.burst(rand, 2, 1); });
    });
    await this.say('tm_intro_2');
    // line 3: pink branching energy bursts outwards
    this.stage(() => {
      this.tweens.add({ targets: this.view, x: ANOM_X - 40, zoom: 1.4, duration: 4500, ease: 'Sine.easeOut' });
      this.dc.audio.playSfx('pink_flash');
      this.burst(rand, 4, 1.5);
      this.time.addEvent({ delay: 900, repeat: 3, callback: () => { if (this.alive) this.burst(rand, 2, 1.3 + rand() * 0.6); } });
    });
    await this.say('tm_intro_3');
    this.beep();

    // line 4 ("Oh."): zoom into the anomaly, the forest shows up inside it, the music changes with it
    this.stage(async () => {
      this.dc.audio.playSfx('cosmic_boom');
      this.tweens.add({ targets: this.view, x: ANOM_X, zoom: 9, bgz: 1.7, duration: 3900, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [this.aGlow, this.aVortex, this.aWavy], alpha: 0.4, duration: 2500 });
      await this.wait(1400); this.ok();
      this.burst(rand, 3, 2.2);
      this.fc.setZoom(0.55); this.forestShow(true);
      this.forestC.setMask(new Phaser.Display.Masks.BitmapMask(this, this.maskImg));
      this.beacon.setMask(this.forestC.mask!); this.jen.setMask(this.forestC.mask!); this.sam.setMask(this.forestC.mask!);
      this.maskImg.setVisible(true).setScale(0.01);
      await this.tweenP({ targets: this.maskImg, scale: 3.2, duration: 2600, ease: 'Cubic.easeOut' });
    });
    const l4 = this.say('tm_intro_4');
    this.dc.audio.playMusic('forest', { fadeMs: 1200 });   // the cut from space to the forest changes the music
    await l4;
    // line 5 ("Two mushrooms."): the forest settles
    this.stage(() => { this.tweens.add({ targets: this.fc, zoom: 0.9, duration: 2400, ease: 'Sine.easeInOut' }); });
    await this.say('tm_intro_5');
    this.beep();
    // line 6 ("They've touched the beacon."): cut to the close view, the brothers walk to the dusty beacon and touch it
    this.stage(async () => {
      await this.flash(0xffffff, 0.8, 140); this.ok();
      for (const o of [this.forestC, this.beacon, this.jen, this.sam]) o.clearMask();
      this.wld.setVisible(false); this.fc.setZoom(1); this.bg.setVisible(false);
      setMyc(this.jen, this, 'red', 'walk', 'E'); setMyc(this.sam, this, 'blue', 'walk', 'W');
      this.tweens.add({ targets: this.jen, x: 372, duration: 1900, ease: 'Sine.easeInOut' });
      await this.tweenP({ targets: this.sam, x: 588, duration: 1900, ease: 'Sine.easeInOut' }); this.ok();
      setMyc(this.jen, this, 'red', 'attack', 'E'); setMyc(this.sam, this, 'blue', 'attack', 'W');
      this.dc.audio.playSfx('beacon_light');
    });
    await this.say('tm_intro_6');
    // line 7 ("Of course they have."): the beacon flares
    this.stage(() => {
      this.beacon.setDusty(false).setFlame(true, true).setHarmony(false);
      const fl = only(this, this.add.image(480, 400, 'vfx/p_flare_01').setTint(0xfff2c4).setBlendMode(ADD).setScale(0.3).setAlpha(0.95).setDepth(50), [this.fc]);
      this.tweens.add({ targets: fl, scale: 5, alpha: 0, duration: 1500, ease: 'Quad.easeOut', onComplete: () => fl.destroy() });
      only(this, flip(this, 'vfx/impact_white', 480, 400, { scale: 3, tint: CYAN, depth: 50 }), [this.fc]);
    });
    await this.say('tm_intro_7');
    this.beep();
    // line 8: the pink flash splits the screen into two realities; only name tags above the brothers
    this.stage(async () => {
      this.dc.audio.playSfx('pink_flash');
      const fp = this.flash(PINK, 1, 320);
      await this.wait(300); this.ok();
      this.openSplit();
      await fp; this.ok();
      setMyc(this.jen, this, 'red', 'idle', 'S'); setMyc(this.sam, this, 'blue', 'idle', 'S');
      this.tweens.add({ targets: this.split, d: 36, duration: 1600, ease: 'Back.easeOut' });
    });
    await this.say('tm_intro_8');
    // line 9: the halves drift further apart, both brothers alone
    this.stage(() => { this.tweens.add({ targets: this.split, d: 78, duration: 4200, ease: 'Sine.easeInOut' }); });
    await this.say('tm_intro_9');
    this.tc.fadeOut(400, 0, 0, 0);
    await this.wait(420); this.ok();
    this.send({ type: 'CONTINUE' });
  }

  private openSplit(): void {
    const { W, H } = this;
    this.fc.setVisible(false);
    this.lc.setVisible(true); this.rc.setVisible(true); this.tintL.setVisible(true); this.tintR.setVisible(true);
    this.split = { d: 6, on: true };
    this.bg.setVisible(true).setZoom(1.3);          // the void shows through the tear
    // name tags only: nothing about who is past or future
    [[this.jen, 'JENSEN', 0xff8a8a], [this.sam, 'SAM', 0x8ab4ff]].forEach(([spr, nm, tint]) => {
      const sp = spr as Phaser.GameObjects.Sprite;
      const tg = boxText(this, 'Pepper16-Bold', nm as string, { x: sp.x - 90, y: 262, w: 180, h: 22 }, { max: 20, min: 12, align: 'center', tint: tint as number, depth: 60 }, 'name-tag');
      only(this, tg, [this.lc, this.rc]); this.tags.push(tg);
    });
    // the tear itself (on the top camera, between the halves)
    const t = [this.tc];
    only(this, this.add.image(W / 2, H / 2, 'vfx/p_light_01').setScale(0.22, 1.5).setTint(PINK).setBlendMode(ADD).setAlpha(0.9).setDepth(20), t);
    only(this, this.add.rectangle(W / 2, H / 2, 3, H, 0xffe8f0).setBlendMode(ADD).setAlpha(0.9).setDepth(21), t);
    for (const y of [120, 270, 420]) only(this, this.add.sprite(W / 2, y, 'vfx/lightstreaks').setRotation(Math.PI / 2).setScale(1.1).setTint(PINK).setBlendMode(ADD).setAlpha(this.rm ? 0.3 : 0.55).setDepth(22).play(flipAnim(this, 'vfx/lightstreaks', this.rm ? 6 : 14, true)), t);
    const em = this.add.particles(W / 2, H / 2, 'vfx/p_spark_03', { x: { min: -6, max: 6 }, y: { min: -250, max: 250 }, speedX: { min: -60, max: 60 }, speedY: { min: -30, max: 30 }, lifespan: 1400, scale: { start: 0.12, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: PINK, blendMode: 'ADD', frequency: this.rm ? 160 : 60 }).setDepth(23);
    only(this, em, t);
  }
}
