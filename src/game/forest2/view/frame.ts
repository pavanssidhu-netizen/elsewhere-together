import Phaser from 'phaser';
import { fitText, type Box, type FitOpts } from '../../ui/fit';

/**
 * Parchment inside the 'ui/panel-frame' art, for a frame displayed at w x h and centred on (cx, cy):
 * about 17% from the left/right, 21% from the top, 18% from the bottom. Card text must stay inside this rect.
 */
export function frameInner(cx: number, cy: number, w: number, h: number): Box {
  return { x: cx - w / 2 + w * 0.17, y: cy - h / 2 + h * 0.21, w: w * 0.66, h: h * 0.6 };
}

/** Re-fit a text whose content changes (HUD counters). Skips the work when the string did not change. */
export function setFit(t: Phaser.GameObjects.BitmapText, str: string, box: Box, opts: FitOpts = {}, label = ''): void {
  if (t.getData('fs') === str) return;
  t.setData('fs', str);
  t.setFontSize(opts.max ?? 16);
  fitText(t, str, box, opts, label);
}
