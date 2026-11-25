import Phaser from 'phaser';
import { DCScene } from '../base';
import { Beacon } from '../shared/beacon';
import {
  CYAN, PINK, ADD, crispFonts, myc, setMyc, flip, flipAnim, buildForest, tintAll, lerpTint, Caption, holdFor, rngFor, type Forest,
} from '../cutscene/kit';
import { LINE_BY_ID } from '../content/lines';
import { noFit } from '../ui/fit';

/** FOREST_SUCCESS: the flames harmonise, the two worlds slide into one forest, the brothers run to each other. ~10 s, skippable. */
export class ReunionScene extends DCScene {
  constructor() { super('ReunionScene'); }
  private alive = true;
  private caption!: Caption; private me!: Phaser.GameObjects.Sprite; private youTag!: Phaser.GameObjects.BitmapText;
  update(): void { if (this.me?.active) this.youTag.setPosition(this.me.x, this.me.y - 190); }

  create(): void {
    this.alive = true;
    crispFonts(this);
    const { W, H } = this; const rm = this.dc.settings.reduceMotion;
    this.cameras.main.setBackgroundColor(0x03040a); this.fadeIn(400);
    this.dc.audio.playMusic('reunion');
    this.events.once('shutdown', () => { this.alive = false; this.dc.audio.skipVoice(); });

    // the void behind the two worlds, visible through the gap
    this.add.tileSprite(0, 0, W, H, 'space/starfield_white_mid').setOrigin(0).setTileScale(1.6).setAlpha(0.8).setBlendMode(ADD);
    const gap0 = 44;
    const left = buildForest(this, 0, 480), right = buildForest(this, 480, 960);
    const panels: Array<[Forest, number]> = [[left, 0x9fc0ff], [right, 0xf0c890]];
    for (const [f, t] of panels) { tintAll(f, t); f.c.setDepth(1); }
    right.c.x = 480;
    const slide = { o: gap0 };
    const place = () => { left.c.x = -slide.o; right.c.x = 480 + slide.o; };
    place();

    // the pink tear between them closes as they meet
    const tear = this.add.container(W / 2, H / 2).setDepth(4);
    tear.add([this.add.image(0, 0, 'vfx/p_light_01').setScale(0.2, 1.5).setTint(PINK).setBlendMode(ADD).setAlpha(0.85), this.add.rectangle(0, 0, 3, H, 0xffe8f0).setBlendMode(ADD).setAlpha(0.9)]);
    const streaks = [110, 270, 430].map(y => this.add.sprite(W / 2, y, 'vfx/lightstreaks').setRotation(Math.PI / 2).setScale(1).setTint(PINK).setBlendMode(ADD).setAlpha(rm ? 0.25 : 0.5).setDepth(4).play(flipAnim(this, 'vfx/lightstreaks', rm ? 5 : 12, true)));

    // beacon + brothers
    const beacon = new Beacon(this, W / 2, 440, { scale: 3, dusty: false }).setDepth(5);
    const mine = this.snap?.character === 'SAM' ? 'SAM' : 'JENSEN';
    const jen = myc(this, 'red', 140, 452, 4, 'S').setDepth(6), sam = myc(this, 'blue', 820, 452, 4, 'S').setDepth(6);
    this.me = mine === 'SAM' ? sam : jen;
    this.youTag = noFit(this.txt(this.me.x, this.me.y - 190, 'YOU', 19, 'Pepper16-Bold', 0xfff1c9).setOrigin(0.5).setDepth(7));
    const cap = (this.caption = new Caption(this));

    const wait = (ms: number) => new Promise<void>((res) => { this.time.delayedCall(ms, () => res()); });
    const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => new Promise<void>((res) => { this.tweens.add({ ...cfg, onComplete: () => res() }); });
    const ok = () => { if (!this.alive) throw new Error('stopped'); };
    const say = async (id: string, minMs = 1600) => {
      cap.show(id);
      await Promise.all([this.dc.audio.playVoice(id).catch(() => undefined), wait(holdFor(LINE_BY_ID[id].text, minMs))]);
      ok();
    };
    const flashRect = (color: number, peak: number, ms: number) => {
      const r = this.add.rectangle(0, 0, W, H, color).setOrigin(0).setDepth(900).setAlpha(0).setBlendMode(ADD);
      return tw({ targets: r, alpha: rm ? Math.min(peak, 0.35) : peak, yoyo: true, duration: ms, ease: 'Quad.easeOut' }).then(() => r.destroy());
    };

    const run = async () => {
      const rand = rngFor(0xc0ffee);
      await wait(150); ok();
      // 1. the flames harmonise
      beacon.setFlame(true, true); this.dc.audio.playSfx('beacon_light');
      await wait(300); ok();
      beacon.setProgress([true, true, true], [true, true, true]);
      await wait(450); ok();
      beacon.setHarmony(true);
      this.tweens.add({ targets: beacon, scale: 1.04, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      await wait(350); ok();
      // 2. cyan / pink merge flash
      this.dc.audio.playSfx('reunion_chime');
      const f1 = flashRect(CYAN, 0.7, 220);
      flip(this, 'vfx/impact_white', W / 2, 360, { scale: 3, tint: PINK, depth: 800 });
      await wait(200); ok();
      const f2 = flashRect(PINK, 0.8, 240);
      await Promise.all([f1, f2]); ok();
      // 3. the two worlds slide together, tints return to daylight
      const col = { t: 0 };
      this.tweens.add({ targets: col, t: 1, duration: 1500, onUpdate: () => { for (const [f, t] of panels) tintAll(f, lerpTint(t, 0xffffff, col.t)); } });
      this.tweens.add({ targets: tear, alpha: 0, duration: 1300 }); this.tweens.add({ targets: streaks, alpha: 0, duration: 1300 });
      this.tweens.add({ targets: slide, o: 0, duration: 1300, ease: 'Cubic.easeInOut', onUpdate: place });
      // brothers move with their worlds, then run towards each other
      setMyc(jen, this, 'red', 'walk', 'E'); setMyc(sam, this, 'blue', 'walk', 'W');
      await Promise.all([tw({ targets: jen, x: 392, duration: 1500, ease: 'Sine.easeInOut' }), tw({ targets: sam, x: 568, duration: 1500, ease: 'Sine.easeInOut' })]);
      ok();
      tear.destroy(); streaks.forEach(s => s.destroy());
      // 4. they cheer
      setMyc(jen, this, 'red', 'attack', 'E'); setMyc(sam, this, 'blue', 'attack', 'W');
      this.dc.audio.playSfx('ui_confirm');
      for (const [x, y] of [[480, 330], [400, 360], [560, 360]] as const) flip(this, 'vfx/star_explosion', x, y, { scale: 3.5, depth: 20, tint: 0xfff2c4, fps: 20 });
      const crowd: Phaser.GameObjects.Sprite[] = [];
      (['red', 'pink', 'blue'] as const).forEach((c, ci) => {
        if (!this.anims.exists('cut-crowd-' + c)) this.anims.create({ key: 'cut-crowd-' + c, frames: this.anims.generateFrameNumbers('mushrooms/' + c, { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
        for (let n = 0; n < 3; n++) {
          const x = 70 + (ci * 3 + n) * 105 + rand() * 20; if (x > 330 && x < 650) continue;
          const m = this.add.sprite(x, 232 + rand() * 30, 'mushrooms/' + c).setOrigin(0.5, 0.9).setScale(0).setDepth(2);
          m.play({ key: 'cut-crowd-' + c, startFrame: Math.floor(rand() * 8) });
          this.tweens.add({ targets: m, scale: 0.9, duration: 420, delay: 100 + rand() * 500, ease: 'Back.easeOut' });
          crowd.push(m);
        }
      });
      const hop = rm ? 0 : 22;
      if (hop) this.tweens.add({ targets: [jen, sam], y: '-=' + hop, yoyo: true, repeat: 3, duration: 190, ease: 'Quad.easeOut' });
      const em = this.add.particles(W / 2, 330, 'vfx/p_star_04', { speed: { min: 60, max: 220 }, angle: { min: 200, max: 340 }, gravityY: 280, lifespan: 1400, scale: { start: 0.07, end: 0 }, tint: [0xfff2c4, PINK, CYAN], blendMode: 'ADD', emitting: false }).setDepth(30);
      em.explode(rm ? 10 : 34);
      const a = say('jensen_cheer', 900); this.dc.audio.playSfx('pickup');
      await wait(350); ok();
      const b = say('sam_cheer', 900);
      await Promise.all([a, b]); ok();
      // 5. the Time Master, voice only, as a caption
      const c = say('tm_forest_win');
      await c; await wait(450); ok();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      await wait(420); ok();
      this.send({ type: 'CONTINUE' });
    };
    run().catch(() => { /* stopped */ });
  }
}
