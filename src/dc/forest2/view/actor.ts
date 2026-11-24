import Phaser from 'phaser';
import type { Dir } from '../api';
import { Iso } from './tileLayer';

/** grid direction -> myconid row (rows: S,SW,W,NW,N,NE,E,SE as screen compass). Grid N=y-1 is screen up-right (NE). */
export const DIR_ROW: Record<Dir, number> = { N: 5, E: 7, S: 1, W: 3 };
export const SAM_COL = 0x6aa8ff, JENSEN_COL = 0xff6a62;
export const STEP_MS = 140;

/** A myconid on the iso grid with a ground shadow and a crisp ground-diamond outline (depth readability). */
export class Actor {
  readonly spr: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  px = 0; py = 0;                         // current screen feet position (tweened)
  gx = 0; gy = 0;
  private dir: Dir = 'S';
  private walking = false;
  private tw?: Phaser.Tweens.Tween;
  depthAdd = 0;
  ringAlpha = 1;
  constructor(private scene: Phaser.Scene, private iso: Iso, public col: 'red' | 'blue', private ghost: boolean, private k = 1.45) {
    this.shadow = scene.add.image(0, 0, 'vfx/p_circle_05').setTint(0x000000).setAlpha(0.35).setScale(0.12 * iso.S, 0.06 * iso.S);
    this.ring = scene.add.graphics();
    this.spr = scene.add.sprite(0, 0, 'myconid/' + col).setOrigin(0.5, 42 / 64).setScale(k * iso.S / 1.5);
    if (ghost) this.spr.setAlpha(0.45).setTint(col === 'red' ? 0xffb0b0 : 0xb0d0ff);
    this.spr.play(`f2-${col}-idle-${DIR_ROW.S}`);
  }

  get ringColor(): number { return this.col === 'red' ? JENSEN_COL : SAM_COL; }

  place(gx: number, gy: number): void {
    this.tw?.stop(); this.gx = gx; this.gy = gy;
    const p = this.iso.p(gx, gy); this.px = p.x; this.py = p.y + 3 * this.iso.S;
    this.drawRing();
    this.sync();
  }
  /** instant re-aim of the grid cell (no tween) used by the ghost when it replays quickly */
  moveTo(gx: number, gy: number, dir: Dir | null, ms: number): void {
    const moved = gx !== this.gx || gy !== this.gy;
    this.gx = gx; this.gy = gy;
    if (dir) this.dir = dir;
    this.drawRing();
    const p = this.iso.p(gx, gy), ty = p.y + 3 * this.iso.S;
    this.tw?.stop();
    if (!moved || ms <= 0) { this.px = p.x; this.py = ty; this.idle(); return; }
    this.walking = true; this.spr.play(`f2-${this.col}-walk-${DIR_ROW[this.dir]}`, true);
    this.tw = this.scene.tweens.add({ targets: this, px: p.x, py: ty, duration: ms, ease: 'Sine.easeInOut', onComplete: () => { this.walking = false; this.idle(); } });
  }
  face(d: Dir): void { this.dir = d; if (!this.walking) this.idle(); }
  idle(): void { this.spr.play(`f2-${this.col}-idle-${DIR_ROW[this.dir]}`, true); }
  hit(): void {
    this.spr.play(`f2-${this.col}-hit-${DIR_ROW[this.dir]}`, true);
    this.spr.once('animationcomplete', () => { if (this.spr.active) this.idle(); });
  }
  /** recolour into a ghost (used by the Time-Lock join) */
  toGhost(): void { this.ghost = true; this.spr.setAlpha(0.45).setTint(this.col === 'red' ? 0xffb0b0 : 0xb0d0ff); }

  private drawRing(): void {
    const g = this.ring.clear(); const d = this.iso.diamond(this.gx, this.gy, 3);
    g.lineStyle(this.ghost ? 2 : 1.5, this.ringColor, this.ghost ? 1 : 0.7).strokePoints(d, true);
    if (this.ghost) g.fillStyle(this.ringColor, 0.12).fillPoints(d, true);
    
  }

  sync(): void {
    this.spr.setPosition(this.px, this.py).setDepth(100 + this.py + (this.ghost ? 0 : 1) + this.depthAdd);
    this.shadow.setPosition(this.px, this.py + 1).setDepth(99 + this.py + this.depthAdd * 0);
    this.ring.setDepth((this.depthAdd > 0 ? 3200 : -900) + (this.ghost ? 0.01 : 0)).setAlpha(this.ringAlpha);
  }
  setVisible(v: boolean): void { this.spr.setVisible(v); this.shadow.setVisible(v); this.ring.setVisible(v); }
  destroy(): void { this.tw?.stop(); this.scene.tweens.killTweensOf(this); this.spr.destroy(); this.shadow.destroy(); this.ring.destroy(); }
}
