import Phaser from 'phaser';
import { DCScene } from '../base';
import { Beacon } from '../shared/beacon';
import { DialogueBox } from '../ui/dialogue';
import { mulberry32 } from '../../sim/rng';
import { forestBackdrop } from '../office/forest';
import { CYAN, PINK, colourOf, flash, flip, myconid, mycPlay, onShutdown, shake, strip, wait } from '../office/fx';

export class AbductionScene extends DCScene {
  private done = false;
  constructor() { super('AbductionScene'); }

  create(): void {
    this.done = false;
    this.fadeIn(250);
    onShutdown(this, () => { this.done = true; });
    if (this.data0.phase === 'beam') void this.beam(); else void this.collapse();
  }

  private end(): void { if (this.done) return; this.done = true; this.send({ type: 'CONTINUE' }); }

  /** FOREST_FAILURE: the forest falls apart when the countdown ends. ~5 s. */
  private async collapse(): Promise<void> {
    const reduce = this.dc.settings.reduceMotion;
    const rnd = mulberry32((this.snap?.baseSeed ?? 1) ^ 0xc011a95e);
    const props = forestBackdrop(this);
    const beacon = new Beacon(this, 480, 380, { scale: 3, dusty: false }).setDepth(400);
    beacon.setFlame(true, true);
    this.dc.audio.playSfx('collapse');
    this.dc.audio.setBondStress(1);
    onShutdown(this, () => this.dc.audio.setBondStress(0));

    // colours drain: multiply overlay + tint the props grey
    const drain = this.add.rectangle(0, 0, this.W, this.H, 0x5a6074).setOrigin(0).setDepth(900).setAlpha(0).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.tweens.add({ targets: drain, alpha: 0.95, duration: 4200, ease: 'Sine.easeIn' });
    const lerp = { t: 0 };
    this.tweens.add({ targets: lerp, t: 1, duration: 4200, onUpdate: () => { const v = Math.round(255 - lerp.t * 120); const c = (v << 16) | (v << 8) | v; props.forEach(p => p.setTint(c)); } });

    // pink branch flashes multiply
    let n = 0;
    const burst = () => {
      if (this.done) return;
      n++;
      const x = 80 + rnd() * 800, y = 60 + rnd() * 380;
      flip(this, 'vfx/lightstreaks', x, y, { scale: 1 + rnd() * 1.2, tint: PINK, depth: 500, fps: 30, rot: rnd() * 3 });
      if (n % 3 === 0) this.dc.audio.playSfx('pink_flash');
      this.time.delayedCall(Math.max(90, 520 - n * 55), burst);
    };
    burst();

    // the Thread (a thin cyan line between the beacon and the edge of the world) frays, then snaps
    const thread = this.add.graphics().setDepth(950);
    const drawThread = (gap: number, jitter: number) => {
      thread.clear(); thread.lineStyle(3, CYAN, 1);
      const y = 120;
      thread.beginPath(); thread.moveTo(40, y); thread.lineTo(480 - gap, y + jitter); thread.strokePath();
      thread.beginPath(); thread.moveTo(480 + gap, y - jitter); thread.lineTo(920, y); thread.strokePath();
    };
    drawThread(0, 0);
    const fray = { g: 0 };
    this.tweens.add({ targets: fray, g: 6, duration: 2200, onUpdate: () => drawThread(0, (rnd() - 0.5) * fray.g * 2) });

    await wait(this, 2300);
    if (this.done) return;
    // screen cracks: impact flashes + thin crack lines + falling glass shards
    this.dc.audio.playSfx('thread_snap');
    shake(this, 500, 0.012); flash(this, 300, 200, 240, 255);
    drawThread(60, 10); this.tweens.add({ targets: thread, alpha: 0, duration: 700 });
    flip(this, 'vfx/big_hit', 480, 120, { scale: 1.6, depth: 960, tint: CYAN });
    const cracks = this.add.graphics().setDepth(940);
    cracks.lineStyle(2, 0xffffff, 0.9);
    for (let c = 0; c < 4; c++) {
      let x = 150 + rnd() * 660, y = 80 + rnd() * 380; const a0 = rnd() * 6.28;
      for (let seg = 0; seg < 7; seg++) { const a = a0 + (rnd() - 0.5) * 1.1, l = 26 + rnd() * 40; cracks.beginPath(); cracks.moveTo(x, y); x += Math.cos(a) * l; y += Math.sin(a) * l; cracks.lineTo(x, y); cracks.strokePath(); }
    }
    for (let i = 0; i < 9; i++) {
      const sh = this.add.image(120 + rnd() * 720, 40 + rnd() * 260, 'runner/GlassShards').setScale(2 + rnd() * 2).setDepth(945).setAlpha(0.9).setAngle(rnd() * 360);
      this.tweens.add({ targets: sh, y: sh.y + 260, angle: sh.angle + 120, alpha: 0, duration: reduce ? 400 : 1300, delay: i * 50, ease: 'Quad.easeIn' });
    }
    await wait(this, 500);
    if (this.done) return;
    // the Time Master's voice interrupts. Still unseen: caption + voice only.
    const dlg = new DialogueBox(this, 420, 780);
    onShutdown(this, () => dlg.dispose());
    await Promise.all([dlg.say('tm_forest_fail', { auto: true, holdMs: 700 }), wait(this, 2200)]);
    dlg.hide();
    this.end();
  }

  /** ABDUCTION: the selected mushroom is lifted by an exaggerated cyan beam and vanishes in the light. ~5 s. */
  private async beam(): Promise<void> {
    const reduce = this.dc.settings.reduceMotion;
    const col = colourOf(this.snap?.character);
    const props = forestBackdrop(this);
    props.forEach(p => p.setTint(0x6f7f9f));
    // dim the world, the beam is the light
    this.add.rectangle(0, 0, this.W, this.H, 0x0a1230).setOrigin(0).setDepth(850).setAlpha(0.45);
    this.dc.audio.stopMusic(300);

    const gx = 480, gy = 430;
    const mush = myconid(this, gx, gy, col, 4, 0).setDepth(1000);
    // beam: tide teleport strip stretched into a column, a glow source overhead, swirling wavy_blue behind
    const sx = 9, sy = 16;
    const beam = strip(this, 'portals/tide_teleport', gx, 260, { sx, sy, alpha: 0, depth: 990, fps: 16 });
    const halo = flip(this, 'vfx/wavy_blue', gx, gy - 20, { scale: 2.8, alpha: 0, depth: 980, loop: true, fps: 20, tint: 0x9fe8ff });
    const source = this.add.image(gx, -10, 'vfx/p_light_01').setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4).setAlpha(0).setDepth(985);
    const charge = flip(this, 'vfx/charge', gx, gy + 10, { scale: 2, depth: 995, loop: true, fps: 24, alpha: 0 });
    const motes = this.add.particles(gx, gy + 20, 'vfx/p_star_01', { lifespan: 1400, x: { min: -90, max: 90 }, speedY: { min: -260, max: -140 }, scale: { start: 0.07, end: 0 }, alpha: { start: 1, end: 0 }, frequency: 35, tint: [CYAN, 0xffffff], blendMode: 'ADD' }).setDepth(996).setVisible(false);
    onShutdown(this, () => { motes.destroy(); });

    await wait(this, 450);
    if (this.done) return;
    this.dc.audio.playSfx('abduct_beam');
    this.tweens.add({ targets: [beam, halo, source, charge], alpha: { from: 0, to: 0.95 }, duration: 600 });
    motes.setVisible(true);
    mycPlay(mush, 'hit', 0);
    shake(this, 400, 0.004);
    await wait(this, 800);
    if (this.done) return;
    // lift: ascend, shrink, spin, wobble
    this.tweens.add({ targets: mush, y: -40, duration: reduce ? 900 : 2800, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: mush, scale: 0.4, duration: reduce ? 900 : 2800, ease: 'Quad.easeIn' });
    if (!reduce) this.tweens.add({ targets: mush, angle: { from: -14, to: 14 }, yoyo: true, repeat: 6, duration: 200 });
    this.tweens.add({ targets: [beam], scaleX: sx * 1.12, yoyo: true, repeat: -1, duration: 260 });
    await wait(this, reduce ? 1000 : 2900);
    if (this.done) return;
    // gone in a flash
    mush.setVisible(false);
    flash(this, 450, 255, 255, 255);
    flip(this, 'vfx/star_explosion', gx, 60, { scale: 5, depth: 1100 });
    this.dc.audio.playSfx('reunion_chime');
    this.tweens.add({ targets: [beam, halo, source, charge], alpha: 0, duration: 500 });
    motes.stop();
    await wait(this, 900);
    this.end();
  }
}
