import Phaser from 'phaser';

/** A text box on screen in GAME coordinates (960x540). Origin is the top-left corner of the area text must stay inside. */
export interface Box { x: number; y: number; w: number; h: number }
export interface FitOpts { max?: number; min?: number; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' }

interface Reg { t: Phaser.GameObjects.BitmapText; box: Box; label: string; scene: Phaser.Scene }
const REG: Reg[] = [];

/**
 * Wrap + shrink a BitmapText so it lies INSIDE `box` (never beyond it). Returns the final wrapped string. Registers the text for the
 * runtime audit (window.__dc.auditText()). The text keeps its font; only the size is reduced (down to opts.min, then it is clipped by
 * dropping the tail with an ellipsis so it still never leaves the box).
 */
export function fitText(t: Phaser.GameObjects.BitmapText, full: string, box: Box, opts: FitOpts = {}, label = ''): string {
  const max = opts.max ?? 16, min = opts.min ?? 10;
  const align = opts.align ?? 'left';
  t.setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, opts.valign === 'middle' ? 0.5 : 0);
  if (align === 'center') t.setCenterAlign(); else if (align === 'right') t.setRightAlign(); else t.setLeftAlign();
  let wrapped = full, size = max;
  const measure = (s: number, str: string): { w: number; h: number; wrapped: string } => {
    t.setFontSize(s); t.setMaxWidth(box.w); t.setText(str);
    const b = t.getTextBounds(true);
    return { w: b.global.width, h: b.global.height, wrapped: (b as unknown as { wrappedText?: string }).wrappedText ?? str };
  };
  let m = measure(size, full);
  while ((m.h > box.h || m.w > box.w + 0.5) && size > min) { size -= 1; m = measure(size, full); }
  wrapped = m.wrapped;
  if (m.h > box.h || m.w > box.w + 0.5) { // still too big at min size: drop words from the tail
    const words = full.split(/\s+/);
    while (words.length > 1 && (m.h > box.h || m.w > box.w + 0.5)) { words.pop(); m = measure(size, words.join(' ') + '...'); }
    wrapped = m.wrapped;
  }
  t.setMaxWidth(0); t.setText(wrapped);                                   // pre-wrapped: typing/reveal never re-wraps
  const x = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  const y = opts.valign === 'middle' ? box.y + box.h / 2 : box.y;
  t.setPosition(x, y);
  REG.push({ t, box, label, scene: t.scene });
  return wrapped;
}

/** Create + fit in one call. */
export function boxText(scene: Phaser.Scene, font: string, str: string, box: Box, opts: FitOpts & { tint?: number; depth?: number } = {}, label = ''): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(box.x, box.y, 'fonts/' + font, '', opts.max ?? 16);
  if (opts.tint !== undefined) t.setTint(opts.tint);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  fitText(t, str, box, opts, label);
  return t;
}

/** Typewriter that reveals an ALREADY wrapped string char by char (no reflow). Returns the timer; call .remove() to stop. */
export function typeInto(scene: Phaser.Scene, t: Phaser.GameObjects.BitmapText, wrapped: string, msPerChar: number, onDone: () => void): Phaser.Time.TimerEvent | null {
  if (!msPerChar) { t.setText(wrapped); onDone(); return null; }
  let i = 0;
  const ev = scene.time.addEvent({ delay: msPerChar, repeat: wrapped.length, callback: () => { i++; t.setText(wrapped.slice(0, i)); if (i >= wrapped.length) { ev.remove(); onDone(); } } });
  return ev;
}

export interface TextAuditIssue { scene: string; label: string; text: string; reason: string; bounds: { x: number; y: number; w: number; h: number }; box?: Box }
/** Every registered text must lie inside its box; every VISIBLE bitmap text must lie inside the 960x540 canvas. Used by tests and QA. */
export function auditText(game: Phaser.Game): TextAuditIssue[] {
  const out: TextAuditIssue[] = [];
  const W = 960, H = 540, eps = 1.5;
  for (const r of REG) {
    if (!r.t.scene || !r.t.active || !r.t.visible || !r.scene.scene.isActive()) continue;
    const b = r.t.getBounds();
    if (b.x < r.box.x - eps || b.y < r.box.y - eps || b.right > r.box.x + r.box.w + eps || b.bottom > r.box.y + r.box.h + eps)
      out.push({ scene: r.scene.scene.key, label: r.label, text: r.t.text.slice(0, 40), reason: 'outside its box', bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, box: r.box });
  }
  const fitted = new Set(REG.map(r => r.t));
  for (const sc of game.scene.getScenes(true)) for (const o of sc.children.list as Phaser.GameObjects.GameObject[]) walk(o, sc.scene.key);
  function walk(o: Phaser.GameObjects.GameObject, key: string): void {
    const c = o as Phaser.GameObjects.Container;
    if (c.list) for (const k of c.list) walk(k, key);
    if (o.type !== 'BitmapText') return;
    const t = o as Phaser.GameObjects.BitmapText;
    if (!t.visible || t.alpha < 0.05 || !t.text) return;
    const wb0 = t.getBounds();
    if (!fitted.has(t) && !t.getData('nofit')) out.push({ scene: key, label: 'unfitted', text: t.text.slice(0, 40), reason: 'text not fitted to a box (use boxText/fitText, or t.setData(\'nofit\', true) for a deliberately free label)', bounds: { x: wb0.x, y: wb0.y, w: wb0.width, h: wb0.height } });
    const cam = t.scene.cameras.main; if (cam.zoom !== 1 || cam.scrollX || cam.scrollY) return;      // scrolling/zoomed cameras: skip
    const wb = t.getBounds(); const x0 = wb.x, y0 = wb.y, x1 = wb.right, y1 = wb.bottom;
    if (x0 < -eps || y0 < -eps || x1 > W + eps || y1 > H + eps) out.push({ scene: key, label: 'canvas', text: t.text.slice(0, 40), reason: 'outside the canvas', bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  }
  return out;
}
/** Mark a text as a deliberately free-form label (still must stay inside the canvas). */
export const noFit = <T extends Phaser.GameObjects.BitmapText>(t: T): T => { t.setData('nofit', true); return t; };
export const clearTextRegistry = (): void => { REG.length = 0; };
