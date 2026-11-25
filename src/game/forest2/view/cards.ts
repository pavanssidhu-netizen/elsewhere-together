import Phaser from 'phaser';
import type { DCScene } from '../../base';
import { makeButton } from '../../ui/button';
import { boxText, noFit } from '../../ui/fit';
import type { Order } from '../api';
import { frameInner } from './frame';

const D = 30000;
export interface CardBtn { label: string; fn: () => void; primary?: boolean; w?: number }
export interface CardSpec {
  w?: number; h?: number; title: string; titleTint?: number; sub?: string; subTint?: number;
  rows?: [string, string, number?][]; body?: string[]; bodyTint?: number; icon?: { key: string; tint?: number; scale?: number; frame?: number };
  /** a quoted line (the Time Master) shown under the body */
  quote?: string;
  buttons: CardBtn[]; autoMs?: number;
}

/**
 * Modal cards (stage intro, order chooser, cleared / failed, final medal). One at a time; keyboard: Enter/Space/Z = primary, 1/2/arrows for the chooser.
 * All text is fitted (boxText) inside the parchment of ui/panel-frame (see frameInner). `ui` wraps creation so the scene keeps cards off the greyed world camera.
 */
export class Cards {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private timer?: Phaser.Time.TimerEvent;
  constructor(private sc: DCScene, private ui: <T>(fn: () => T) => T = fn => fn()) {}
  get open(): boolean { return this.objs.length > 0; }

  hide(): void {
    this.timer?.remove(); this.timer = undefined;
    for (const o of this.objs) { this.sc.tweens.killTweensOf(o); o.destroy(); }
    this.objs = []; this.onKey = null;
  }
  /** returns true if the key was consumed by an open card */
  key(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    this.onKey?.(e); return true;
  }

  /** parchment is light: darken any accent tint so text reads as ink */
  private ink(c: number, k = 0.5): number { return (((c >> 16 & 255) * k) << 16) | (((c >> 8 & 255) * k) << 8) | ((c & 255) * k); }

  private add<T extends Phaser.GameObjects.GameObject>(o: T, d = 0): T { (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(D + d); this.objs.push(o); return o; }
  private dim(): void {
    const r = this.add(this.sc.add.rectangle(480, 270, 960, 540, 0x05060d, 0.62)).setInteractive();
    r.on('pointerdown', () => { /* swallow clicks behind the card */ });
  }

  card(s: CardSpec): void {
    this.hide();
    this.ui(() => {
      this.dim();
      const sc = this.sc, w = s.w ?? 560, h = s.h ?? 330, top = 270 - h / 2;
      this.add(sc.add.image(480, 270, 'ui/panel-frame').setDisplaySize(w, h), 1);
      const inner = frameInner(480, 270, w, h), bottom = inner.y + inner.h;
      // title sits on the wooden header above the parchment
      this.add(boxText(sc, 'Pepper16-Bold', s.title, { x: inner.x - w * 0.02, y: top + h * 0.025, w: inner.w + w * 0.04, h: h * 0.17 }, { max: 32, min: 16, align: 'center', valign: 'middle', tint: s.titleTint ?? 0xfff1c9 }, 'card-title'), 2);
      let y = inner.y;
      if (s.sub) {
        const t = this.add(boxText(sc, 'Aurora16-Smooth', s.sub, { x: inner.x, y, w: inner.w, h: Math.min(44, inner.h * 0.28) }, { max: 16, min: 11, align: 'center', tint: this.ink(s.subTint ?? 0xbcd8d8, 0.42) }, 'card-sub'), 2);
        y += t.getBounds().height + 8;
      }
      if (s.icon) { this.add(sc.add.image(480, y + 24, s.icon.key).setTint(s.icon.tint ?? 0xffffff).setScale(s.icon.scale ?? 1), 2); y += 56; }
      const lw = inner.w * 0.62;
      for (const [l, v, tint] of s.rows ?? []) {
        this.add(boxText(sc, 'Aurora16-Smooth', l, { x: inner.x, y, w: lw - 6, h: 20 }, { max: 16, min: 10, tint: 0x3a2410 }, 'card-row'), 2);
        this.add(boxText(sc, 'Aurora16-Smooth', v, { x: inner.x + lw, y, w: inner.w - lw, h: 20 }, { max: 16, min: 10, align: 'right', tint: this.ink(tint ?? 0x6a4a20, tint ? 0.62 : 1) }, 'card-value'), 2);
        y += 22;
      }
      const quoteH = s.quote ? Math.min(52, Math.max(24, bottom - y - 40)) : 0;
      if (s.body?.length) {
        y += 4;
        const t = this.add(boxText(sc, 'Aurora16-Smooth', s.body.join('\n'), { x: inner.x, y, w: inner.w, h: Math.max(16, bottom - y - (quoteH ? quoteH + 6 : 0)) }, { max: 16, min: 10, align: 'center', tint: this.ink(s.bodyTint ?? 0x6a4a20, s.bodyTint ? 0.55 : 1) }, 'card-body'), 2);
        y += t.getBounds().height + 4;
      }
      if (s.quote) this.add(boxText(sc, 'Aurora16-Smooth', s.quote, { x: inner.x, y: y + 2, w: inner.w, h: Math.max(18, bottom - y - 2) }, { max: 16, min: 10, align: 'center', tint: 0x7a1c1c }, 'card-quote'), 2);
      const n = s.buttons.length, bw = 210, by = top + h - h * 0.09 - 2;
      s.buttons.forEach((b, i) => {
        const x = 480 + (i - (n - 1) / 2) * (bw + 14);
        this.add(makeButton(sc, x, by, b.label, () => this.fire(b), { w: b.w ?? bw, size: 16 }), 3);
      });
      const prim = s.buttons.find(b => b.primary) ?? s.buttons[0];
      this.onKey = (e) => { if (['Enter', 'Space', 'KeyZ'].includes(e.code) && prim) this.fire(prim); };
      if (s.autoMs && prim) this.arm(s.autoMs, prim);
    });
  }

  /** auto-dismiss that waits while the game is paused */
  private arm(ms: number, b: CardBtn): void {
    this.timer = this.sc.time.delayedCall(ms, () => { if (this.sc.live) this.fire(b); else this.arm(300, b); });
  }
  private fire(b: CardBtn): void { this.hide(); b.fn(); }

  /** ORDER chooser: two big buttons with the two mushrooms; `pick` is pre-highlighted. */
  chooser(pick: Order, retry: boolean, onPick: (o: Order) => void): void {
    this.hide();
    this.ui(() => {
      this.dim();
      const sc = this.sc, w = 860, h = 440, top = 270 - h / 2;
      this.add(sc.add.image(480, 270, 'ui/panel-frame').setDisplaySize(w, h), 1);
      const inner = frameInner(480, 270, w, h);
      this.add(boxText(sc, 'Pepper16-Bold', 'CHOOSE YOUR ORDER', { x: inner.x - w * 0.02, y: top + h * 0.025, w: inner.w + w * 0.04, h: h * 0.17 }, { max: 32, min: 16, align: 'center', valign: 'middle', tint: 0xfff1c9 }, 'chooser-title'), 2);
      this.add(boxText(sc, 'Aurora16-Smooth', retry ? 'Same room. Who goes first?' : 'Who goes first? The other is a ghost.', { x: inner.x, y: inner.y + 2, w: inner.w, h: 22 }, { max: 16, min: 11, align: 'center', tint: 0x3a2410 }, 'chooser-sub'), 2);
      let sel: Order = pick;
      const colW = 292, hy = inner.y + 28, hh = inner.h - 30;
      const opts: { order: Order; col: 'blue' | 'red'; name: string; tag: string; desc: string[]; x: number }[] = [
        { order: 'PAST_FIRST', col: 'blue', name: 'BEGIN AS SAM', tag: 'THE PAST (Builder)', desc: ['Foresight puzzle.', 'Build the world blind;', 'bigger base score.'], x: 480 - 150 },
        { order: 'FUTURE_FIRST', col: 'red', name: 'BEGIN AS JENSEN', tag: 'THE FUTURE (Scout)', desc: ['Survey the ruins,', 'pin the fixes, then', 'Sam builds them.'], x: 480 + 150 },
      ];
      const hl = this.add(sc.add.graphics(), 1);
      const draw = (): void => {
        hl.clear();
        const o = opts.find(q => q.order === sel)!;
        hl.lineStyle(3, 0xb87800, 1).strokeRoundedRect(o.x - colW / 2, hy, colW, hh, 10);
        hl.fillStyle(0xffd060, 0.16).fillRoundedRect(o.x - colW / 2, hy, colW, hh, 10);
      };
      for (const o of opts) {
        const sp = this.add(sc.add.sprite(o.x, hy + 86, 'myconid/' + o.col, 1 * 40).setScale(1.8).setOrigin(0.5, 42 / 64), 3);
        sp.play(`f2-${o.col}-idle-1`);
        this.add(boxText(sc, 'Aurora16-Smooth', o.tag, { x: o.x - colW / 2 + 6, y: hy + 98, w: colW - 12, h: 20 }, { max: 16, min: 10, align: 'center', tint: o.col === 'blue' ? 0x1f4fb0 : 0xb02020 }, 'chooser-tag'), 3);
        this.add(boxText(sc, 'Aurora16-Smooth', o.desc.join('\n'), { x: o.x - colW / 2 + 6, y: hy + 122, w: colW - 12, h: hh - 128 }, { max: 14, min: 10, align: 'center', tint: 0x3a2410 }, 'chooser-desc'), 3);
        this.add(makeButton(sc, o.x, top + h - h * 0.09 - 2, o.name, () => this.fire({ label: '', fn: () => onPick(o.order) }), { w: 262, size: 16 }), 4);
      }
      const pickOpt = opts.find(q => q.order === pick)!;
      this.add(noFit(sc.txt(pickOpt.x, hy + 6, 'YOUR PICK', 16, 'Pepper16-Bold', 0x9a5a00).setOrigin(0.5, 0)), 3);
      draw();
      this.onKey = (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Digit1') { sel = 'PAST_FIRST'; draw(); }
        else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Digit2') { sel = 'FUTURE_FIRST'; draw(); }
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') this.fire({ label: '', fn: () => onPick(sel) });
      };
    });
  }
}
