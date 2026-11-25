import Phaser from 'phaser';
import type { DCScene } from '../base';
import { LINE_BY_ID } from '../content/lines';
import { fitText, typeInto, type Box } from './fit';

const NAME_TINT: Record<string, number> = { TIME_MASTER: 0x6a2cc0, JENSEN: 0xb02020, SAM: 0x1f4fb0 };

/**
 * Parchment dialogue box. Text is wrapped and shrunk to fit the cream parchment area (never beyond it), then typed out from the
 * ALREADY wrapped string so the lines never reflow mid-type. say(lineId) plays the voice, types the caption and resolves when the
 * player advances (click / tap / Space / Enter); a first press while typing completes the line. dispose() resolves a pending say().
 */
export class DialogueBox {
  private img: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.BitmapText;
  private name: Phaser.GameObjects.BitmapText;
  private arrow: Phaser.GameObjects.BitmapText;
  private resolve: (() => void) | null = null;
  private typing: Phaser.Time.TimerEvent | null = null;
  private full = '';
  private done = true;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private dead = false;
  private shown = false;
  /** The cream area text must stay inside (game coordinates). Exposed for tests. */
  readonly textBox: Box;
  private readonly nameBox: Box;

  constructor(private scene: DCScene, y = 400, w = 860) {
    this.img = scene.add.image(scene.W / 2, y, 'ui/dialog-box'); const k = w / this.img.width; this.img.setScale(k).setDepth(1000).setVisible(false);
    const h = this.img.height * k, L = scene.W / 2 - w / 2, T = y - h / 2;
    this.textBox = { x: L + 0.145 * w, y: T + 0.35 * h, w: 0.70 * w, h: 0.40 * h };
    this.nameBox = { x: L + 0.145 * w, y: T + 0.245 * h, w: 0.5 * w, h: 0.09 * h };
    this.name = scene.add.bitmapText(this.nameBox.x, this.nameBox.y, 'fonts/Pepper16-Bold', '', 16).setDepth(1001).setVisible(false);
    this.body = scene.add.bitmapText(this.textBox.x, this.textBox.y, 'fonts/Aurora16-Smooth', '', 16).setTint(0x2a1608).setDepth(1001).setVisible(false);
    this.arrow = scene.add.bitmapText(L + 0.85 * w, T + 0.72 * h, 'fonts/Aurora16-Smooth', '>', 16).setTint(0x7a4a10).setDepth(1001).setVisible(false).setData('nofit', true);
    scene.tweens.add({ targets: this.arrow, alpha: 0.2, yoyo: true, repeat: -1, duration: 420 });
    scene.input.on('pointerdown', this.advance, this);
    const kb = scene.input.keyboard;
    if (kb) for (const code of ['SPACE', 'ENTER']) { const key = kb.addKey(code); key.on('down', this.advance, this); this.keys.push(key); }
  }

  private show(v: boolean): void { this.shown = v; this.img.setVisible(v); this.name.setVisible(v); this.body.setVisible(v); if (!v) this.arrow.setVisible(false); }

  /** Show one line. voiceId = id in LINES (speaker + caption text come from it unless `text` / `who` are given). */
  async say(voiceId: string, opts: { text?: string; who?: string; auto?: boolean; holdMs?: number } = {}): Promise<void> {
    if (this.dead) return;
    const line = LINE_BY_ID[voiceId];
    const who = opts.who ?? line?.who ?? '';
    const text = opts.text ?? line?.text ?? voiceId;
    this.name.setText(who === 'TIME_MASTER' ? 'THE TIME MASTER' : who).setTint(NAME_TINT[who] ?? 0x4a1c0c);
    fitText(this.name, who === 'TIME_MASTER' ? 'THE TIME MASTER' : who, this.nameBox, { max: 16, min: 12 }, 'dialogue-name');
    this.full = fitText(this.body, text, this.textBox, { max: 16, min: 11 }, 'dialogue-body');   // wraps + fits, leaves the wrapped text set
    const wrapped = this.full; this.body.setText(''); this.done = false; this.arrow.setVisible(false); this.show(true);
    const voice = this.scene.dc.audio.playVoice(voiceId);
    const speed = this.scene.dc.settings.reduceMotion ? 0 : 22;
    await new Promise<void>((res) => {
      this.resolve = res;
      const finish = () => { this.body.setText(wrapped); this.done = true; this.arrow.setVisible(true); this.typing?.remove(); this.typing = null; };
      this.typing = typeInto(this.scene, this.body, wrapped, speed, finish);
      if (!speed) finish();
      if (opts.auto) voice.then(() => this.scene.time.delayedCall(opts.holdMs ?? 500, () => this.finish()));
    });
  }
  private advance(): void {
    if (this.dead || !this.resolve || !this.shown) return;
    if (!this.done) { this.typing?.remove(); this.typing = null; this.body.setText(this.full); this.done = true; this.arrow.setVisible(true); return; }
    this.finish();
  }
  private finish(): void { const r = this.resolve; this.resolve = null; this.scene.dc.audio.skipVoice(); r?.(); }
  hide(): void { this.show(false); }
  get container(): Phaser.GameObjects.Image { return this.img; }
  dispose(): void {
    this.dead = true; this.typing?.remove(); this.scene.input.off('pointerdown', this.advance, this);
    for (const k of this.keys) { k.off('down', this.advance, this); k.destroy(); }
    const r = this.resolve; this.resolve = null; r?.();
    this.img.destroy(); this.name.destroy(); this.body.destroy(); this.arrow.destroy();
  }
}
