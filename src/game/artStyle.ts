/** Art style switch. `?style=ink|pixel` wins (and is remembered); otherwise localStorage; default PIXEL. */
export type ArtStyle = 'pixel' | 'ink';
const KEY = 'elsewhere-together-style-v1';

function resolve(): ArtStyle {
  try {
    const q = new URLSearchParams(location.search).get('style');
    if (q === 'ink' || q === 'pixel') { try { localStorage.setItem(KEY, q); } catch { /* ignore */ } return q; }
    const s = localStorage.getItem(KEY);
    if (s === 'ink' || s === 'pixel') return s;
  } catch { /* ignore */ }
  return 'pixel';
}

export const ART_STYLE: ArtStyle = resolve();
export const ART_INK = ART_STYLE === 'ink';
if (typeof document !== 'undefined') document.documentElement.classList.toggle('style-ink', ART_INK);
/** Internal render scale of the INK style (textures and canvas are INK_SCALE x the 320x180 logical grid). */
export const INK_SCALE = 4;

/** Switch style and reload (keeps other URL params such as ?debug=1). */
export function toggleArtStyle(): void {
  const next: ArtStyle = ART_INK ? 'pixel' : 'ink';
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  const u = new URL(location.href); u.searchParams.set('style', next);
  location.href = u.toString();
}
