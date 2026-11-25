import Phaser from 'phaser';
import type { DCScene } from '../base';

export interface ButtonOpts { w?: number; font?: string; size?: number; tint?: number; sfx?: boolean }
/** Pixel-art menu button from the imported UI pack. Keyboard users: call .setData('focus') yourself; touch + mouse work out of the box (>=44px). */
export function makeButton(scene: DCScene, x: number, y: number, label: string, onClick: () => void, o: ButtonOpts = {}): Phaser.GameObjects.Container {
  const w = o.w ?? 260;
  const img = scene.add.image(0, 0, 'ui/button-normal');
  const k = w / img.width; img.setScale(k);
  const h = img.height * k;
  const t = scene.add.bitmapText(0, -2, 'fonts/' + (o.font ?? 'Aurora16-Smooth'), label, o.size ?? 16).setOrigin(0.5).setTint(o.tint ?? 0xfff1c9).setData('nofit', true);
  // the label must sit inside the dark centre of the button art: shrink it until it fits (never overflow the frame)
  const maxW = w * 0.7; let fs = o.size ?? 16;
  while (t.width > maxW && fs > 9) { fs -= 1; t.setFontSize(fs); }
  const c = scene.add.container(x, y, [img, t]).setSize(w, Math.max(h, 44));
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { img.setTexture('ui/button-hover'); c.setScale(1.03); });
  c.on('pointerout', () => { img.setTexture('ui/button-normal'); c.setScale(1); });
  c.on('pointerdown', () => { img.setTexture('ui/button-pressed'); });
  c.on('pointerup', () => { img.setTexture('ui/button-hover'); if (o.sfx !== false) scene.dc.audio.playSfx('ui_click'); onClick(); });
  return c;
}
