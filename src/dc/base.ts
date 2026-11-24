import Phaser from 'phaser';
import { GAME_W, GAME_H, type DCServices, type SceneData } from './contracts';
import type { FlowSnapshot } from '../flow/flow';

/** Base class for every Director's Cut scene. Provides services, the flow snapshot and small UI helpers. */
export class DCScene extends Phaser.Scene {
  snap!: FlowSnapshot;
  data0: SceneData = {} as SceneData;
  init(data: SceneData): void { this.data0 = data ?? ({} as SceneData); this.snap = data?.snap; }
  get dc(): DCServices { return this.registry.get('dc') as DCServices; }
  /** Always route state changes through the flow controller. */
  send = (e: Parameters<DCServices['flow']['dispatch']>[0]): boolean => this.dc.flow.dispatch(e);
  /** True while gameplay timers may run (not paused, not in a cutscene). */
  get live(): boolean { return this.dc.flow.timersRunning; }
  fadeIn(ms = 300): void { if (!this.dc.settings.reduceMotion) this.cameras.main.fadeIn(ms, 0, 0, 0); }
  /** Pixel-font text. font = key from DC_FONTS, e.g. 'Aurora16-Smooth'. */
  txt(x: number, y: number, s: string, size = 16, font = 'Aurora16-Smooth', tint = 0xffffff): Phaser.GameObjects.BitmapText {
    const t = this.add.bitmapText(x, y, 'fonts/' + font, s, size);
    t.setTint(tint); return t;
  }
  get W(): number { return GAME_W; }
  get H(): number { return GAME_H; }
}
