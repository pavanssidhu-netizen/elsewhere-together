// Scans public/assets/dc/audio/{voice,music,sfx} and writes available.json = { voice, music, sfx } (sorted ids of real .mp3 files).
// Idempotent: the file is only rewritten when the content changes. Usage: node scripts/dc_audio_manifest.mjs [audioDir]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_BYTES = 256; // anything smaller is a stub/truncated download
export function buildManifest(dir) {
  const out = {};
  for (const kind of ['voice', 'music', 'sfx']) {
    const d = join(dir, kind);
    out[kind] = !existsSync(d) ? [] : readdirSync(d)
      .filter(f => f.endsWith('.mp3') && /^[A-Za-z0-9_-]+\.mp3$/.test(f) && statSync(join(d, f)).size >= MIN_BYTES)
      .map(f => f.slice(0, -4)).sort();
  }
  return out;
}
export function writeManifest(dir) {
  const text = JSON.stringify(buildManifest(dir)) + '\n', file = join(dir, 'available.json');
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text);
  return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'dc', 'audio'));
  const changed = writeManifest(dir), m = JSON.parse(readFileSync(join(dir, 'available.json'), 'utf8'));
  console.log(`available.json ${changed ? 'written' : 'unchanged'}: voice ${m.voice.length}, music ${m.music.length}, sfx ${m.sfx.length}`);
}
