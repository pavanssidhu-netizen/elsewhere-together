import Phaser from 'phaser';
import { DCScene } from '../base';
import { DialogueBox } from '../ui/dialogue';
import { makeButton } from '../ui/button';
import { boxText, noFit } from '../ui/fit';
import { forestBackdrop } from '../office/forest';
import { mulberry32 } from '../../sim/rng';
import { CYAN, MAGENTA, PINK, flash, flip, myconid, mycPlay, onShutdown, shake, tears, wait, wizard } from '../office/fx';

/** RUNNER_SUCCESS / RUNNER_FAILURE (data.win). */
export class RunnerResultScene extends DCScene {
  private sent = false;
  constructor() { super('RunnerResultScene'); }

  create(): void {
    this.sent = false;
    onShutdown(this, () => { this.sent = true; this.input.keyboard?.removeAllListeners(); });
    if (this.data0.win) void this.win(); else this.fail();
  }

  private go(type: 'CONTINUE' | 'RETRY'): void { if (this.sent) return; this.sent = true; this.send({ type }); }

  // ---------------------------------------------------------------------------------------------- WIN
  private async win(): Promise<void> {
    const reduce = this.dc.settings.reduceMotion;
    this.fadeIn(250);
    this.dc.audio.playMusic('reunion', { fadeMs: 1200 });
    const alive = () => !this.sent && this.scene.isActive();
    // space, dark: the line is still cut
    const space = this.add.tileSprite(0, 0, this.W, this.H, 'space/starfield_white_far').setOrigin(0).setTileScale(1.5).setDepth(0);
    this.add.tileSprite(0, 0, this.W, this.H, 'space/nebula_violet').setOrigin(0).setTileScale(1.5).setDepth(0).setAlpha(0.5);
    this.tweens.add({ targets: space, tilePositionX: 200, duration: 9000 });
    // the forest waiting behind a bright wash
    const props = forestBackdrop(this);
    const sky = this.add.rectangle(0, 0, this.W, this.H, 0x07091a).setOrigin(0).setDepth(2000).setAlpha(1);
    props.forEach(p => p.setDepth(p.depth + 1));

    // the Thread: two cyan halves reaching for each other
    const thread = this.add.graphics().setDepth(2100);
    const gap = { v: 420 };
    const draw = () => { thread.clear(); thread.lineStyle(4, CYAN, 1); thread.beginPath(); thread.moveTo(0, 90); thread.lineTo(480 - gap.v / 2 - 0.5, 90); thread.strokePath(); thread.beginPath(); thread.moveTo(480 + gap.v / 2 + 0.5, 90); thread.lineTo(960, 90); thread.strokePath(); };
    draw();
    this.tweens.add({ targets: gap, v: 0, duration: reduce ? 300 : 1300, ease: 'Cubic.easeIn', onUpdate: draw });
    await wait(this, reduce ? 350 : 1350);
    if (!alive()) return;
    // reconnect
    this.dc.audio.playSfx('reunion_chime');
    flash(this, 500, 220, 255, 255);
    flip(this, 'vfx/electric_ring', 480, 90, { scale: 4, tint: CYAN, depth: 2200 });
    this.tweens.add({ targets: thread, alpha: 0, duration: 1000, delay: 400 });
    this.tweens.add({ targets: sky, alpha: 0, duration: reduce ? 300 : 1500 });
    const glow = this.add.rectangle(0, 0, this.W, this.H, 0xfff2c0).setOrigin(0).setDepth(2050).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0, duration: 2600 });

    // the brothers run in from the edges and meet
    const jensen = myconid(this, -40, 318, 'red', 3.4, 6).setDepth(2300);
    const sam = myconid(this, 1000, 318, 'blue', 3.4, 2).setDepth(2300);
    mycPlay(jensen, 'walk', 6); mycPlay(sam, 'walk', 2);
    const runMs = reduce ? 400 : 1700;
    this.tweens.add({ targets: jensen, x: 345, duration: runMs, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: sam, x: 615, duration: runMs, ease: 'Sine.easeOut', onComplete: () => {
      mycPlay(jensen, 'cheer', 6); mycPlay(sam, 'cheer', 2);
      this.dc.audio.playSfx('beacon_light');
      void this.dc.audio.playVoice('jensen_cheer'); this.time.delayedCall(250, () => void this.dc.audio.playVoice('sam_cheer'));
      this.cheerText(jensen.x, jensen.y - 130, 'Yay!', 0xff9a9a); this.cheerText(sam.x, sam.y - 130, 'Woo!', 0x9ac0ff);
      if (!reduce) for (const m of [jensen, sam]) this.tweens.add({ targets: m, y: m.y - 14, yoyo: true, repeat: 3, duration: 150, ease: 'Quad.easeOut' });
      const conf = this.add.particles(480, 120, 'vfx/p_star_01', { lifespan: 1600, x: { min: -300, max: 300 }, speedY: { min: 40, max: 160 }, scale: { start: 0.05, end: 0.01 }, tint: [PINK, CYAN, 0xffd24a, 0xffffff], frequency: 40, blendMode: 'ADD' }).setDepth(2400);
      onShutdown(this, () => conf.destroy());
    } });
    await wait(this, runMs + 700);
    if (!alive()) return;

    // the tiny Time Master struts onto a cushion and claims full credit
    const cush = this.add.image(480, 300, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.2).setDepth(2310).setAlpha(0);
    const wz = wizard(this, 480, 255, 6).setDepth(2320).setAlpha(0);
    this.tweens.add({ targets: [cush, wz], alpha: 1, duration: 300 });
    flip(this, 'vfx/impact_white', 480, 250, { scale: 0.6, alpha: 0.8, depth: 2330 });
    if (!reduce) {
      this.tweens.add({ targets: wz, x: { from: 440, to: 520 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: wz, y: wz.y - 5, yoyo: true, repeat: -1, duration: 220 });
      this.tweens.add({ targets: cush, x: { from: 440, to: 520 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
    }
    // chest puffed + medal
    this.tweens.add({ targets: wz, scaleX: 7, scaleY: 7.2, duration: 400, ease: 'Back.easeOut' });
    const medal = this.add.image(480, -20, 'runner/Diamond').setScale(3).setTint(0xffd24a).setDepth(2340);
    const medalTarget = { x: 480, y: 200 };
    this.tweens.add({ targets: medal, y: medalTarget.y, duration: reduce ? 200 : 700, ease: 'Bounce.easeOut', delay: 900, onComplete: () => { flash(this, 120, 255, 230, 150); this.dc.audio.playSfx('pickup'); } });
    if (!reduce) this.tweens.add({ targets: medal, x: { from: 440, to: 520 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut', delay: 900 });
    const dlg = new DialogueBox(this, 450, 760);
    onShutdown(this, () => dlg.dispose());
    await Promise.all([dlg.say('tm_runner_win', { auto: true, holdMs: 1000 }), wait(this, 2800)]);
    dlg.hide();
    await wait(this, 300);
    this.go('CONTINUE');
  }

  private cheerText(x: number, y: number, s: string, tint: number): void {
    const t = noFit(this.txt(x, y, s, 32, 'Pepper16-Bold', tint)).setOrigin(0.5).setDepth(2500);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 1400, delay: 400 });
  }

  // ---------------------------------------------------------------------------------------------- FAIL
  private fail(): void {
    const reduce = this.dc.settings.reduceMotion;
    const rnd = mulberry32((this.snap?.runnerSeed ?? 1) ^ 0xfa11);
    this.cameras.main.setBackgroundColor(0x05060d);
    this.dc.audio.stopMusic(150); // silence first
    this.dc.audio.playSfx('thread_snap');
    const alive = () => !this.sent && this.scene.isActive();

    // space backdrop (shakes at the end)
    const back = this.add.container(0, 0).setDepth(0);
    const far = this.add.tileSprite(0, 0, this.W, this.H, 'space/starfield_white_far').setOrigin(0).setTileScale(1.5);
    const nebula = this.add.tileSprite(0, 0, this.W, this.H, 'space/nebula_violet').setOrigin(0).setTileScale(1.5).setAlpha(0.7);
    const near = this.add.tileSprite(0, 0, this.W, this.H, 'space/starfield_white_near').setOrigin(0).setTileScale(1.5);
    back.add([far, nebula, near]);
    this.tweens.add({ targets: [far, near], tilePositionX: 60, duration: 12000, repeat: -1 });

    // the Time Master, tiny, on a cushion, crying
    const cush = this.add.image(480, 372, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.4).setDepth(5);
    const wz = wizard(this, 480, 330, 7).setDepth(6);
    const em = tears(this, 480, 330 - 7 * 11, 1.4);
    onShutdown(this, () => em.forEach(e => e.destroy()));
    if (!reduce) this.tweens.add({ targets: [wz, cush], x: { from: 474, to: 486 }, yoyo: true, repeat: -1, duration: 70 });
    const sob = this.add.bitmapText(480, 235, 'fonts/Pepper16-Bold', 'waaah', 16).setOrigin(0.5).setTint(0x9fe8ff).setDepth(7).setAlpha(0.9).setData('nofit', true);
    this.tweens.add({ targets: sob, y: 215, alpha: 0, yoyo: false, repeat: -1, duration: 1100 });

    // caption: his voice + text, top of the screen so the buttons stay clear
    const dlg = new DialogueBox(this, 118, 640);
    onShutdown(this, () => dlg.dispose());
    void Promise.all([dlg.say('tm_runner_fail', { auto: true, holdMs: 1500 }), wait(this, 3800)]).then(() => dlg.hide());

    // INSTANT RETRY: usable immediately (the comedy plays under it)
    const live = () => this.time.now > 250; // ignore the key presses that were still held when the runner ended
    const retry = makeButton(this, this.W / 2, 424, 'RETRY', () => this.go('RETRY'), { w: 330, size: 32, font: 'Pepper16-Bold' }).setDepth(3000);
    const give = makeButton(this, this.W / 2, 500, 'Give up', () => this.go('CONTINUE'), { w: 190, size: 16, tint: 0xd0c0a0 }).setDepth(3000);
    if (!reduce) this.tweens.add({ targets: retry, scale: { from: 1, to: 1.05 }, yoyo: true, repeat: -1, duration: 500 });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat || !live()) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'r') this.go('RETRY');
      else if (e.key === 'Escape' || e.key.toLowerCase() === 'g') this.go('CONTINUE');
    });
    boxText(this, 'Aurora16-Smooth', 'Space / Enter / R: retry', { x: this.W - 332, y: this.H - 28, w: 320, h: 20 }, { max: 16, min: 10, align: 'right', tint: 0x8fa0b8, depth: 3000 }, 'retry-hint');
    void give;

    // timelines multiply faster and faster
    const lines = this.add.graphics().setDepth(2);
    let spawned = 0;
    const strand = () => {
      if (!alive()) return;
      spawned++;
      const g = this.add.graphics().setDepth(3);
      const pink = rnd() < 0.5;
      g.lineStyle(2, pink ? PINK : spawned % 5 === 0 ? MAGENTA : CYAN, 0.9);
      let x = 480 + (rnd() - 0.5) * 120, y = 300 + (rnd() - 0.5) * 60; let a = rnd() * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 6; i++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * (40 + rnd() * 50); y += Math.sin(a) * (40 + rnd() * 50); g.lineTo(x, y); }
      g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 1600, onComplete: () => g.destroy() });
      if (spawned % 4 === 0) flip(this, 'vfx/lightstreaks', x, y, { scale: 0.7, tint: pink ? PINK : CYAN, depth: 4, fps: 30 });
      this.time.delayedCall(Math.max(40, 420 - spawned * 22), strand);
    };
    void lines;
    this.time.delayedCall(500, strand);

    // the exaggerated cosmic collapse
    this.time.delayedCall(4600, () => {
      if (!alive()) return;
      this.dc.audio.playSfx('cosmic_boom');
      this.dc.audio.playMusic('cosmic', { fadeMs: 1500 });
      shake(this, 900, 0.02); flash(this, 450, 255, 240, 220);
      const blast = (x: number, y: number, sc: number, delay: number) => this.time.delayedCall(delay, () => { if (alive()) { flip(this, 'vfx/explosion', x, y, { scale: sc, depth: 8 }); flip(this, 'vfx/star_explosion', x, y, { scale: sc * 2.5, depth: 9, tint: PINK }); } });
      blast(480, 300, 3.4, 0); blast(200, 200, 2.2, 160); blast(760, 220, 2.6, 300); blast(300, 420, 2, 420); blast(700, 400, 2.4, 560); blast(480, 150, 2.8, 700);
      if (!reduce) this.tweens.add({ targets: back, x: { from: -8, to: 8 }, y: { from: -6, to: 6 }, yoyo: true, repeat: 14, duration: 45, onComplete: () => back.setPosition(0, 0) });
      this.tweens.add({ targets: nebula, alpha: 1, duration: 700 });
      this.tweens.add({ targets: wz, scale: 8, angle: 12, yoyo: true, duration: 220 });
    });
  }
}
