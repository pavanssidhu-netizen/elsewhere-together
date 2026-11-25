// Deterministic PRNG + stable hashing. The game never uses Math.random: every random choice is seeded from these.

/** mulberry32: returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit FNV-1a hash over the string form of all parts. */
export function hash32(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}


export function nodeId(n: number): string {
  return 'N' + String(n).padStart(4, '0');
}
export function eventId(n: number): string {
  return 'E' + String(n).padStart(4, '0');
}
export function echoId(n: number): string {
  return 'C' + String(n).padStart(4, '0');
}
