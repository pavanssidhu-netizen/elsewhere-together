import Phaser from 'phaser';
import type { DCScene } from '../../base';
import { makeButton } from '../../ui/button';
import type { Order } from '../api';

const D = 30000;
export interface CardBtn { label: string; fn: () => void; primary?: boolean; w?: number }
export interface CardSpec {
  w?: number; h?: number; title: string; titleTint?: number; sub?: string; subTint?: number;
  rows?: [string, string, number?][]; body?: string[]; bodyTint?: number; icon?: { key: string; tint?: number; scale?: number; frame?: number };
  buttons: CardBtn[]; autoMs?: number;
}

/** Modal cards (stage intro, order chooser, cleared / failed, final medal). One at a time; keyboard: Enter/Space = primary, 1/2/arrows for the chooser. */
export class Cards {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private timer?: Phaser.Time.TimerEvent;
  constructor(private sc: DCScene) {}
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
  private frame(w: number, h: number): void {
    this.add(this.sc.add.image(480, 270, 'ui/panel-frame').setDisplaySize(w, h), 1);
  }

  card(s: CardSpec): void {
    this.hide(); this.dim();
    const sc = this.sc, w = s.w ?? 560, h = s.h ?? 330, top = 270 - h / 2;
    this.frame(w, h);
    this.add(sc.txt(480, top + 40, s.title, 16 * 2, 'Pepper16-Bold', s.titleTint ?? 0xfff1c9).setOrigin(0.5), 2);
    let y = top + 78;
    if (s.sub) { const t = this.add(sc.txt(480, y, s.sub, 16, 'Aurora16-Smooth', this.ink(s.subTint ?? 0xbcd8d8, 0.42)).setOrigin(0.5, 0).setMaxWidth(w - 90).setCenterAlign(), 2); y += t.height + 12; }
    if (s.icon) { this.add(sc.add.image(480, y + 24, s.icon.key).setTint(s.icon.tint ?? 0xffffff).setScale(s.icon.scale ?? 1), 2); y += 56; }
    for (const [l, v, tint] of s.rows ?? []) {
      this.add(sc.txt(480 - w / 2 + 56, y, l, 16, 'Aurora16-Smooth', 0x3a2410), 2);
      this.add(sc.txt(480 + w / 2 - 56, y, v, 16, 'Aurora16-Smooth', this.ink(tint ?? 0x6a4a20, tint ? 0.62 : 1)).setOrigin(1, 0), 2); y += 22;
    }
    if (s.body?.length) {
      y += 6;
      const t = this.add(sc.txt(480, y, s.body.join('\n'), 16, 'Aurora16-Smooth', this.ink(s.bodyTint ?? 0x6a4a20, s.bodyTint ? 0.55 : 1)).setOrigin(0.5, 0).setMaxWidth(w - 96).setCenterAlign(), 2);
      y += t.height + 8;
    }
    const n = s.buttons.length, bw = 210, by = top + h - 36;
    s.buttons.forEach((b, i) => {
      const x = 480 + (i - (n - 1) / 2) * (bw + 14);
      this.add(makeButton(sc, x, by, b.label, () => this.fire(b), { w: b.w ?? bw, size: 16 }), 3);
    });
    const prim = s.buttons.find(b => b.primary) ?? s.buttons[0];
    this.onKey = (e) => { if (['Enter', 'Space', 'KeyZ'].includes(e.code) && prim) this.fire(prim); };
    if (s.autoMs && prim) this.timer = sc.time.delayedCall(s.autoMs, () => this.fire(prim));
  }

  private fire(b: CardBtn): void { this.hide(); b.fn(); }

  /** ORDER chooser: two big buttons with the two mushrooms; `pick` is pre-highlighted. */
  chooser(pick: Order, retry: boolean, onPick: (o: Order) => void): void {
    this.hide(); this.dim();
    const sc = this.sc, w = 860, h = 400, top = 270 - h / 2;
    this.add(sc.add.image(480, 270, 'ui/panel-frame').setDisplaySize(w, h), 1);
    this.add(sc.txt(480, top + 36, 'CHOOSE YOUR ORDER', 32, 'Pepper16-Bold', 0xfff1c9).setOrigin(0.5), 2);
    this.add(sc.txt(480, top + 80, retry ? 'Same room. Who goes first?' : 'Who goes first? The other is a ghost.', 16, 'Aurora16-Smooth', 0x3a2410).setOrigin(0.5), 2);
    let sel: Order = pick;
    const opts: { order: Order; col: 'blue' | 'red'; name: string; tag: string; desc: string[]; x: number }[] = [
      { order: 'PAST_FIRST', col: 'blue', name: 'BEGIN AS SAM', tag: 'THE PAST (Builder)', desc: ['Foresight puzzle.', 'Build the world blind;', 'bigger base score.'], x: 480 - 150 },
      { order: 'FUTURE_FIRST', col: 'red', name: 'BEGIN AS JENSEN', tag: 'THE FUTURE (Scout)', desc: ['Survey the ruins,', 'pin the fixes, then', 'Sam builds them.'], x: 480 + 150 },
    ];
    const hl = this.add(sc.add.graphics(), 1);
    const draw = (): void => {
      hl.clear();
      const o = opts.find(q => q.order === sel)!;
      hl.lineStyle(3, 0xb87800, 1).strokeRoundedRect(o.x - 146, top + 104, 292, 262, 10);
      hl.fillStyle(0xffd060, 0.16).fillRoundedRect(o.x - 146, top + 104, 292, 262, 10);
    };
    for (const o of opts) {
      const sp = this.add(sc.add.sprite(o.x, top + 190, 'myconid/' + o.col, 1 * 40).setScale(1.8).setOrigin(0.5, 42 / 64), 3);
      sp.play(`f2-${o.col}-idle-1`);
      this.add(sc.txt(o.x, top + 208, o.tag, 16, 'Aurora16-Smooth', o.col === 'blue' ? 0x1f4fb0 : 0xb02020).setOrigin(0.5, 0), 3);
      this.add(sc.txt(o.x, top + 234, o.desc.join('\n'), 14, 'Aurora16-Smooth', 0x3a2410).setOrigin(0.5, 0).setCenterAlign(), 3);
      this.add(makeButton(sc, o.x, top + h - 62, o.name, () => this.fire({ label: '', fn: () => onPick(o.order) }), { w: 262, size: 16 }), 4);
    }
    const pickOpt = opts.find(q => q.order === pick)!;
    this.add(sc.txt(pickOpt.x, top + 112, 'YOUR PICK', 16, 'Pepper16-Bold', 0x9a5a00).setOrigin(0.5, 0), 3);
    draw();
    this.onKey = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Digit1') { sel = 'PAST_FIRST'; draw(); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Digit2') { sel = 'FUTURE_FIRST'; draw(); }
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') this.fire({ label: '', fn: () => onPick(sel) });
    };
  }
}
