import Phaser from 'phaser';
import { DCScene } from '../base';
import { makeButton } from '../ui/button';
import { boxText } from '../ui/fit';
import { frameInner } from '../forest2/view/frame';
import { Beacon } from '../shared/beacon';
import { forestBackdrop } from '../office/forest';
import { mulberry32 } from '../../shared/rng';
import { CYAN, PINK, flip, myconid, mycPlay, onShutdown, tears, wizard } from '../office/fx';

type Kind = 'FOREST_REUNION' | 'RUNNER_REPAIRED' | 'RUNNER_COLLAPSE';

/** REUNION_ENDING / FINAL_ENDING (data.kind). Every ending offers replay. */
export class EndingScene extends DCScene {
  private sent = false;
  constructor() { super('EndingScene'); }

  create(): void {
    this.sent = false;
    this.fadeIn(500);
    const kind = (this.data0.kind ?? this.snap?.ending ?? 'FOREST_REUNION') as Kind;
    const reduce = this.dc.settings.reduceMotion;
    onShutdown(this, () => { this.sent = true; this.input.keyboard?.removeAllListeners(); });
    this.dc.audio.playMusic(kind === 'RUNNER_COLLAPSE' ? 'office' : 'reunion', { fadeMs: 900 });
    if (kind === 'RUNNER_COLLAPSE') this.collapseBackdrop(reduce); else this.brightBackdrop(kind, reduce);

    // parchment card: ui/panel-frame shown 880x294 at (480,170). Its parchment is ~14% in from the left/right, 22% from the top, 18% from the bottom.
    const PW = 880, PH = 294, PX = this.W / 2 - PW / 2, PY = 170 - PH / 2;
    this.add.image(this.W / 2, 170, 'ui/panel-frame').setDisplaySize(PW, PH).setDepth(2000);
    const inner = frameInner(this.W / 2, 170, PW, PH); void PX; void PY;
    const title = { FOREST_REUNION: 'REUNITED', RUNNER_REPAIRED: 'TIME REPAIRED', RUNNER_COLLAPSE: 'TIME COLLAPSED' }[kind];
    const tag = { FOREST_REUNION: 'The brothers fixed it themselves.', RUNNER_REPAIRED: 'Entirely the Time Master\'s doing, apparently.', RUNNER_COLLAPSE: 'Everything is fine. Somewhere. Probably.' }[kind];
    boxText(this, 'Pepper16-Bold', title, { x: inner.x, y: inner.y, w: inner.w, h: 44 }, { max: 40, min: 20, align: 'center', valign: 'middle', tint: kind === 'RUNNER_COLLAPSE' ? 0x8a1030 : 0x4a1c0c, depth: 2001 }, 'ending-title');
    boxText(this, 'Aurora16-Smooth', tag, { x: inner.x, y: inner.y + 48, w: inner.w, h: 24 }, { max: 18, min: 11, align: 'center', tint: 0x2a1608, depth: 2001 }, 'ending-tag');

    let lines: string[] = [];
    if (kind === 'FOREST_REUNION') {
      const f = this.dc.session.forestSummary;
      lines = f ? f.decisions.slice(0, 4) : [];
      if (!lines.length) lines = ['Two brothers, one forest, and time politely put back.'];
    } else if (kind === 'RUNNER_REPAIRED') {
      const r = this.dc.session.runnerStats;
      lines = ['The mushrooms did the running.', 'He took the credit.'];
      if (r) lines.push(`Anchors: ${r.anchors}   Hits: ${r.hits}`);
    } else {
      lines = ['The Time Master cried loudly.', 'The mushrooms are in several pieces.'];
    }
    boxText(this, 'Aurora16-Smooth', lines.join('\n'), { x: inner.x, y: inner.y + 78, w: inner.w, h: inner.h - 78 }, { max: 16, min: 10, align: 'center', tint: 0x3a2412, depth: 2001 }, 'ending-lines');

    const mid = this.W / 2;
    // buttons
    const replay = () => { if (this.sent) return; this.sent = true; this.send({ type: 'REPLAY' }); };
    const btns: { label: string; act: () => void }[] = [{ label: 'PLAY AGAIN', act: replay }];
    if (kind === 'RUNNER_COLLAPSE') btns.push({ label: 'TRY THE REPAIR AGAIN', act: () => { if (this.sent) return; this.sent = true; this.send({ type: 'RESTART_RUNNER' }); } });
        btns.forEach((b, i) => makeButton(this, btns.length === 1 ? mid : mid + (i === 0 ? -165 : 165), 484, b.label, b.act, { w: btns.length === 1 ? 270 : 310, size: 16 }).setDepth(3000));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (!e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r')) replay(); });
  }

  private brightBackdrop(kind: Kind, reduce: boolean): void {
    forestBackdrop(this);
    const beacon = new Beacon(this, 480, 400, { scale: 2.4 }).setDepth(150);
    beacon.setFlame(true, true).setHarmony(true).setProgress([true, true, true], [true, true, true]);
    if (!reduce) this.time.addEvent({ delay: 2200, loop: true, callback: () => beacon.pulse(0xfff2c4) });
    const jensen = myconid(this, 270, 440, 'red', 3.4, 6).setDepth(500);
    const sam = myconid(this, 690, 440, 'blue', 3.4, 2).setDepth(500);
    mycPlay(jensen, 'cheer', 6); mycPlay(sam, 'cheer', 2);
    const conf = this.add.particles(480, -10, 'vfx/p_star_01', { lifespan: 3000, x: { min: -480, max: 480 }, speedY: { min: 30, max: 90 }, scale: { start: 0.05, end: 0.01 }, tint: [PINK, CYAN, 0xffd24a, 0xffffff], frequency: 120, blendMode: 'ADD' }).setDepth(400);
    onShutdown(this, () => conf.destroy());
    if (kind === 'RUNNER_REPAIRED') {
      // the tiny Time Master, tiny and smug, between the brothers
      this.add.image(480, 452, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.2).setDepth(501);
      const wz = wizard(this, 480, 418, 5).setDepth(502);
      this.add.image(480, 395, 'runner/Diamond').setScale(2.4).setTint(0xffd24a).setDepth(503);
      if (!reduce) this.tweens.add({ targets: wz, scaleX: 5.4, scaleY: 5.4, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    }
  }

  private collapseBackdrop(reduce: boolean): void {
    const rnd = mulberry32((this.snap?.runnerSeed ?? 3) ^ 0xc011);
    const far = this.add.tileSprite(0, 0, this.W, this.H, 'space/starfield_white_far').setOrigin(0).setTileScale(1.5);
    this.add.tileSprite(0, 0, this.W, this.H, 'space/nebula_violet').setOrigin(0).setTileScale(1.5).setAlpha(0.8).setTint(0xff9ac8);
    const near = this.add.tileSprite(0, 0, this.W, this.H, 'space/starfield_white_near').setOrigin(0).setTileScale(1.5);
    this.tweens.add({ targets: [far, near], tilePositionX: 80, duration: 14000, repeat: -1 });
    this.add.image(120, 360, 'space/prop-planet-big').setScale(5).setAlpha(0.7).setTint(0xff8a8a);
    this.add.image(820, 300, 'space/asteroid-1').setScale(5).setAngle(30);
    const boom = () => {
      if (!this.scene.isActive()) return;
      const x = 40 + rnd() * 880, y = 220 + rnd() * 260;
      flip(this, rnd() < 0.5 ? 'vfx/explosion' : 'vfx/star_explosion', x, y, { scale: 1.2 + rnd() * 2.2, tint: rnd() < 0.5 ? undefined : PINK, depth: 100, fps: 28 });
      this.time.delayedCall(reduce ? 1800 : 380 + rnd() * 700, boom);
    };
    boom();
    // the Time Master, tiny, in the rubble, crying
    this.add.image(480, 452, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.2).setDepth(500).setAngle(-8);
    const wz = wizard(this, 480, 418, 5).setDepth(502);
    const em = tears(this, 480, 418 - 5 * 11, 1);
    onShutdown(this, () => em.forEach(e => e.destroy()));
    if (!reduce) this.tweens.add({ targets: wz, x: { from: 476, to: 484 }, yoyo: true, repeat: -1, duration: 70 });
    const j = myconid(this, 280, 450, 'red', 3.2, 0).setDepth(500); mycPlay(j, 'death', 0);
    const s = myconid(this, 680, 450, 'blue', 3.2, 0).setDepth(500); mycPlay(s, 'death', 0);
  }
}
