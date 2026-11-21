/**
 * Art style switch. `?style=scribble|pixel|ink|ink-light` wins (and is remembered); otherwise localStorage; default SCRIBBLE.
 *  - scribble:  (default) Kenney Scribble Dungeons (CC0) graphite sketch on warm paper, smooth-filtered hi-res
 *  - pixel:     original pixel art
 *  - ink:       hand-inked sketch on the dark twilight palette
 *  - ink-light: ink on pale paper (kept for comparison)
 */
export type ArtStyle = 'scribble' | 'pixel' | 'ink' | 'ink-light';
const KEY = 'elsewhere-together-style-v2';
/** Cycle order of the STYLE toggle (Shell: render ART_STYLES for a picker, or call toggleArtStyle()). */
export const ART_STYLES: { id: ArtStyle; label: string }[] = [
  { id: 'scribble', label: 'SCRIBBLE' }, { id: 'pixel', label: 'PIXEL' }, { id: 'ink', label: 'INK' }, { id: 'ink-light', label: 'INK-LIGHT' },
];
const ORDER: ArtStyle[] = ART_STYLES.map(s => s.id);
const valid = (s: string | null): s is ArtStyle => !!s && (ORDER as string[]).includes(s);

function resolve(): ArtStyle {
  try {
    const q = new URLSearchParams(location.search).get('style');
    if (valid(q)) { try { localStorage.setItem(KEY, q); } catch { /* ignore */ } return q; }
    const s = localStorage.getItem(KEY);
    if (valid(s)) return s;
  } catch { /* ignore */ }
  return 'scribble';
}

export const ART_STYLE: ArtStyle = resolve();
export const ART_SCRIBBLE = ART_STYLE === 'scribble';
/** True for every non-pixel style: hi-res smooth canvas (INK_SCALE x logical grid). */
export const ART_INK = ART_STYLE !== 'pixel';
export const ART_LIGHT = ART_STYLE === 'ink-light' || ART_SCRIBBLE;
export const ART_LABEL = ART_STYLES.find(s => s.id === ART_STYLE)!.label;
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('style-ink', ART_INK);
  document.documentElement.classList.toggle('style-light', ART_LIGHT);
  document.documentElement.classList.toggle('style-scribble', ART_SCRIBBLE);
}
/** Internal render scale of the hi-res styles (canvas is INK_SCALE x the 320x180 logical grid). */
export const INK_SCALE = 4;

/** Cycle SCRIBBLE -> PIXEL -> INK -> INK-LIGHT and reload (keeps other URL params such as ?debug=1). */
export function toggleArtStyle(): void {
  const next = ORDER[(ORDER.indexOf(ART_STYLE) + 1) % ORDER.length];
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  const u = new URL(location.href); u.searchParams.set('style', next);
  location.href = u.toString();
}
