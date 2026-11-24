import Phaser from 'phaser';
import type { DCScene } from '../base';
import { LINE_BY_ID } from '../content/lines';

const NAME_TINT: Record<string, number> = { TIME_MASTER: 0x6a2cc0, JENSEN: 0xb02020, SAM: 0x1f4fb0 };

/**
 * Parchment dialogue box with typewriter text. say(lineId) plays the voice (if any), types the caption and resolves when the player
 * advances (click / tap / Space / Enter) or the line finishes + short beat when auto = true. Skippable: dispose() resolves pending say().
 */
export class DialogueBox {
  private box: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.BitmapText;
  private name: Phaser.GameObjects.BitmapText;
  private arrow: Phaser.GameObjects.BitmapText;
  private resolve: (() => void) | null = null;
  private typing: Phaser.Time.TimerEvent | null = null;
  private full = '';
  private done = true;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private dead = false;

  constructor(private scene: DCScene, y = 400, w = 860) {
    const img = scene.add.image(0, 0, 'ui/dialog-box'); const k = w / img.width; img.setScale(k);
    this.name = scene.add.bitmapText(-w / 2 + 44, -img.height * k / 2 + 30, 'fonts/Pepper16-Bold', '', 16).setTint(0x4a1c0c);
    this.body = scene.add.bitmapText(-w / 2 + 44, -img.height * k / 2 + 58, 'fonts/Aurora16-Smooth', '', 16).setTint(0x2a1608).setMaxWidth(w - 100);
    this.arrow = scene.add.bitmapText(w / 2 - 66, img.height * k / 2 - 52, 'fonts/Aurora16-Smooth', '>', 16).setTint(0x7a4a10).setVisible(false);
    this.box = scene.add.container(scene.W / 2, y, [img, this.name, this.body, this.arrow]).setDepth(1000).setVisible(false);
    scene.tweens.add({ targets: this.arrow, alpha: 0.2, yoyo: true, repeat: -1, duration: 420 });
    scene.input.on('pointerdown', this.advance, this);
    const kb = scene.input.keyboard;
    if (kb) for (const code of ['SPACE', 'ENTER']) { const key = kb.addKey(code); key.on('down', this.advance, this); this.keys.push(key); }
  }

  /** Show one line. voiceId = id in LINES (also used for the speaker + caption text unless `text` is given). */
  async say(voiceId: string, opts: { text?: string; who?: string; auto?: boolean; holdMs?: number } = {}): Promise<void> {
    if (this.dead) return;
    const line = LINE_BY_ID[voiceId];
    const who = opts.who ?? line?.who ?? '';
    const text = opts.text ?? line?.text ?? voiceId;
    this.name.setText(who === 'TIME_MASTER' ? 'THE TIME MASTER' : who).setTint(NAME_TINT[who] ?? 0x4a1c0c);
    this.full = text; this.body.setText(''); this.done = false; this.arrow.setVisible(false); this.box.setVisible(true);
    const voice = this.scene.dc.audio.playVoice(voiceId);
    let i = 0;
    const speed = this.scene.dc.settings.reduceMotion ? 0 : 22;
    await new Promise<void>((res) => {
      this.resolve = res;
      const finishTyping = () => { this.body.setText(this.full); this.done = true; this.arrow.setVisible(true); this.typing?.remove(); this.typing = null; };
      if (!speed) finishTyping();
      else this.typing = this.scene.time.addEvent({ delay: speed, repeat: this.full.length, callback: () => { i++; this.body.setText(this.full.slice(0, i)); if (i >= this.full.length) finishTyping(); } });
      if (opts.auto) voice.then(() => this.scene.time.delayedCall(opts.holdMs ?? 500, () => this.finish()));
    });
  }
  private advance(): void {
    if (this.dead || !this.resolve) return;
    if (!this.done) { this.typing?.remove(); this.typing = null; this.body.setText(this.full); this.done = true; this.arrow.setVisible(true); return; }
    this.finish();
  }
  private finish(): void { const r = this.resolve; this.resolve = null; this.scene.dc.audio.skipVoice(); r?.(); }
  hide(): void { this.box.setVisible(false); }
  get container(): Phaser.GameObjects.Container { return this.box; }
  dispose(): void {
    this.dead = true; this.typing?.remove(); this.scene.input.off('pointerdown', this.advance, this);
    for (const k of this.keys) { k.off('down', this.advance, this); k.destroy(); }
    const r = this.resolve; this.resolve = null; r?.(); this.box.destroy();
  }
}
