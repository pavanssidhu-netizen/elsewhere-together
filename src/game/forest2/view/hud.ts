import Phaser from 'phaser';
import type { DCScene } from '../../base';
import { makeButton } from '../../ui/button';
import { boxText, noFit } from '../../ui/fit';
import { setFit } from './frame';
import type { Dir, StageView } from '../api';

export interface HudHandlers {
  move(d: Dir): void; a(): void; b(): void; peek(on: boolean): void; endLoop(): void; reset(): void;
}
export interface HudInfo { charges: number; maxCharges: number; total: number; roomLabel: string; phaseText: string; showTouch: boolean }

const D = 20000;
const BEAT_BOX = { x: 16, y: 12, w: 216, h: 18 }, TETHER_BOX = { x: 16, y: 49, w: 66, h: 18 };
const BANNER_BOX = { x: 270, y: 3, w: 420, h: 22 }, SUB_BOX = { x: 270, y: 30, w: 420, h: 16 };
const SCORE_BOX = { x: 800, y: 68, w: 144, h: 18 }, MULT_BOX = { x: 800, y: 88, w: 144, h: 18 };
const slotBox = (i: number): { x: number; y: number; w: number; h: number } => ({ x: 480 + (i - 1) * 184 - 56, y: 502, w: 140, h: 20 });
const AMBER = 0xffc850, CYAN = 0x7be0df, CRIMSON = 0xe0304a, GREEN = 0x62e07a;
const lerpC = (a: number, b: number, t: number): number => Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(a), Phaser.Display.Color.IntegerToColor(b), 100, Math.round(t * 100)) as unknown as number;
const col2 = (a: number, b: number, t: number): number => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(a), Phaser.Display.Color.IntegerToColor(b), 100, Math.round(t * 100)); return Phaser.Display.Color.GetColor(c.r, c.g, c.b); };
void lerpC;

export class Hud {
  readonly root: Phaser.GameObjects.GameObject[] = [];
  private beatTxt!: Phaser.GameObjects.BitmapText;
  private bars!: Phaser.GameObjects.Graphics;
  private tetherTxt!: Phaser.GameObjects.BitmapText;
  private banner!: Phaser.GameObjects.BitmapText;
  private bannerSub!: Phaser.GameObjects.BitmapText;
  private score!: Phaser.GameObjects.BitmapText;
  private mult!: Phaser.GameObjects.BitmapText;
  private slotTxt: Phaser.GameObjects.BitmapText[] = [];
  private slotBg: Phaser.GameObjects.Graphics[] = [];
  private touchLbl: Phaser.GameObjects.BitmapText[] = [];
  private pips: Phaser.GameObjects.Image[] = [];
  private btns: Phaser.GameObjects.Container[] = [];
  private touchObjs: Phaser.GameObjects.GameObject[] = [];
  private lastBeats = -1;
  private visible = true;

  constructor(private scene: DCScene, private h: HudHandlers, private touch: boolean) {
    const sc = scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(D); this.root.push(o); return o; };
    // top-left: beats + tether gauge
    add(sc.add.rectangle(8, 8, 232, 72, 0x0b0d18, 0.62).setOrigin(0));
    this.beatTxt = add(boxText(sc, 'Aurora16-Smooth', '0 / 20 BEATS', BEAT_BOX, { max: 16, min: 10, tint: 0xfff1c9 }, 'hud-beats'));
    this.bars = add(sc.add.graphics());
    this.tetherTxt = add(boxText(sc, 'Aurora16-Smooth', 'TETHER', TETHER_BOX, { max: 16, min: 9, tint: 0xcfe8d0 }, 'hud-tether'));
    // banner (top centre)
    add(sc.add.rectangle(480, 14, 440, 26, 0x0b0d18, 0.62));
    this.banner = add(boxText(sc, 'Pepper16-Bold', ' ', BANNER_BOX, { max: 16, min: 9, align: 'center', valign: 'middle', tint: 0xfff1c9 }, 'hud-banner'));
    this.bannerSub = add(boxText(sc, 'Aurora16-Smooth', ' ', SUB_BOX, { max: 16, min: 9, align: 'center', valign: 'middle', tint: 0xbcd8d8 }, 'hud-sub'));
    // top-right (below the DOM skip/mute/pause buttons)
    add(sc.add.rectangle(952, 64, 160, 44, 0x0b0d18, 0.62).setOrigin(1, 0));
    this.score = add(boxText(sc, 'Aurora16-Smooth', 'SCORE 0', SCORE_BOX, { max: 16, min: 9, align: 'right', tint: 0xfff1c9 }, 'hud-score'));
    this.mult = add(boxText(sc, 'Aurora16-Smooth', 'x1', MULT_BOX, { max: 16, min: 9, align: 'right', tint: AMBER }, 'hud-mult'));
    // contextual action icons (bottom centre): the keys are Z, X and C (hold)
    const slots: { k: string; fn: () => void }[] = [{ k: 'Z', fn: () => h.a() }, { k: 'X', fn: () => h.b() }, { k: 'C', fn: () => { /* hold only */ } }];
    slots.forEach((s, i) => {
      const x = 480 + (i - 1) * 184, y = 512;
      const g = add(sc.add.graphics()); this.slotBg.push(g); g.setPosition(x, y);
      this.slotTxt.push(add(boxText(sc, 'Aurora16-Smooth', '-', slotBox(i), { max: 16, min: 9, align: 'center', valign: 'middle', tint: 0xfff1c9 }, 'hud-slot')));
      add(noFit(sc.txt(x - 74, y, s.k, 16, 'Pepper16-Bold', AMBER).setOrigin(0.5)));
      if (i < 2) {
        const z = add(sc.add.zone(x, y, 176, 40).setInteractive({ useHandCursor: true })); z.on('pointerdown', s.fn);
      }
    });
    this.drawSlots(['', '', 'PEEK'], false);
    // charges (Thread)
    add(noFit(sc.txt(480 - 66, 478, 'THREAD', 16, 'Aurora16-Smooth', 0xbcd8d8).setOrigin(0.5)));
    for (let i = 0; i < 5; i++) this.pips.push(add(sc.add.image(480 - 14 + i * 20, 478, 'vfx/p_star_01').setScale(0.05).setBlendMode(Phaser.BlendModes.ADD).setTint(CYAN)));
    // small buttons
    const bw = touch ? 124 : 104;
    this.btns.push(add(makeButton(sc, 952 - bw / 2 - 4, 132, 'END LOOP', () => h.endLoop(), { w: bw + 16, size: 14 })));
    this.btns.push(add(makeButton(sc, 952 - bw / 2 - 4, 176, 'RESET', () => h.reset(), { w: bw + 16, size: 14 })));
    if (touch) this.buildTouch();
  }

  private drawSlots(labels: string[], peeking: boolean): void {
    this.slotBg.forEach((g, i) => {
      const on = labels[i] !== '';
      g.clear().fillStyle(0x0b0d18, 0.72).fillRoundedRect(-88, -20, 176, 40, 8)
        .lineStyle(2, i === 2 && peeking ? CYAN : on ? AMBER : 0x555566, on || peeking ? 1 : 0.5).strokeRoundedRect(-88, -20, 176, 40, 8);
      setFit(this.slotTxt[i], labels[i] || '-', slotBox(i), { max: 16, min: 9, align: 'center', valign: 'middle' }, 'hud-slot'); this.slotTxt[i].setAlpha(on ? 1 : 0.4);
    });
  }

  private buildTouch(): void {
    const sc = this.scene;
    const s = Math.max(0.2, sc.scale.displaySize.width / 960);
    const B = Phaser.Math.Clamp(Math.round(46 / s), 58, 76), gap = 6;
    const mk = (x: number, y: number, label: string, size: number, down: () => void, up?: () => void): Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText => {
      const g = sc.add.graphics().setDepth(D).setPosition(x, y).setAlpha(0.88);
      g.fillStyle(0x0b0d18, 0.72).fillRoundedRect(-B / 2, -B / 2, B, B, 12).lineStyle(2, AMBER, 1).strokeRoundedRect(-B / 2, -B / 2, B, B, 12);
      const tx = noFit(sc.txt(x, y, label, size, 'Pepper16-Bold', 0xfff1c9).setOrigin(0.5).setDepth(D + 1));
      const z = sc.add.zone(x, y, B, B).setInteractive().setDepth(D + 2);
      z.on('pointerdown', down);
      if (up) { z.on('pointerup', up); z.on('pointerout', up); }
      this.touchObjs.push(g, tx, z); return tx;
    };
    const cx = 16 + B * 1.5 + gap, cy = 540 - 16 - B * 1.5 - gap;
    const step = B + gap;
    mk(cx, cy - step, '^', 24, () => this.h.move('N'));
    mk(cx, cy + step, 'v', 24, () => this.h.move('S'));
    mk(cx - step, cy, '<', 24, () => this.h.move('W'));
    mk(cx + step, cy, '>', 24, () => this.h.move('E'));
    const rx = 960 - 16 - B * 1.5 - gap;
    this.touchLbl.push(mk(rx + step, cy - step * 0.6, 'Z', 20, () => this.h.a()) as Phaser.GameObjects.BitmapText);
    this.touchLbl.push(mk(rx, cy + step * 0.1, 'X', 20, () => this.h.b()) as Phaser.GameObjects.BitmapText);
    this.touchLbl.push(mk(rx - step + 0 + step * 0.0, cy - step * 1.35, 'C', 20, () => this.h.peek(true), () => this.h.peek(false)) as Phaser.GameObjects.BitmapText);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const o of [...this.root, ...this.touchObjs]) (o as unknown as { setVisible(b: boolean): void }).setVisible(v);
  }

  update(v: StageView, info: HudInfo, peeking: boolean): void {
    if (!this.visible) return;
    const left = v.budget - v.beat;
    setFit(this.beatTxt, `${v.beat} / ${v.budget} BEATS`, BEAT_BOX, { max: 16, min: 10 }, 'hud-beats'); this.beatTxt.setTint(left <= 2 ? 0xff8a7a : left <= 5 ? 0xffd070 : 0xfff1c9);
    const g = this.bars.clear();
    g.fillStyle(0x222233, 1).fillRect(16, 34, 216, 8);
    g.fillStyle(left <= 5 ? CRIMSON : AMBER, 1).fillRect(16, 34, Math.round(216 * Math.min(1, v.beat / Math.max(1, v.budget))), 8);
    g.fillStyle(0x222233, 1).fillRect(88, 58, 144, 8);
    const th = v.tether;
    if (th) {
      const f = Math.min(1, th.dist / 8), c = th.strained ? CRIMSON : col2(GREEN, 0xffd070, Math.min(1, th.dist / 4));
      g.fillStyle(c, 1).fillRect(80, 58, Math.round(152 * f), 8);
      g.fillStyle(0xffffff, 0.9).fillRect(88 + Math.round(144 * 0.5) - 1, 55, 2, 14);   // strain threshold (distance 4)
      setFit(this.tetherTxt, th.strained ? 'STRAINED' : 'TETHER ' + th.dist, TETHER_BOX, { max: 16, min: 9 }, 'hud-tether'); this.tetherTxt.setTint(th.strained ? 0xff7a8a : 0xcfe8d0);
    } else { setFit(this.tetherTxt, 'NO TWIN', TETHER_BOX, { max: 16, min: 9 }, 'hud-tether'); this.tetherTxt.setTint(0x8a96a0); }
    setFit(this.banner, info.phaseText, BANNER_BOX, { max: 16, min: 9, align: 'center', valign: 'middle' }, 'hud-banner');
    setFit(this.bannerSub, info.roomLabel, SUB_BOX, { max: 16, min: 9, align: 'center', valign: 'middle' }, 'hud-sub');
    setFit(this.score, 'SCORE ' + info.total, SCORE_BOX, { max: 16, min: 9, align: 'right' }, 'hud-score');
    setFit(this.mult, 'x' + v.score.multiplier, MULT_BOX, { max: 16, min: 9, align: 'right' }, 'hud-mult'); this.mult.setTint(v.score.multiplier > 1 ? 0xfff2a0 : AMBER);
    this.pips.forEach((p, i) => { p.setVisible(this.visible && i < info.maxCharges).setAlpha(i < info.charges ? 1 : 0.18).setScale(i < info.charges ? 0.06 : 0.04); });
    const labels = [v.hints.a, v.hints.b, 'PEEK'];
    this.drawSlots(labels, peeking);
    this.lastBeats = v.beat;
  }
}
