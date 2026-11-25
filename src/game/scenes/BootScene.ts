import Phaser from 'phaser';
import { DC_IMAGES, DC_SHEETS, DC_FONTS } from '../assets.generated';
import { GAME_W, GAME_H } from '../contracts';

/** Loads every imported asset once, then tells main.ts it is ready. */
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  preload(): void {
    const w = 360, x = (GAME_W - w) / 2, y = GAME_H / 2;
    const frame = this.add.rectangle(GAME_W / 2, y, w + 6, 18).setStrokeStyle(2, 0x7be0df);
    const bar = this.add.rectangle(x, y, 1, 10, 0x7be0df).setOrigin(0, 0.5);
    this.add.text(GAME_W / 2, y - 30, 'OUT OF SYNC', { fontFamily: 'monospace', fontSize: '22px', color: '#d7f6f5' }).setOrigin(0.5);
    void frame;
    this.load.on('progress', (p: number) => { bar.width = Math.max(1, w * p); });
    const base = './';
    for (const a of DC_IMAGES) this.load.image(a.key, base + a.url);
    for (const s of DC_SHEETS) this.load.spritesheet(s.key, base + s.url, { frameWidth: s.fw, frameHeight: s.fh });
    for (const f of DC_FONTS) this.load.bitmapFont(f.key, base + f.png, base + f.fnt);
  }
  create(): void {
    // crisp pixels for everything we imported
    for (const a of [...DC_IMAGES, ...DC_SHEETS]) this.textures.get(a.key)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.game.events.emit('dc-ready');
  }
}
