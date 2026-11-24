import Phaser from 'phaser';
import { DCScene } from '../base';
import { DialogueBox } from '../ui/dialogue';
import { makeButton } from '../ui/button';
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
    this.add.image(800, 400, 'kitchen/kitchen_counter_with_a_four_burner_stove_top').setOrigin(0.5, 1).setScale(3.2).setDepth(2);
    this.add.image(830, 302, 'kitchen/whistling_tea_kettle').setOrigin(0.5, 1).setScale(2.4).setDepth(3);
    const kettleSteam = steam(this, 842, 230, 12);
    onShutdown(this, () => kettleSteam.destroy());
    this.add.image(200, 370, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.6).setDepth(2);

    // the vat: a rain barrel with a soup surface
    const bx = 480, bBottom = 410, bScale = 2.7;
    const barrel = this.add.image(bx, bBottom, 'garden/wooden_rain_barrel_under_a_drainpipe').setOrigin(0.5, 1).setScale(bScale).setDepth(20);
    const topY = bBottom - 72 * bScale + 70;
    const soup = this.add.image(bx, topY, 'vfx/p_circle_05').setScale(0.42, 0.14).setTint(0xe0a040).setDepth(10).setAlpha(0.95);
    void barrel;
    const vatSteam = steam(this, bx, topY - 10, 90, 0xffe6b0);
    const bubbles = this.add.particles(bx, topY, 'vfx/p_circle_05', { lifespan: 700, x: { min: -50, max: 50 }, speedY: { min: -50, max: -20 }, scale: { start: 0.03, end: 0.012 }, alpha: { start: 0.9, end: 0 }, frequency: 120, tint: 0xffd890 }).setDepth(30);
    onShutdown(this, () => { vatSteam.destroy(); bubbles.destroy(); });
    this.tweens.add({ targets: soup, scaleY: 0.16, yoyo: true, repeat: -1, duration: 400, ease: 'Sine.easeInOut' });

    // the Time Master, tiny, points
    const wz = wizard(this, 200, 330, 6).setDepth(5);
    this.tweens.add({ targets: wz, y: wz.y - 3, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
    const wiz = wz;

    // the mushroom stands on the right, mostly unaware
    const m = myconid(this, 660, 396, col, 3.4, 2).setDepth(6);

    const dlg = new DialogueBox(this, 452, 700);
    onShutdown(this, () => dlg.dispose());
    void this.run(m, wiz, bx, topY, soup, reduce, dlg);
  }

  private async run(m: Phaser.GameObjects.Sprite, wiz: Phaser.GameObjects.Sprite, bx: number, topY: number, soup: Phaser.GameObjects.Image, reduce: boolean, dlg: DialogueBox): Promise<void> {
    const alive = () => !this.ended && this.scene.isActive();
    await wait(this, 700);
    if (!alive()) return;
    // he points: cast pose + a cyan beam of nonsense toward the mushroom
    wiz.play('wiz:cast');
    this.dc.audio.playSfx('thread_call');
    const zap = flip(this, 'vfx/charge', 290, 300, { scale: 1.1, depth: 40, loop: true, tint: CYAN, alpha: 0.9 });
    const aura = flip(this, 'vfx/wavy_blue', m.x, m.y - 30, { scale: 1.2, depth: 40, loop: true, alpha: 0.7 });
    mycPlay(m, 'hit', 2);
    // float up in an arc over the vat
    const floatMs = reduce ? 600 : 1700;
    this.tweens.add({ targets: m, x: bx, duration: floatMs, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: m, y: 100, scale: 3.8, duration: floatMs, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: aura, x: bx, y: 80, duration: floatMs, ease: 'Sine.easeInOut' });
    if (!reduce) this.tweens.add({ targets: m, angle: { from: -10, to: 10 }, yoyo: true, repeat: 5, duration: 140 });
    await wait(this, floatMs + 400);
    if (!alive()) return;
    // plop
    zap.destroy(); aura.destroy(); wiz.play('wiz:idle'); m.setAngle(0);
    this.tweens.add({ targets: m, y: topY + 28, scale: 2.4, duration: reduce ? 200 : 380, ease: 'Quad.easeIn' });
    await wait(this, reduce ? 220 : 400);
    if (!alive()) return;
    this.dc.audio.playSfx('soup_plop');
    m.setDepth(11).setCrop(0, 0, 64, 40); // only the cap + face above the soup
    shake(this, 200, 0.004);
    const splash = this.add.particles(bx, topY, 'vfx/p_circle_05', { lifespan: 650, speedX: { min: -140, max: 140 }, speedY: { min: -300, max: -120 }, gravityY: 700, scale: { start: 0.05, end: 0.015 }, tint: 0xe0a040, emitting: false }).setDepth(25);
    splash.explode(22);
    this.tweens.add({ targets: soup, scaleX: 0.5, yoyo: true, duration: 160 });
    onShutdown(this, () => splash.destroy());
    // the cap bobs in the bubbling soup
    this.tweens.add({ targets: m, y: m.y + 5, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: m, angle: { from: -4, to: 4 }, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    // a bowl (mug) dips in for a taste
    const mug = this.add.image(bx + 190, 150, 'home/coffee_mug').setScale(3.2).setDepth(40);
    this.tweens.add({ targets: mug, x: bx + 70, y: topY - 14, duration: reduce ? 300 : 900, ease: 'Sine.easeInOut', yoyo: true, hold: 600 });
    await wait(this, reduce ? 800 : 2300);
    if (!alive()) return;

    // reality, repaired. casually.
    await Promise.all([dlg.say('tm_soup_after', { auto: true, holdMs: 900 }), wait(this, 1800)]);
    dlg.hide();
    if (!alive()) return;
    flash(this, 500, 123, 224, 223);
    flip(this, 'vfx/electric_ring', 480, 270, { scale: 6, tint: CYAN, depth: 900 });
    this.dc.audio.playSfx('reunion_chime');
    wiz.play('wiz:blink'); // the tiny wink
    this.tweens.add({ targets: wiz, scale: 7, yoyo: true, duration: 180 });
    await wait(this, 1600);
    if (!alive()) return;
    this.endCard();
  }

  private endCard(): void {
    const d = 2000;
    this.add.rectangle(0, 0, this.W, this.H, 0x060812, 0.82).setOrigin(0).setDepth(d - 1);
    const title = this.add.bitmapText(this.W / 2, 170, 'fonts/Pepper16-Bold', 'SOUP.', 96).setOrigin(0.5).setTint(0xffd890).setDepth(d);
    const sub = this.add.bitmapText(this.W / 2, 262, 'fonts/Aurora16-Smooth', EPITAPH, 16).setOrigin(0.5).setTint(0xf2e8d0).setDepth(d).setMaxWidth(760);
    const again = () => { if (this.ended) return; this.ended = true; this.send({ type: 'REPLAY' }); };
    const btn = makeButton(this, this.W / 2, 390, 'PLAY AGAIN', again, { w: 300, size: 16 }).setDepth(d);
    if (!this.dc.settings.reduceMotion) { for (const o of [title, sub, btn]) o.setAlpha(0); this.tweens.add({ targets: [title, sub, btn], alpha: 1, duration: 500, delay: this.tweens.getTweens().length * 0 }); }
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r') again(); });
    this.events.once('shutdown', () => this.input.keyboard?.removeAllListeners());
  }
}
