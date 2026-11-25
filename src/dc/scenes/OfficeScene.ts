import Phaser from 'phaser';
import { DCScene } from '../base';
import { DialogueBox } from '../ui/dialogue';
import { makeButton } from '../ui/button';
import { noFit } from '../ui/fit';
import { buildOffice, type Room } from '../office/room';
import { colourOf, myconid, mycPlay, flip, onShutdown, wait, CYAN } from '../office/fx';

const BEG = 'Please, magnificent Time Master.';
const NOPE = 'Absolutely not.';

/** TIME_MASTER_OFFICE: the reveal. A cosy office, a hugely important desk, and a very small wizard behind it. */
export class OfficeScene extends DCScene {
  private room!: Room;
  private dlg!: DialogueBox;
  private choiceIdx = 0;
  private choices: { c: Phaser.GameObjects.Container; mark: Phaser.GameObjects.BitmapText; act: () => void }[] = [];
  private busy = true;
  private armedAt = 0;
  private sent = false;
  private blinkTimer?: Phaser.Time.TimerEvent;
  private bobTw?: Phaser.Tweens.Tween;

  constructor() { super('OfficeScene'); }

  create(): void {
    this.fadeIn(400);
    this.cameras.main.setBackgroundColor(0x1a1410);
    this.choices = []; this.choiceIdx = 0; this.busy = true; this.sent = false;
    this.room = buildOffice(this);
    this.dc.audio.playMusic('office', { fadeMs: 800 });
    const room = this.room;
    const col = colourOf(this.snap?.character);

    // the Time Master: tiny, adorable, idle charm
    const wz = room.wizard;
    const reduce = this.dc.settings.reduceMotion;
    if (!reduce) {
      this.bobTw = this.tweens.add({ targets: wz, y: wz.y - 3, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: wz, angle: { from: -3, to: 3 }, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
    }
    this.blinkTimer = this.time.addEvent({ delay: 2400, loop: true, callback: () => { wz.play('wiz:blink'); wz.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => wz.play('wiz:idle')); } });

    // the selected mushroom walks in and stands in front of the desk, small
    const m = myconid(this, -40, 292, col, 3, 6).setDepth(9);
    mycPlay(m, 'walk', 6);
    const stand = () => { mycPlay(m, 'idle', 6); this.tweens.add({ targets: m, y: m.y - 2, yoyo: true, repeat: -1, duration: 700 }); };
    this.tweens.add({ targets: m, x: 330, duration: reduce ? 1 : 1100, ease: 'Sine.easeOut', onComplete: stand });

    this.dlg = new DialogueBox(this, 424, 740);
    onShutdown(this, () => { this.dlg.dispose(); this.blinkTimer?.remove(); this.input.keyboard?.removeAllListeners(); });
    void this.run();
    this.setupKeys();
  }

  private async run(): Promise<void> {
    await wait(this, 900);
    const d = this.dlg;
    const ok = () => this.scene.isActive();
    await d.say('tm_office_1'); if (!ok()) return;
    this.room.chaos(true);
    await d.say('tm_office_2'); if (!ok()) return;
    this.room.chaos(false);
    // visual gag: he hops up onto the desk to look important
    this.hopOntoDesk();
    await d.say('tm_office_3'); if (!ok()) return;
    await d.say('tm_office_4'); if (!ok()) return;
    await d.say('tm_office_5'); if (!ok()) return;
    this.showChoices();
  }

  private hopOntoDesk(): void {
    const { wizard: wz, pedestal, deskTopY } = this.room;
    this.bobTw?.remove();
    if (this.dc.settings.reduceMotion) { wz.setDepth(10).setY(deskTopY + 8).setScale(6); pedestal.setDepth(9).setY(deskTopY + 10); return; }
    this.tweens.add({ targets: wz, y: deskTopY - 40, scale: 6, duration: 260, ease: 'Quad.easeOut', yoyo: false, onComplete: () => {
      wz.setDepth(10);
      this.tweens.add({ targets: wz, y: deskTopY + 8, duration: 200, ease: 'Bounce.easeOut' });
    } });
    this.tweens.add({ targets: pedestal, y: deskTopY + 10, duration: 460, ease: 'Quad.easeInOut', onStart: () => pedestal.setDepth(9) });
    this.time.delayedCall(480, () => flip(this, 'vfx/impact_white', this.room.deskX, deskTopY + 6, { scale: 0.5, alpha: 0.7, depth: 11 }));
  }

  private showChoices(): void {
    this.dlg.hide();
    const make = (x: number, label: string, key: string, act: () => void) => {
      const y = 452;
      const c = makeButton(this, x, y, key + ' ' + label, () => this.pick(act), { w: 440, size: 14 }).setDepth(1100);
      const mark = noFit(this.txt(x - 200, y - 8, '>', 16, 'Pepper16-Bold', CYAN)).setDepth(1101);
      c.on('pointerover', () => this.focus(this.choices.findIndex(q => q.c === c)));
      this.choices.push({ c, mark, act });
    };
    make(250, BEG, '1', () => void this.accept());
    make(710, NOPE, '2', () => void this.refuse());
    this.focus(0);
    this.busy = false;
    this.armedAt = this.time.now + 450; // the click / key that dismissed the last line must not also pick an answer
    for (const ch of this.choices) {
      ch.c.setAlpha(0).setScale(0.9);
      this.tweens.add({ targets: ch.c, alpha: 1, scale: 1, duration: this.dc.settings.reduceMotion ? 1 : 250, ease: 'Back.easeOut' });
    }
  }

  private focus(i: number): void {
    if (i < 0) return;
    this.choiceIdx = i;
    this.choices.forEach((c, k) => c.mark.setVisible(k === i));
  }

  private pick(act: () => void): void { if (this.busy || this.sent || this.time.now < this.armedAt) return; this.busy = true; act(); }

  private setupKeys(): void {
    const kb = this.input.keyboard; if (!kb) return;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.busy || this.choices.length === 0 || e.repeat) return;
      if (e.key === 'ArrowUp' || e.key === 'w') this.focus((this.choiceIdx + this.choices.length - 1) % this.choices.length);
      else if (e.key === 'ArrowDown' || e.key === 's') this.focus((this.choiceIdx + 1) % this.choices.length);
      else if (e.key === '1') { this.focus(0); this.pick(this.choices[0].act); }
      else if (e.key === '2') { this.focus(1); this.pick(this.choices[1].act); }
      else if (e.key === 'Enter' || e.key === ' ') this.pick(this.choices[this.choiceIdx].act);
    });
  }

  private clearChoices(): void { for (const c of this.choices) { c.c.destroy(); c.mark.destroy(); } this.choices = []; }

  private smugBounce(): void {
    if (this.dc.settings.reduceMotion) return;
    this.tweens.add({ targets: this.room.wizard, scaleX: 6.6, scaleY: 6.6, yoyo: true, duration: 180, repeat: 1 });
  }

  private async accept(): Promise<void> {
    this.clearChoices();
    this.smugBounce();
    await this.dlg.say('tm_accept_1');
    await this.dlg.say('tm_accept_2');
    this.finish('ACCEPT');
  }

  private async refuse(): Promise<void> {
    this.clearChoices();
    this.dc.audio.playSfx('warning');
    this.room.wizard.setTint(0xff9a9a);
    await this.dlg.say('tm_refuse');
    this.finish('REFUSE');
  }

  private finish(type: 'ACCEPT' | 'REFUSE'): void { if (this.sent || !this.scene.isActive()) return; this.sent = true; this.send({ type }); }
}
