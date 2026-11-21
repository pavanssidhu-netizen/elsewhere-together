// Applies CSS classes derived from real drift/strain bands. Classes only restyle decorative layers;
// they never move hitboxes or buttons, and nothing here animates faster than ~0.5 Hz.
export const band = (v: number, cuts = [30, 60, 80]): number => (v >= cuts[2] ? 3 : v >= cuts[1] ? 2 : v >= cuts[0] ? 1 : 0);

export function applyMeta(root: HTMLElement, drift: number, strain: number, reduce: boolean): void {
  const d = band(drift), s = band(strain);
  const keep = Array.from(root.classList).filter(c => !/^(drift|strain)-b\d$/.test(c) && c !== 'reduce-distortion');
  root.className = keep.join(' ');
  root.classList.add(`drift-b${d}`, `strain-b${s}`);
  if (reduce) root.classList.add('reduce-distortion');
}

export function signalQuality(signal: number, strain: number): 'readable' | 'faint' | 'broken' {
  if (signal <= 0 || strain >= 80) return 'broken';
  if (signal === 1 || strain >= 60) return 'faint';
  return 'readable';
}
