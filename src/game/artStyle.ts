/**
 * Art style switch. `?style=ink|ink-light|pixel` wins (and is remembered); otherwise localStorage; default PIXEL.
 *  - pixel:     original pixel art
 *  - ink:       hand-inked sketch on the dark twilight palette (default INK look)
 *  - ink-light: the first INK variant, ink on pale paper (kept for comparison)
 */
export type ArtStyle = 'pixel' | 'ink' | 'ink-light';
const KEY = 'elsewhere-together-style-v1';
const ORDER: ArtStyle[] = ['pixel', 'ink', 'ink-light'];
const valid = (s: string | null): s is ArtStyle => !!s && (ORDER as string[]).includes(s);

function resolve(): ArtStyle {
  try {
    const q = new URLSearchParams(location.search).get('style');
    if (valid(q)) { try { localStorage.setItem(KEY, q); } catch { /* ignore */ } return q; }
    const s = localStorage.getItem(KEY);
    if (valid(s)) return s;
  } catch { /* ignore */ }
  return 'pixel';
}

export const ART_STYLE: ArtStyle = resolve();
export const ART_INK = ART_STYLE !== 'pixel';
export const ART_LIGHT = ART_STYLE === 'ink-light';
export const ART_LABEL = ART_STYLE === 'pixel' ? 'PIXEL' : ART_LIGHT ? 'INK-LIGHT' : 'INK';
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('style-ink', ART_INK);
  document.documentElement.classList.toggle('style-light', ART_LIGHT);
}
/** Internal render scale of the INK style (textures and canvas are INK_SCALE x the 320x180 logical grid). */
export const INK_SCALE = 4;

/** Cycle PIXEL -> INK -> INK-LIGHT and reload (keeps other URL params such as ?debug=1). */
export function toggleArtStyle(): void {
  const next = ORDER[(ORDER.indexOf(ART_STYLE) + 1) % ORDER.length];
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  const u = new URL(location.href); u.searchParams.set('style', next);
  location.href = u.toString();
}
