import Phaser from 'phaser';
import { DCScene } from '../base';
import { TITLE, TAGLINE } from '../content/lines';
import { makeButton } from '../ui/button';
import { CYAN, ADD, crispFonts, myc, flipAnim } from '../cutscene/kit';

/** Dark cosmic parallax, the logo, two idling mushrooms with a faint anomaly between them. */
export class TitleScene extends DCScene {
  constructor() { super('TitleScene'); }
  private layers: Array<{ t: Phaser.GameObjects.TileSprite; vx: number }> = [];
  private started = false;

  create(): void {
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
    this.add.image(110, 440, 'space/cratered_moon_64').setScale(2).setAlpha(0.8);

    // logo
    const glow = this.add.image(W / 2, 128, 'vfx/p_light_01').setScale(3.6, 1.1).setTint(CYAN).setBlendMode(ADD).setAlpha(0.35);
    this.tweens.add({ targets: glow, alpha: 0.55, yoyo: true, repeat: -1, duration: 2200, ease: 'Sine.easeInOut' });
    const probe = this.txt(0, 0, TITLE, 16, 'Pepper16-Bold'); const k = Math.max(1, Math.floor(820 / probe.width)); probe.destroy();
    const logoGlow = this.txt(W / 2, 118, TITLE, 16, 'Pepper16-Bold', CYAN).setOrigin(0.5).setScale(k).setBlendMode(ADD).setAlpha(0.45);
    this.txt(W / 2 + k, 118 + k, TITLE, 16, 'Pepper16-Bold', 0x0a1c2c).setOrigin(0.5).setScale(k);   // drop shadow
    this.txt(W / 2, 118, TITLE, 16, 'Pepper16-Bold', 0xeafffe).setOrigin(0.5).setScale(k);
    this.tweens.add({ targets: logoGlow, scale: k * 1.04, alpha: 0.2, yoyo: true, repeat: -1, duration: 2200, ease: 'Sine.easeInOut' });
    this.txt(W / 2, 196, TAGLINE, 16, 'Aurora16-Smooth', 0xfff1c9).setOrigin(0.5);

    // anomaly between the brothers
    const vx = this.add.sprite(W / 2, 330, 'vfx/vortex').setScale(1.1).setBlendMode(ADD).setTint(0xe8a0b4).setAlpha(0.5).play(flipAnim(this, 'vfx/vortex', 14, true));
    void vx;
    this.add.sprite(W / 2, 330, 'vfx/wavy_purple').setScale(0.9).setBlendMode(ADD).setAlpha(0.3).play(flipAnim(this, 'vfx/wavy_purple', 10, true));
    const jen = myc(this, 'red', 250, 392, 4, 'E');
    const sam = myc(this, 'blue', 710, 392, 4, 'W');
    this.tweens.add({ targets: [jen, sam], y: '-=4', yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });

    // buttons
    const play = makeButton(this, W / 2 - 190, 458, 'PLAY', () => this.play(), { w: 230, size: 24 });
    const relaxedBtn = makeButton(this, W / 2 + 130, 458, this.relaxedLabel(), () => {
      this.dc.settings.relaxed = !this.dc.settings.relaxed;
      try { localStorage.setItem('oos-dc-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('oos-dc-settings') || '{}'), relaxed: this.dc.settings.relaxed })); } catch { /* ignore */ }
      (relaxedBtn.list[1] as Phaser.GameObjects.BitmapText).setText(this.relaxedLabel());
      const dom = document.getElementById('dc-relaxed'); if (dom) dom.textContent = 'RELAXED MODE: ' + (this.dc.settings.relaxed ? 'ON (takes effect next run)' : 'OFF');
    }, { w: 330, size: 16 });
    this.tweens.add({ targets: play, scale: 1.04, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    this.txt(W / 2, 516, 'Art: Kenney, Brackeys, Void Pixel, Nasha. CC0 / free packs.', 16).setOrigin(0.5).setAlpha(0.8);

    this.input.keyboard?.on('keydown-ENTER', () => this.play());
    this.input.keyboard?.on('keydown-SPACE', () => this.play());
    this.events.once('shutdown', () => { this.input.keyboard?.off('keydown-ENTER'); this.input.keyboard?.off('keydown-SPACE'); });
  }
  private relaxedLabel(): string { return 'RELAXED: ' + (this.dc.settings.relaxed ? 'ON' : 'OFF'); }
  private play(): void { if (this.started) return; this.started = true; this.dc.audio.playSfx('ui_confirm'); this.send({ type: 'START' }); }
  update(_t: number, dt: number): void { for (const l of this.layers) l.t.tilePositionX += (l.vx * dt) / 1000; }
}
