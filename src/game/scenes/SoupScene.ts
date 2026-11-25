import Phaser from 'phaser';
import { DCScene } from '../base';
import { DialogueBox } from '../ui/dialogue';
import { makeButton } from '../ui/button';
import { boxText } from '../ui/fit';
import { CYAN, colourOf, flash, flip, myconid, mycPlay, onShutdown, shake, steam, wait, wizard } from '../office/fx';

const EPITAPH = 'Two mushrooms broke time. One of them was delicious.';

/** SOUP_ENDING: the refusal ending. Comic mushroom soup, a casually repaired reality, then an end card. */
export class SoupScene extends DCScene {
  private ended = false;
  constructor() { super('SoupScene'); }

  create(): void {
    this.ended = false;
    this.fadeIn(300);
    const reduce = this.dc.settings.reduceMotion;
    const col = colourOf(this.snap?.character);
    this.dc.audio.playMusic('office', { fadeMs: 500 });

    // kitchen-ish corner of the same office: wallpaper, floor, a stove with a whistling kettle
    this.add.tileSprite(0, 0, this.W, 230, 'tiles/wallpaper_cream_stripes').setOrigin(0).setTileScale(2);
    this.add.tileSprite(0, 230, this.W, this.H - 230, 'tiles/wood_planks_light').setOrigin(0).setTileScale(2).setTint(0x8c7c6c);
    this.add.image(850, 400, 'kitchen/kitchen_counter_with_a_four_burner_stove_top').setOrigin(0.5, 1).setScale(3.2).setDepth(2);
    this.add.image(880, 302, 'kitchen/whistling_tea_kettle').setOrigin(0.5, 1).setScale(2.4).setDepth(3);
    const kettleSteam = steam(this, 892, 230, 12);
    onShutdown(this, () => kettleSteam.destroy());

    // THE VAT: barrel_of_pickles (35x44 sprite; its opening is the ellipse centred on sprite px (17.5, 6.5), 21x7 px inside the rim)
    const bx = 480, bBottom = 430, k = 6, D = { back: 10, soup: 11, fx: 12, mush: 13, front: 14 };
    const px = (r: number) => bBottom - (44 - r) * k;          // world y of sprite row r
    const surfY = px(6.5), rx = 10.5 * k, ry = 3.5 * k;
    this.add.image(bx, bBottom, 'food/barrel_of_pickles').setOrigin(0.5, 1).setScale(k).setDepth(D.back);
    // soup surface: two imported tiles (orange planks + green lawn flecks) clipped to the opening ellipse
    const eg = this.make.graphics({}, false); eg.fillStyle(0xffffff).fillEllipse(bx, surfY, rx * 2, ry * 2);
    const em = eg.createGeometryMask();
    const base = this.add.tileSprite(bx, surfY, rx * 2 + 4, ry * 2 + 4, 'tiles/wood_planks_light').setTileScale(2).setTint(0xff6c18).setDepth(D.soup); base.setMask(em);
    const herbs = this.add.tileSprite(bx, surfY, rx * 2 + 4, ry * 2 + 4, 'tiles/front_lawn').setTileScale(2).setTint(0x9cf060).setAlpha(0.32).setDepth(D.soup + 0.1); herbs.setMask(em);
    const shine = this.add.tileSprite(bx, surfY, rx * 2 + 4, ry * 2 + 4, 'tiles/front_lawn').setTileScale(3).setTint(0xffd070).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.soup + 0.2); shine.setMask(em);
    if (!reduce) this.tweens.add({ targets: [herbs, shine], tilePositionX: { from: 0, to: 64 }, tilePositionY: { from: 0, to: 20 }, duration: 5200, repeat: -1 });
    // front rim + body of the barrel redrawn ABOVE the mushroom (rows 8+): whatever sinks is hidden behind it
    this.add.image(bx, bBottom, 'food/barrel_of_pickles').setOrigin(0.5, 1).setScale(k).setDepth(D.front).setCrop(0, 8, 35, 36);
    const vat = new Phaser.Geom.Rectangle(bx - 17.5 * k, bBottom - 44 * k, 35 * k, 44 * k);

    const vatSteam = steam(this, bx, surfY - 8, 2 * rx - 20, 0xffe6b0).setDepth(D.front + 1);
    const bubbles = this.add.particles(0, 0, 'vfx/p_circle_05', { lifespan: 650, x: { min: bx - rx + 14, max: bx + rx - 14 }, y: { min: surfY - 8, max: surfY + 8 }, speedY: { min: -34, max: -12 }, scale: { start: 0.02, end: 0.06 }, alpha: { start: 0.9, end: 0 }, frequency: 140, tint: 0xfff0b0 }).setDepth(D.fx);
    onShutdown(this, () => { vatSteam.destroy(); bubbles.destroy(); eg.destroy(); });
    // a few bubbles that rise and pop (a ring flashes where they burst)
    this.time.addEvent({ delay: 380, loop: true, callback: () => {
      const bxp = bx + (Math.sin(this.time.now * 0.013) * 0.8) * (rx - 16), by = surfY + Math.cos(this.time.now * 0.021) * (ry - 6);
      const b = this.add.image(bxp, by, 'vfx/p_circle_05').setScale(0.015).setTint(0xfff0b0).setDepth(D.fx);
      this.tweens.add({ targets: b, scale: 0.05, y: by - 10, duration: 420, onComplete: () => { b.setAlpha(0.9); this.tweens.add({ targets: b, scale: 0.09, alpha: 0, duration: 140, onComplete: () => b.destroy() }); } });
    } });

    // the Time Master, tiny, stands left of the vat; a bowl of the same stuff waits on the floor
    this.add.image(335, 430, 'food/bowl_of_cake_batter').setOrigin(0.5, 1).setScale(3.4).setDepth(12).setTint(0xffb860);
    const wz = wizard(this, 170, 420, 6).setDepth(5);
    this.tweens.add({ targets: wz, y: wz.y - 3, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });

    // the mushroom stands on the right, mostly unaware
    const m = myconid(this, 690, 420, col, 2.6, 2).setDepth(D.mush);
    this.dbg = { m, vat, surfY, depthMush: D.mush, bx, rx, ry, k, lowered: false, phase: 'idle' };

    const dlg = new DialogueBox(this, 452, 700);
    onShutdown(this, () => dlg.dispose());
    void this.run(m, wz, bx, surfY, rx, ry, reduce, dlg);
  }

  /** Test hook: where the mushroom/vat are and whether the clip mask is on. */
  dbg!: { m: Phaser.GameObjects.Sprite; vat: Phaser.Geom.Rectangle; surfY: number; depthMush: number; bx: number; rx: number; ry: number; k: number; lowered: boolean; phase: string };

  private async run(m: Phaser.GameObjects.Sprite, wiz: Phaser.GameObjects.Sprite, bx: number, surfY: number, rx: number, ry: number, reduce: boolean, dlg: DialogueBox): Promise<void> {
    const alive = () => !this.ended && this.scene.isActive();
    const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => new Promise<void>(res => this.tweens.add({ ...cfg, onComplete: () => res() }));
    const d = this.dbg; const s = m.scale;
    await wait(this, 800);
    if (!alive()) return;
    // he points: cast pose + a cyan zap toward the mushroom
    d.phase = 'lift';
    wiz.play('wiz:cast');
    this.dc.audio.playSfx('thread_call');
    const zap = flip(this, 'vfx/charge', 250, 380, { scale: 1.1, depth: 40, loop: true, tint: CYAN, alpha: 0.9 });
    const aura = flip(this, 'vfx/wavy_blue', m.x, m.y - 30, { scale: 1.2, depth: 40, loop: true, alpha: 0.7 });
    mycPlay(m, 'hit', 2);
    m.setDepth(30);                      // while it travels it is in FRONT of everything, never behind the vat
    const up = reduce ? 300 : 900, across = reduce ? 300 : 900;
    const floatY = 125;
    if (!reduce) this.tweens.add({ targets: m, angle: { from: -10, to: 10 }, yoyo: true, repeat: 5, duration: 140 });
    this.tweens.add({ targets: aura, y: floatY - 30, duration: up, ease: 'Sine.easeOut' });
    await tw({ targets: m, y: floatY, duration: up, ease: 'Sine.easeOut' });          // straight up, clear of the vat (x=690)
    this.tweens.add({ targets: aura, x: bx, duration: across, ease: 'Sine.easeInOut' });
    await tw({ targets: m, x: bx, duration: across, ease: 'Sine.easeInOut' });        // then across, high above the opening
    if (!alive()) return;
    // hover over the vat (still visible, wobbling), clip mask on from now on: nothing below the soup line is ever drawn
    const mg = this.make.graphics({}, false); mg.fillStyle(0xffffff).fillRect(0, 0, this.W, surfY);
    m.setMask(mg.createGeometryMask()); onShutdown(this, () => mg.destroy());
    m.setDepth(d.depthMush); m.setAngle(0); d.lowered = true; d.phase = 'hover';
    await wait(this, reduce ? 200 : 700);
    if (!alive()) return;
    // lowered into the soup: the bottom of the sprite slides below the surface line and is clipped; the front rim hides the rest
    zap.destroy(); aura.destroy(); wiz.play('wiz:idle');
    const capY = surfY + 17 * s;         // sprite row 25 (lower cap edge) sits on the surface
    d.phase = 'sink';
    await tw({ targets: m, y: capY + 4, duration: reduce ? 250 : 900, ease: 'Quad.easeIn' });
    if (!alive()) return;
    d.phase = 'plop';
    this.dc.audio.playSfx('soup_plop');
    shake(this, 200, 0.004);
    const splash = this.add.particles(bx, surfY, 'vfx/p_circle_05', { lifespan: 650, speedX: { min: -120, max: 120 }, speedY: { min: -260, max: -110 }, gravityY: 700, scale: { start: 0.035, end: 0.01 }, tint: 0xffa030, emitting: false }).setDepth(15);
    splash.explode(22);
    onShutdown(this, () => splash.destroy());
    // ripples spread across the surface
    for (let i = 0; i < 3; i++) {
      const r = this.add.image(bx, surfY, 'vfx/p_circle_05').setTint(0xfff0b0).setAlpha(0.8).setScale(0.02, 0.007).setDepth(12.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: r, scaleX: (2 * rx * 0.95) / 512, scaleY: (2 * ry * 0.95) / 512, alpha: 0, duration: 1100, delay: i * 260, ease: 'Sine.easeOut', onComplete: () => r.destroy() });
    }
    // only the cap remains, bobbing
    mycPlay(m, 'idle', 0);
    this.tweens.add({ targets: m, y: capY - 2, duration: 160, ease: 'Quad.easeOut', onComplete: () => {
      this.tweens.add({ targets: m, y: capY + 4, yoyo: true, repeat: -1, duration: 620, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: m, angle: { from: -3, to: 3 }, yoyo: true, repeat: -1, duration: 760, ease: 'Sine.easeInOut' });
    } });
    d.phase = 'bob';
    wiz.play('wiz:cast');                // points at the soup
    await wait(this, reduce ? 900 : 2800);
    if (!alive()) return;
    wiz.play('wiz:idle');

    // reality, repaired. casually.
    await Promise.all([dlg.say('tm_soup_after', { auto: true, holdMs: 900 }), wait(this, 2200)]);
    dlg.hide();
    if (!alive()) return;
    flash(this, 500, 123, 224, 223);
    flip(this, 'vfx/electric_ring', 480, 270, { scale: 6, tint: CYAN, depth: 900 });
    this.dc.audio.playSfx('reunion_chime');
    wiz.play('wiz:blink'); // the tiny wink
    this.tweens.add({ targets: wiz, scale: 7, yoyo: true, duration: 180 });
    await wait(this, 1600);
    if (!alive()) return;
    d.phase = 'card';
    this.endCard();
  }

  private endCard(): void {
    const d = 2000;
    this.add.rectangle(0, 0, this.W, this.H, 0x060812, 0.82).setOrigin(0).setDepth(d - 1);
    const title = boxText(this, 'Pepper16-Bold', 'SOUP.', { x: this.W / 2 - 320, y: 100, w: 640, h: 110 }, { max: 96, min: 40, align: 'center', valign: 'middle', tint: 0xffd890, depth: d }, 'soup-title');
    const sub = boxText(this, 'Aurora16-Smooth', EPITAPH, { x: this.W / 2 - 380, y: 240, w: 760, h: 56 }, { max: 20, min: 12, align: 'center', tint: 0xf2e8d0, depth: d }, 'soup-epitaph');
    const again = () => { if (this.ended) return; this.ended = true; this.send({ type: 'REPLAY' }); };
    const btn = makeButton(this, this.W / 2, 390, 'PLAY AGAIN', again, { w: 300, size: 16 }).setDepth(d);
    if (!this.dc.settings.reduceMotion) { for (const o of [title, sub, btn]) o.setAlpha(0); this.tweens.add({ targets: [title, sub, btn], alpha: 1, duration: 500, delay: this.tweens.getTweens().length * 0 }); }
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r') again(); });
    this.events.once('shutdown', () => this.input.keyboard?.removeAllListeners());
  }
}
