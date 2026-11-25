import Phaser from 'phaser';
import { DCScene } from '../base';
import { TITLE } from '../content/lines';
import { makeButton } from '../ui/button';
import { boxText, noFit } from '../ui/fit';
import { ADD, crispFonts } from '../cutscene/kit';

/** Dark cosmic parallax, the logo, and three buttons. Deliberately ambiguous: no characters, no tagline. */
export class TitleScene extends DCScene {
  constructor() { super('TitleScene'); }
  private layers: Array<{ t: Phaser.GameObjects.TileSprite; vx: number }> = [];
  private started = false;

  create(): void {
    this.started = false; this.layers = [];   // scene instances are reused: a replay must start with live buttons
    crispFonts(this);
    this.cameras.main.setBackgroundColor(0x05060d);
    this.fadeIn(500);
    this.dc.audio.playMusic('cosmic');
    const { W, H } = this;

    this.add.image(W / 2, H / 2, 'space/nebula_violet').setScale(1.5).setAlpha(0.8);
    for (const [k, vx, a] of [['space/starfield_white_far', 4, 0.8], ['space/starfield_white_mid', 9, 0.8], ['space/starfield_white_near', 18, 0.7]] as const) {
      const t = this.add.tileSprite(0, 0, W, H, k).setOrigin(0).setTileScale(1.5).setAlpha(a).setBlendMode(ADD);
      this.layers.push({ t, vx });
    }
    const planet = this.add.image(820, 120, 'space/prop-planet-big').setScale(2.4).setAlpha(0.9);
    this.tweens.add({ targets: planet, y: 132, x: 812, yoyo: true, repeat: -1, duration: 7000, ease: 'Sine.easeInOut' });
    this.add.image(880, 470, 'space/cratered_moon_64').setScale(2).setAlpha(0.8);

    // logo: yellow, with a few warmer additive copies behind it that pulse slowly (static with reduceMotion)
    const YELLOW = 0xffd24a, WARM = 0xff9a1f;
    const probe = this.txt(0, 0, TITLE, 16, 'Pepper16-Bold'); const k = Math.max(1, Math.floor(780 / probe.width)); probe.destroy();
    const LY = 150, reduce = this.dc.settings.reduceMotion;
    const logo = (tint: number) => noFit(this.txt(W / 2, LY, TITLE, 16, 'Pepper16-Bold', tint)).setOrigin(0.5).setScale(k);
    [[1.05, 0.22], [1.1, 0.16], [1.0, 0.3]].forEach(([sc, a], i) => {
      const g = logo(i === 2 ? 0xffb02e : WARM).setBlendMode(ADD).setAlpha(a).setScale(k * sc);
      if (!reduce) this.tweens.add({ targets: g, alpha: a * 0.4, scale: k * (sc + 0.04), yoyo: true, repeat: -1, duration: 1800 + i * 500, ease: 'Sine.easeInOut' });
    });
    logo(YELLOW);

    // buttons: PLAY + RELAXED side by side, DEMO MODE centred below with the arrow note pointing at it
    const play = makeButton(this, W / 2 - 170, 330, 'PLAY', () => this.play(), { w: 300, size: 24 });
    const relaxedBtn = makeButton(this, W / 2 + 170, 330, this.relaxedLabel(), () => {
      this.dc.settings.relaxed = !this.dc.settings.relaxed;
      try { localStorage.setItem('oos-dc-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('oos-dc-settings') || '{}'), relaxed: this.dc.settings.relaxed })); } catch { /* ignore */ }
      (relaxedBtn.list[1] as Phaser.GameObjects.BitmapText).setText(this.relaxedLabel());
      const dom = document.getElementById('dc-relaxed'); if (dom) dom.textContent = 'RELAXED MODE: ' + (this.dc.settings.relaxed ? 'ON (takes effect next run)' : 'OFF');
    }, { w: 300, size: 16 });
    if (!reduce) this.tweens.add({ targets: play, scale: 1.04, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    const DW = 300, DX = W / 2, DY = 435, left = DX - DW / 2;
    makeButton(this, DX, DY, 'DEMO MODE', () => this.demo(), { w: DW, size: 20 });
    boxText(this, 'Aurora16-Smooth', "for lazy people who can't solve puzzles", { x: 24, y: DY - 28, w: left - 24 - 90, h: 56 }, { max: 18, min: 11, align: 'right', valign: 'middle', tint: 0xffffff }, 'demo-note');
    noFit(this.txt(left - 2, DY, '-->', 30, 'Aurora16-Smooth', 0xffffff)).setOrigin(1, 0.5);

    this.input.keyboard?.on('keydown-ENTER', () => this.play());
    this.input.keyboard?.on('keydown-SPACE', () => this.play());
    this.events.once('shutdown', () => { this.input.keyboard?.off('keydown-ENTER'); this.input.keyboard?.off('keydown-SPACE'); });
  }
  private relaxedLabel(): string { return 'RELAXED: ' + (this.dc.settings.relaxed ? 'ON' : 'OFF'); }
  private play(): void { if (this.started) return; this.started = true; this.dc.audio.playSfx('ui_confirm'); this.send({ type: 'START' }); }
  private demo(): void { if (this.started) return; this.started = true; this.dc.audio.playSfx('ui_confirm'); this.send({ type: 'START_DEMO' }); }
  update(_t: number, dt: number): void { for (const l of this.layers) l.t.tilePositionX += (l.vx * dt) / 1000; }
}
