import Phaser from 'phaser';
import { DCScene } from '../base';
import {
  RunnerSim, DT, LANES, ANCHORS_TO_WIN, MAX_HITS, distAt, type SimEvent, type Move, type Row,
} from '../runner/runnerSim';

// 'Stitch the Timeline': the player steers the Time Master's repair Thread through three lanes.
// All rules live in the pure RunnerSim; this scene only feeds it input while `live` and draws what it reports.

const CYAN = 0x7be0df;
const MAGENTA = 0xd5309a;
const PLAYER_Y = 418;
const LANE_X = [346, 480, 614];
const LANE_W = 128;
const SWIPE_PX = 26;
const BTN = 124;
const READY_SEC = 2.0;
const INSTRUCTION = 'Steer the thread. Dodge the broken branches. Collect 3 anchors.';
const RUNE_FRAMES = [3, 11, 19, 27, 35];

const hazKey = (row: number, lane: number) => 1_000_000 + row * 4 + lane;
type Phase = 'ready' | 'play' | 'ended';
interface RowVis { c: Phaser.GameObjects.Container; row: Row; idx: number; kind: 'hazard' | 'anchor'; lane: number }

export class RunnerScene extends DCScene {
  sim!: RunnerSim;
  private phase: Phase = 'ready';
  private readyT = 0;
  private lastCount = -1;
  private pendingMove: Move = 0;
  private bgDist = 0;
  private trailDist = 0;
  private headX = LANE_X[1];
  private trail: { x: number; d: number }[] = [];
  private vis = new Map<number, RowVis>();
  private rowDist: number[] = [];
  private spawnIdx = 0;
  private flashT = 0;
  private ended = false;
  private exitAt = 0;
  private swipeStartX = new Map<number, number>();
  private swipeDir = new Map<number, Move>();
  private consumed = new Set<number>();
  private bg: { ts: Phaser.GameObjects.TileSprite; k: number }[] = [];
  private planets: { img: Phaser.GameObjects.Image; x: number; k: number; off: number }[] = [];
  private guides!: Phaser.GameObjects.Graphics;
  private trailG!: Phaser.GameObjects.Graphics;
  private head!: Phaser.GameObjects.Container;
  private headGlow!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Graphics;
  private healthPips: Phaser.GameObjects.Image[] = [];
  private anchorPips: Phaser.GameObjects.Image[] = [];
  private instr!: Phaser.GameObjects.Container;
  private bigText!: Phaser.GameObjects.BitmapText;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor() { super('RunnerScene'); }

  create(): void {
    // every restart builds a fresh scene state (the same Scene object is re-run by the flow)
    this.phase = 'ready'; this.readyT = 0; this.lastCount = -1; this.pendingMove = 0; this.bgDist = 0; this.trailDist = 0;
    this.headX = LANE_X[1]; this.trail = []; this.vis = new Map(); this.spawnIdx = 0; this.flashT = 0; this.ended = false; this.exitAt = 0;
    this.swipeStartX = new Map(); this.swipeDir = new Map(); this.consumed = new Set(); this.bg = []; this.planets = []; this.healthPips = []; this.anchorPips = [];

    const seed = this.snap?.runnerSeed ?? this.snap?.baseSeed ?? 1;
    this.sim = new RunnerSim(seed, { relaxed: this.dc.settings.relaxed });
    this.rowDist = this.sim.rows.map(r => distAt(this.sim.tuning, r.tick / 60));

    this.cameras.main.setBackgroundColor(0x05060d);
    this.makeAnims();
    this.buildBackdrop();
    this.guides = this.add.graphics().setDepth(5);
    this.trailG = this.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
    this.buildHead();
    this.buildHud();
    this.buildTouch();
    this.burst = this.add.particles(0, 0, 'vfx/p_star_01', {
      emitting: false, speed: { min: 60, max: 260 }, lifespan: 600, scale: { start: 0.25, end: 0 }, alpha: { start: 1, end: 0 }, tint: [CYAN, 0xffffff, 0xb9fffb], blendMode: 'ADD',
    }).setDepth(40);
    this.sparks = this.add.particles(0, 0, 'vfx/p_spark_03', {
      emitting: false, speed: { min: 80, max: 300 }, lifespan: 420, scale: { start: 0.3, end: 0 }, alpha: { start: 1, end: 0 }, tint: [MAGENTA, 0xff7ad0, 0xffffff], blendMode: 'ADD',
    }).setDepth(40);
    this.flash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, MAGENTA, 0).setDepth(60);

    this.bigText = this.txt(this.W / 2, 220, '', 64, 'Pepper16-Bold', 0xffffff).setOrigin(0.5).setDepth(70);
    this.fadeIn(300);
    this.dc.audio.playMusic('runner');
    this.dc.audio.setBondStress(0);
    this.bindInput();
    this.events.once('shutdown', () => this.cleanup());
    this.render(0);
  }

  // ---- setup ---------------------------------------------------------------------------------------------------
  private makeAnims(): void {
    const mk = (key: string, tex: string, start: number, end: number, rate: number, repeat = 0) => {
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: rate, repeat });
    };
    mk('dcrun-impact', 'vfx/impact_white', 0, 23, 48);
    mk('dcrun-bighit', 'vfx/big_hit', 0, 29, 48);
    mk('dcrun-star', 'vfx/star_explosion', 0, 29, 48);
    mk('dcrun-ring', 'vfx/electric_ring', 6, 29, 26, -1);
    mk('dcrun-rune', 'portals/tide_rune_circle', 0, 11, 12, -1);
    mk('dcrun-explosion', 'vfx/explosion', 0, 29, 40);
  }

  private frameOf(tex: string, name: string, x: number, y: number, w: number, h: number): string {
    const t = this.textures.get(tex);
    if (!t.has(name)) t.add(name, 0, x, y, w, h);
    return name;
  }

  private buildBackdrop(): void {
    const W = this.W, H = this.H;
    const layer = (key: string, k: number, scale: number, alpha = 1, add = false) => {
      const ts = this.add.tileSprite(W / 2, H / 2, W, H, key).setTileScale(scale, scale).setAlpha(alpha).setDepth(0);
      if (add) ts.setBlendMode(Phaser.BlendModes.ADD);
      this.bg.push({ ts, k });
      return ts;
    };
    layer('space/blue-back', 0.03, 3.6);
    layer('space/blue-stars', 0.05, 3.6, 0.55, true);
    layer('space/nebula_violet', 0.07, 1.5, 0.5, true);
    layer('space/starfield_white_far', 0.12, 1.5, 0.8);
    layer('space/starfield_white_mid', 0.22, 1.5, 0.9);
    // planets drift down slowly and wrap
    const gf = this.frameOf('space/gas_giant_64', 'f0', 0, 0, 64, 64);
    const tf = this.frameOf('space/terran_64', 'f0', 0, 0, 64, 64);
    const mf = this.frameOf('space/cratered_moon_64', 'f0', 0, 0, 64, 64);
    const mkP = (tex: string, fr: string, x: number, scale: number, k: number, off: number, alpha: number) => {
      const img = this.add.image(x, 0, tex, fr).setScale(scale).setAlpha(alpha).setDepth(1);
      this.planets.push({ img, x, k, off });
    };
    mkP('space/gas_giant_64', gf, 120, 3.4, 0.05, 40, 0.9);
    mkP('space/terran_64', tf, 850, 2.2, 0.08, 330, 0.9);
    mkP('space/cratered_moon_64', mf, 800, 1.2, 0.13, 640, 0.8);
    layer('space/starfield_white_near', 0.38, 1.5, 0.9).setDepth(2);
    // dark vignette strips so the lane area reads
    this.add.rectangle(LANE_X[1], this.H / 2, LANE_W * 3 + 24, this.H, 0x050a1a, 0.55).setDepth(3);
  }

  private buildHead(): void {
    const glow = this.add.image(0, 0, 'vfx/p_light_01').setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setScale(0.26);
    const flare = this.add.image(0, 0, 'vfx/p_flare_01').setTint(0xcffffd).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12);
    const core = this.add.image(0, 0, 'vfx/p_circle_05').setBlendMode(Phaser.BlendModes.ADD).setScale(0.035);
    this.headGlow = glow;
    this.head = this.add.container(this.headX, PLAYER_Y, [glow, flare, core]).setDepth(25);
    this.tweens.add({ targets: flare, angle: 360, duration: 2400, repeat: -1 });
    this.tweens.add({ targets: glow, alpha: { from: 0.8, to: 1 }, duration: 380, yoyo: true, repeat: -1 });
  }

  private buildHud(): void {
    const D = 50;
    this.add.rectangle(this.W / 2, 34, this.W, 68, 0x050a1a, 0.7).setDepth(D - 1);
    this.txt(20, 8, 'THREAD', 16, 'Aurora16-Smooth', CYAN).setDepth(D);
    for (let i = 0; i < MAX_HITS; i++) {
      this.healthPips.push(this.add.image(34 + i * 40, 46, 'runner/Diamond').setScale(2.6).setTint(CYAN).setDepth(D));
    }
    const lbl = this.txt(this.W - 104, 8, 'ANCHORS', 16, 'Aurora16-Smooth', 0xffe2a8).setDepth(D);
    lbl.setOrigin(1, 0);
    for (let i = 0; i < ANCHORS_TO_WIN; i++) {
      const pip = this.add.image(this.W - 224 + i * 44 + 22, 46, 'portals/tide_rune_circle', 0).setScale(0.62).setAlpha(0.3).setDepth(D);
      this.anchorPips.push(pip);
    }
    this.txt(this.W / 2, 8, 'TIMELINE', 16, 'Aurora16-Smooth', 0xffffff).setOrigin(0.5, 0).setDepth(D);
    this.bar = this.add.graphics().setDepth(D);
    // instruction banner
    const t = this.txt(0, 0, INSTRUCTION, 24, 'Aurora16-Smooth', 0xffffff).setOrigin(0.5).setCenterAlign().setMaxWidth(760);
    const bg = this.add.rectangle(0, 0, 800, t.height + 22, 0x050a1a, 0.78).setStrokeStyle(2, CYAN, 0.8);
    this.instr = this.add.container(this.W / 2, 128, [bg, t]).setDepth(D);
  }

  private buildTouch(): void {
    const mk = (x: number, dir: Move, label: string) => {
      const img = this.add.image(0, 0, 'ui/button-normal');
      img.setScale(BTN / img.width, BTN / img.width);
      const t = this.add.bitmapText(0, -4, 'fonts/Pepper16-Bold', label, 64).setOrigin(0.5).setTint(0xfff1c9);
      const c = this.add.container(x, this.H - BTN / 2 - 8, [img, t]).setSize(BTN, BTN).setDepth(55).setAlpha(0.85);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p: Phaser.Input.Pointer) => { this.consumed.add(p.id); img.setTexture('ui/button-pressed'); c.setScale(0.95); this.press(dir); });
      const up = () => { img.setTexture('ui/button-normal'); c.setScale(1); };
      c.on('pointerup', up); c.on('pointerout', up);
      return c;
    };
    mk(BTN / 2 + 10, -1, '<');
    mk(this.W - BTN / 2 - 10, 1, '>');
  }

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.consumed.has(p.id)) this.swipeStartX.set(p.id, p.x); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.consumed.has(p.id)) return;
      const s = this.swipeStartX.get(p.id); if (s === undefined) return;
      if (Math.abs(p.x - s) < SWIPE_PX) return;
      const dir: Move = p.x > s ? 1 : -1;
      this.swipeStartX.set(p.id, p.x);
      // one lane per swipe: a longer drag in the same direction does not repeat, reversing the drag does
      if (this.swipeDir.get(p.id) !== dir) { this.swipeDir.set(p.id, dir); this.press(dir); }
    });
    const end = (p: Phaser.Input.Pointer) => { this.swipeStartX.delete(p.id); this.swipeDir.delete(p.id); this.consumed.delete(p.id); };
    this.input.on('pointerup', end); this.input.on('pointerupoutside', end);
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.press(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.press(1);
    };
    this.input.keyboard?.on('keydown', this.keyHandler);
  }

  private cleanup(): void {
    if (this.keyHandler) this.input.keyboard?.off('keydown', this.keyHandler);
    this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('pointerup'); this.input.off('pointerupoutside');
    this.tweens.killAll();
    this.vis.clear();
  }

  private press(dir: Move): void {
    if (!this.live || this.phase !== 'play') return;
    this.pendingMove = dir;
  }

  // ---- frame loop ----------------------------------------------------------------------------------------------
  update(_t: number, delta: number): void {
    if (!this.live) return; // paused / cutscene: nothing moves, the sim clock is frozen
    const dt = Math.min(delta, 50) / 1000;
    if (this.phase === 'ready') {
      this.readyT += dt;
      const n = Math.min(3, Math.floor(this.readyT / (READY_SEC / 4)));
      if (n !== this.lastCount) { this.lastCount = n; this.countBeat(n); }
      if (this.readyT >= READY_SEC) { this.phase = 'play'; }
    } else if (this.phase === 'play') {
      const mv = this.pendingMove; this.pendingMove = 0;
      const evs = this.sim.step({ move: mv }, dt);
      for (const e of evs) this.onEvent(e);
    } else if (this.exitAt && this.time.now >= this.exitAt) { this.exitAt = 0; this.send({ type: this.sim.result.status === 'won' ? 'RUNNER_WON' : 'RUNNER_LOST' }); return; }
    this.render(dt);
  }

  private countBeat(n: number): void {
    const label = ['3', '2', '1', 'GO!'][n];
    this.bigText.setText(label).setScale(1.6).setAlpha(1).setTint(n === 3 ? CYAN : 0xffffff);
    this.dc.audio.playSfx(n === 3 ? 'ui_confirm' : 'tick');
    this.tweens.add({ targets: this.bigText, scale: 1, duration: 220, ease: 'Back.Out' });
    if (n === 3) this.tweens.add({ targets: this.bigText, alpha: 0, delay: 350, duration: 300 });
  }

  private onEvent(e: SimEvent): void {
    const reduce = this.dc.settings.reduceMotion;
    switch (e.type) {
      case 'lane': {
        this.dc.audio.playSfx('lane_move');
        this.headGlow.setScale(0.5); this.tweens.add({ targets: this.headGlow, scale: 0.26, duration: 160 });
        this.burst.explode(4, this.headX, PLAYER_Y);
        break;
      }
      case 'hit': {
        this.dc.audio.playSfx('hit');
        const x = LANE_X[e.lane];
        const fx = this.add.sprite(x, PLAYER_Y - 10, 'vfx/impact_white').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7ad8).setScale(1.1).setDepth(45);
        fx.play('dcrun-impact'); fx.once('animationcomplete', () => fx.destroy());
        const big = this.add.sprite(x, PLAYER_Y, 'vfx/big_hit').setBlendMode(Phaser.BlendModes.ADD).setTint(MAGENTA).setScale(0.8).setDepth(44);
        big.play('dcrun-bighit'); big.once('animationcomplete', () => big.destroy());
        this.sparks.explode(14, x, PLAYER_Y);
        this.flash.setAlpha(reduce ? 0.18 : 0.38); this.flashT = reduce ? 0.18 : 0.26;
        if (!reduce) this.cameras.main.shake(140, 0.009);
        const i = MAX_HITS - e.hits;
        const pip = this.healthPips[i];
        if (pip) { pip.setTint(0x6b2150).setAlpha(0.55); this.tweens.add({ targets: pip, scale: { from: 4, to: 2.6 }, duration: 220 }); }
        const v = this.vis.get(hazKey(e.row, e.lane)); if (v) this.tweens.add({ targets: v.c, alpha: 0, duration: 120 });
        this.dc.audio.setBondStress(e.hits / MAX_HITS);
        break;
      }
      case 'anchor': {
        this.dc.audio.playSfx('anchor_pickup');
        const x = LANE_X[e.lane];
        const fx = this.add.sprite(x, PLAYER_Y - 6, 'vfx/star_explosion').setBlendMode(Phaser.BlendModes.ADD).setTint(0xcffffd).setScale(2.8).setDepth(45);
        fx.play('dcrun-star'); fx.once('animationcomplete', () => fx.destroy());
        this.burst.explode(22, x, PLAYER_Y);
        const pip = this.anchorPips[e.anchors - 1];
        if (pip) { pip.setAlpha(1).setTint(0xffffff); this.tweens.add({ targets: pip, scale: { from: 1.1, to: 0.62 }, duration: 320, ease: 'Back.Out' }); }
        const v = this.vis.get(e.row); if (v) this.tweens.add({ targets: v.c, alpha: 0, scale: 1.8, duration: 160 });
        this.floatText(x, PLAYER_Y - 70, `ANCHOR ${e.anchors}/${ANCHORS_TO_WIN}`, CYAN);
        if (!reduce) this.cameras.main.flash(90, 123, 224, 223, false);
        break;
      }
      case 'missed': {
        const v = this.vis.get(e.row); if (v) this.tweens.add({ targets: v.c, alpha: 0, duration: 250 });
        this.floatText(this.headX, PLAYER_Y - 70, 'ANCHOR MISSED - ANOTHER IS COMING', 0xe8a0b4);
        break;
      }
      case 'win': this.finish(true); break;
      case 'lose': this.finish(false); break;
    }
  }

  private floatText(x: number, y: number, s: string, tint: number): void {
    const t = this.txt(Math.max(190, Math.min(this.W - 190, x)), y, s, 16, 'Aurora16-Smooth', tint).setOrigin(0.5).setDepth(65);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 900, delay: 250, onComplete: () => t.destroy() });
  }

  private finish(won: boolean): void {
    if (this.ended) return;
    this.ended = true; this.phase = 'ended';
    const r = this.sim.result;
    this.bigText.setText(won ? 'THREAD STITCHED!' : 'THREAD SNAPPED').setScale(0.9).setAlpha(1).setTint(won ? CYAN : MAGENTA).setY(240);
    this.tweens.add({ targets: this.bigText, scale: 1.1, duration: 400, ease: 'Back.Out' });
    if (won) {
      this.dc.audio.playSfx('reunion_chime');
      for (let i = 0; i < 3; i++) this.time.delayedCall(i * 130, () => this.burst.explode(26, this.headX + (i - 1) * 60, PLAYER_Y - i * 40));
    } else {
      this.dc.audio.playSfx('thread_snap');
      const fx = this.add.sprite(this.headX, PLAYER_Y, 'vfx/explosion').setBlendMode(Phaser.BlendModes.ADD).setTint(MAGENTA).setScale(1.3).setDepth(45);
      fx.play('dcrun-explosion'); fx.once('animationcomplete', () => fx.destroy());
      this.head.setVisible(false); this.trailG.clear(); this.trail = [];
    }
    this.dc.session.runnerStats = { hits: r.hits, anchors: r.anchors, seed: this.sim.seed, won };
    this.exitAt = this.time.now + (won ? 1500 : 1100);
  }

  // ---- drawing -------------------------------------------------------------------------------------------------
  private render(dt: number): void {
    const st = this.sim.state;
    const speed = this.phase === 'ready' ? this.sim.tuning.v0 : st.speed;
    this.bgDist += speed * dt; this.trailDist += speed * dt;
    // parallax: tile position moves "down" as we advance
    for (const l of this.bg) l.ts.tilePositionY = -this.bgDist * l.k / (l.ts.tileScaleY || 1);
    for (const p of this.planets) { p.img.y = ((p.off + this.bgDist * p.k) % (this.H + 260)) - 130; p.img.x = p.x; }

    // head
    const target = LANE_X[st.lane];
    this.headX += (target - this.headX) * Math.min(1, dt * 24);
    if (Math.abs(target - this.headX) < 0.4) this.headX = target;
    this.head.x = this.headX; this.head.y = PLAYER_Y + Math.sin(this.time.now / 160) * 2;

    // trail (thin glowing cyan line behind the head)
    if (this.phase !== 'ended') {
      this.trail.push({ x: this.headX, d: this.trailDist });
      while (this.trail.length > 2 && this.trailDist - this.trail[0].d > 300) this.trail.shift();
    }
    const tg = this.trailG; tg.clear();
    const hurt = this.flashT > 0;
    const col = hurt ? 0xff7ad8 : CYAN;
    for (let j = this.trail.length - 1; j > 0; j--) {
      const a = this.trail[j], b = this.trail[j - 1];
      const fa = 1 - (this.trailDist - a.d) / 300;
      const ya = PLAYER_Y + (this.trailDist - a.d), yb = PLAYER_Y + (this.trailDist - b.d);
      tg.lineStyle(9 * Math.max(0.2, fa), col, 0.18 * Math.max(0, fa)); tg.lineBetween(a.x, ya, b.x, yb);
      tg.lineStyle(2.5, 0xe9ffff, 0.95 * Math.max(0, fa)); tg.lineBetween(a.x, ya, b.x, yb);
    }
    if (this.flashT > 0) { this.flashT -= dt; this.flash.setAlpha(Math.max(0, this.flashT) * 1.4); }

    // lane guides
    const g = this.guides; g.clear();
    for (let i = 0; i <= LANES; i++) {
      const x = LANE_X[1] - LANE_W * 1.5 + i * LANE_W;
      g.lineStyle(i === 0 || i === LANES ? 2 : 1, CYAN, i === 0 || i === LANES ? 0.5 : 0.22);
      g.lineBetween(x, 70, x, this.H);
    }
    g.lineStyle(2, CYAN, 0.55);
    const off = (this.bgDist * 0.9) % 60;
    for (let y = -60 + off; y < this.H; y += 60) { if (y > 72) for (const x of LANE_X) g.lineBetween(x, y, x, y + 12); }
    g.lineStyle(2, CYAN, 0.35); g.strokeRect(LANE_X[1] - LANE_W * 1.5, PLAYER_Y - 26, LANE_W * LANES, 52);

    this.updateRows(st.dist + speed * this.sim.subTick * DT);
    this.drawBar(st.progress);
    if (this.phase === 'play' && st.seconds > 4.2 && this.instr.alpha === 1) this.tweens.add({ targets: this.instr, alpha: 0, duration: 500 });
  }

  private updateRows(dist: number): void {
    const rows = this.sim.rows;
    const yOf = (i: number) => PLAYER_Y - (this.rowDist[i] - dist);
    while (this.spawnIdx < rows.length && yOf(this.spawnIdx) > -90) this.spawn(this.spawnIdx++);
    for (const [i, v] of this.vis) {
      const y = yOf(v.idx); v.c.y = y;
      if (y > this.H + 100) { this.dropVis(v); this.vis.delete(i); }
    }
  }

  /** Looping tweens keep running on destroyed targets, so kill them with the object. */
  private dropVis(v: RowVis): void {
    this.tweens.killTweensOf([v.c, ...(v.c.list as Phaser.GameObjects.GameObject[])]);
    v.c.destroy();
  }

  private spawn(i: number): void {
    const row = this.sim.rows[i];
    for (let l = 0; l < LANES; l++) {
      if (row.blocked & (1 << l)) { this.vis.set(hazKey(i, l), this.hazardVis(row, l, i)); }
    }
    if (row.anchorLane >= 0) this.vis.set(i, this.anchorVis(row, i));
  }

  private hazardVis(row: Row, lane: number, i: number): RowVis {
    const v = row.variant;
    const ring = this.add.sprite(0, 0, 'vfx/electric_ring').setBlendMode(Phaser.BlendModes.ADD).setTint(MAGENTA).setScale(0.92);
    ring.play({ key: 'dcrun-ring', startFrame: (v * 3) % 20 });
    const glow = this.add.image(0, 0, 'vfx/p_light_01').setBlendMode(Phaser.BlendModes.ADD).setTint(MAGENTA).setScale(0.42).setAlpha(0.7);
    const gf = this.frameOf('runner/GlassShards', 'g' + (v % 3), (v % 3) * 16, 0, 16, 16);
    const rf = this.frameOf('runner/RockShards', 'r' + (v % 8), (v % 8) * 16, 0, 16, 16);
    const parts: Phaser.GameObjects.GameObject[] = [glow, ring];
    const offs = [[-30, -18, -0.7], [26, -22, 0.5], [-8, 24, 2.4], [34, 20, -2.2]];
    offs.forEach(([ox, oy, rot], k) => {
      const s = this.add.image(ox, oy, k % 2 ? 'runner/GlassShards' : 'runner/RockShards', k % 2 ? gf : rf).setScale(4.5).setRotation(rot + v * 0.4).setTint(k % 2 ? 0xff5fc8 : MAGENTA);
      s.setBlendMode(Phaser.BlendModes.ADD);
      parts.push(s);
    });
    const c = this.add.container(LANE_X[lane], -200, parts).setDepth(15);
    this.tweens.add({ targets: c, angle: { from: -4, to: 4 }, duration: 260 + v * 20, yoyo: true, repeat: -1 });
    return { c, row, idx: i, kind: 'hazard', lane };
  }

  private anchorVis(row: Row, i: number): RowVis {
    const lane = row.anchorLane;
    const glow = this.add.image(0, 0, 'vfx/p_light_01').setBlendMode(Phaser.BlendModes.ADD).setTint(CYAN).setScale(0.38);
    const circle = this.add.sprite(0, 0, 'portals/tide_rune_circle').setScale(1.9).setBlendMode(Phaser.BlendModes.ADD);
    circle.play('dcrun-rune');
    const rf = RUNE_FRAMES[row.anchorIdx % RUNE_FRAMES.length];
    const rune = this.add.image(0, 0, 'runes/64x64_tide_runes_64x64_sheet', rf).setScale(1.1).setTint(0xdffffe);
    const dia = this.add.image(0, 0, 'runner/Diamond').setScale(3.2).setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
    const c = this.add.container(LANE_X[lane], -200, [glow, circle, dia, rune]).setDepth(16);
    this.tweens.add({ targets: [glow, dia], scale: '*=1.18', duration: 420, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: dia, angle: 360, duration: 3200, repeat: -1 });
    return { c, row, idx: i, kind: 'anchor', lane };
  }

  private drawBar(p: number): void {
    const x0 = 320, w = 320, y = 30, h = 14;
    const b = this.bar; b.clear();
    b.fillStyle(0x0b1630, 0.9); b.fillRect(x0, y, w, h);
    b.fillStyle(CYAN, 1); b.fillRect(x0 + 2, y + 2, Math.max(0, (w - 4) * p), h - 4);
    b.lineStyle(2, 0xcffffd, 1); b.strokeRect(x0, y, w, h);
    // anchor markers
    const goal = this.sim.goalTick; let n = 0;
    for (const r of this.sim.rows) {
      if (r.anchorLane < 0 || n >= ANCHORS_TO_WIN) continue; n++;
      const mx = x0 + 2 + (w - 4) * Math.min(1, r.tick / goal);
      b.fillStyle(0xffe2a8, 1); b.fillRect(mx - 2, y - 4, 4, h + 8);
    }
  }
}
