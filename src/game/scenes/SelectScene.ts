import Phaser from 'phaser';
import { DCScene } from '../base';
import type { Character } from '../../flow/flow';
import { boxText } from '../ui/fit';
import { CYAN, PINK, ADD, crispFonts, myc, setMyc, flipAnim, buildForest, tintAll, type Forest } from '../cutscene/kit';

interface Side { who: Character; color: 'red' | 'blue'; title: string; sub: string; perk: string; x0: number; tint: number; glow: number }
const SIDES: Side[] = [
  { who: 'JENSEN', color: 'red', title: 'JENSEN', sub: 'THE FUTURE', x0: 0, tint: 0x9fc0ff, glow: CYAN,
    perk: 'The Scout. Survey the ruins, pin the fixes, then speed-run.' },
  { who: 'SAM', color: 'blue', title: 'SAM', sub: 'THE PAST', x0: 490, tint: 0xf0c890, glow: 0xffb24a,
    perk: 'The Builder. Grow bridges, then coat them in sap.' },
];

/** CHARACTER_SELECT: the two realities after the split, one brother in each. */
export class SelectScene extends DCScene {
  constructor() { super('SelectScene'); }
  private sel = -1; private done = false;
  private items: Array<{ f: Forest; spr: Phaser.GameObjects.Sprite; hl: Phaser.GameObjects.Rectangle; plate: Phaser.GameObjects.Image; texts: Phaser.GameObjects.BitmapText[]; ring: Phaser.GameObjects.Image }> = [];

  create(): void {
    crispFonts(this);
    this.sel = -1; this.done = false; this.items = [];
    const { W, H } = this;
    this.cameras.main.setBackgroundColor(0x03040a); this.fadeIn(500);
    // music keeps whatever the intro started (the forest track); playMusic with the same id would be a no-op anyway
    this.add.tileSprite(0, 0, W, H, 'space/starfield_white_mid').setOrigin(0).setTileScale(1.6).setAlpha(0.8).setBlendMode(ADD);

    SIDES.forEach((s, i) => {
      const w = 470;
      const f = buildForest(this, s.x0 === 0 ? 0 : 490, s.x0 === 0 ? 470 : 960);   // real layout slice, shifted below
      f.c.x = s.x0; tintAll(f, s.tint);
      // a neon sheen for the future, warm dust for the past
      this.add.rectangle(s.x0, 0, w, H, s.glow, 0.0).setOrigin(0).setBlendMode(ADD);
      const cx = s.x0 + w / 2;
      const spr = myc(this, s.color, cx, 345, 4, 'S');
      this.tweens.add({ targets: spr, y: '-=3', yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
      const ring = this.add.image(cx, 350, 'vfx/p_circle_05').setScale(0.9, 0.3).setTint(s.glow).setBlendMode(ADD).setAlpha(0.0).setDepth(2);
      const hl = this.add.rectangle(s.x0, 0, w, H, 0xffffff, 0).setOrigin(0).setBlendMode(ADD).setDepth(3);
      const sub = boxText(this, 'Pepper16-Bold', s.sub, { x: s.x0 + 20, y: 44, w: w - 40, h: 34 }, { max: 32, min: 16, align: 'center', tint: s.glow, depth: 5 }, 'select-sub');
      // name plate: texts live INSIDE the cream parchment (8% from the sides, 22-78% vertically)
      const img = this.add.image(cx, 418, 'ui/dialog-box'); const k = 440 / img.width; img.setScale(k).setDepth(6);
      const ph = img.height * k, pl = cx - 220, pt = 418 - ph / 2;
      const inner = { x: cx - 0.33 * 440, w: 0.66 * 440, y: pt + 0.22 * ph, h: 0.56 * ph };
      const nm = boxText(this, 'Pepper16-Bold', s.title, { x: inner.x, y: inner.y, w: inner.w, h: 24 }, { max: 22, min: 14, tint: 0x4a1c0c, depth: 7 }, 'select-name');
      const body = boxText(this, 'Aurora16-Smooth', s.perk, { x: inner.x, y: inner.y + 28, w: inner.w, h: inner.h - 28 }, { max: 15, min: 10, tint: 0x2a1608, depth: 7 }, 'select-perk');
      const plate = img;
      const zone = this.add.zone(s.x0, 0, w, H).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(10);
      zone.on('pointerover', () => this.focus(i));
      zone.on('pointerdown', () => this.focus(i));
      zone.on('pointerup', () => this.choose(i));
      this.items.push({ f, spr, hl, plate, ring, texts: [sub, nm, body] });
    });

    // the pink tear, still shimmering between them
    const mid = W / 2;
    this.add.rectangle(mid, H / 2, 20, H, 0x05060d).setDepth(7);
    this.add.image(mid, H / 2, 'vfx/p_light_01').setScale(0.2, 1.5).setTint(PINK).setBlendMode(ADD).setAlpha(0.85).setDepth(8);
    this.add.rectangle(mid, H / 2, 3, H, 0xffe8f0).setBlendMode(ADD).setAlpha(0.9).setDepth(9);
    const rm = this.dc.settings.reduceMotion;
    for (const y of [110, 270, 430]) this.add.sprite(mid, y, 'vfx/lightstreaks').setRotation(Math.PI / 2).setScale(1.0).setTint(PINK).setBlendMode(ADD).setAlpha(rm ? 0.25 : 0.5).setDepth(9).play(flipAnim(this, 'vfx/lightstreaks', rm ? 5 : 12, true));
    this.add.particles(mid, H / 2, 'vfx/p_spark_03', { x: { min: -5, max: 5 }, y: { min: -250, max: 250 }, speedX: { min: -40, max: 40 }, speedY: { min: -20, max: 20 }, lifespan: 1500, scale: { start: 0.1, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: PINK, blendMode: 'ADD', frequency: rm ? 200 : 80 }).setDepth(9);

    // header / footer
    const head = this.add.rectangle(mid, 20, W, 40, 0x03040a, 0.0).setDepth(4); void head;
    boxText(this, 'Pepper16-Bold', 'CHOOSE YOUR BROTHER', { x: 200, y: 10, w: 560, h: 22 }, { max: 20, min: 12, align: 'center', tint: 0xfff1c9, depth: 11 }, 'select-head');
    this.add.rectangle(mid, 516, W, 48, 0x03040a, 0.78).setDepth(11);
    boxText(this, 'Aurora16-Smooth', 'The one you do not pick replays as a ghost.', { x: 16, y: 494, w: 600, h: 20 }, { max: 16, min: 10, tint: 0xfff1c9, depth: 12 }, 'select-foot');
    boxText(this, 'Aurora16-Smooth', '<  >  choose      ENTER  confirm', { x: 16, y: 516, w: 600, h: 18 }, { max: 14, min: 10, tint: 0x9fb0b0, depth: 12 }, 'select-hint');
    boxText(this, 'Aurora16-Smooth', 'RELAXED MODE: ' + (this.dc.settings.relaxed ? 'ON' : 'OFF'), { x: 640, y: 504, w: 304, h: 20 }, { max: 16, min: 10, align: 'right', tint: this.dc.settings.relaxed ? 0x9ff0a0 : 0x9fb0b0, depth: 12 }, 'select-relaxed');

    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.focus(0)); kb?.on('keydown-A', () => this.focus(0));
    kb?.on('keydown-RIGHT', () => this.focus(1)); kb?.on('keydown-D', () => this.focus(1));
    kb?.on('keydown-ENTER', () => this.sel >= 0 && this.choose(this.sel)); kb?.on('keydown-SPACE', () => this.sel >= 0 && this.choose(this.sel));
    this.events.once('shutdown', () => { kb?.removeAllListeners(); });
    this.focus(-1);
  }

  private focus(i: number): void {
    if (this.done) return;
    if (i !== this.sel && i >= 0) this.dc.audio.playSfx('ui_click');
    this.sel = i;
    this.items.forEach((it, n) => {
      const on = n === i;
      this.tweens.add({ targets: it.hl, fillAlpha: on ? 0.1 : 0, duration: 150 });
      this.tweens.add({ targets: it.ring, alpha: on ? 0.9 : 0.15, duration: 150 });
      for (const t of it.texts) t.setAlpha(i < 0 || on ? 1 : 0.7);
      it.spr.setScale(on ? 5 : 4);
      it.plate.setAlpha(i < 0 || on ? 1 : 0.7);
    });
  }
  private choose(i: number): void {
    if (this.done) return; this.done = true;
    const s = SIDES[i]; this.dc.audio.playSfx('ui_confirm');
    setMyc(this.items[i].spr, this, s.color, 'attack', 'S');
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(450, () => this.send({ type: 'SELECT', character: s.who }));
  }
}
