import Phaser from 'phaser';
import type { DCScene } from '../base';
import { makeButton } from '../ui/button';
import { boxText } from '../ui/fit';

export interface DemoOption { label: string; run: () => void }

/**
 * DEMO MODE choice panel (shown when flow snapshot.demo is true). One panel per decision point: "MAKE THEM WIN / MAKE THEM LOSE / PLAY IT YOURSELF".
 * Keys 1/2/3 pick an option. Calling destroy() (or picking an option) removes it. Depth above everything.
 */
export class DemoPanel {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  constructor(private scene: DCScene, title: string, blurb: string, options: DemoOption[]) {
    const D = 5000, W = scene.W, H = scene.H;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(D); this.objs.push(o); return o; };
    add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05060d, 0.68)).setInteractive();
    const pw = 860, ph = 330;
    add(scene.add.image(W / 2, H / 2, 'ui/panel-frame').setDisplaySize(pw, ph));
    const top = H / 2 - ph / 2;
    const tl = boxText(scene, 'Pepper16-Bold', title, { x: W / 2 - 330, y: top + 34, w: 660, h: 34 }, { max: 28, min: 16, align: 'center', tint: 0xfff1c9, depth: D + 1 }, 'demo-title'); this.objs.push(tl);
    const bl = boxText(scene, 'Aurora16-Smooth', blurb, { x: W / 2 - 330, y: top + 86, w: 660, h: 58 }, { max: 16, min: 11, align: 'center', tint: 0x3a2410, depth: D + 1 }, 'demo-blurb'); this.objs.push(bl);
    const n = options.length, bw = Math.min(250, (pw - 140) / n), gap = 14;
    options.forEach((o, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * (bw + gap);
      const b = makeButton(scene, x, top + ph - 78, `${i + 1}  ${o.label}`, () => this.pick(o), { w: bw, size: 15 });
      add(b);
    });
    this.keyHandler = (e: KeyboardEvent) => { const i = Number(e.key) - 1; if (i >= 0 && i < n && !e.repeat) this.pick(options[i]); };
    window.addEventListener('keydown', this.keyHandler);
    scene.events.once('shutdown', () => this.destroy());
  }
  private pick(o: DemoOption): void { this.destroy(); o.run(); }
  destroy(): void {
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }
}
