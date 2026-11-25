// @ts-nocheck  (node-only test; the project has no @types/node)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('scripts/dc_audio_manifest.mjs', () => {
  it('manifest script lists only real mp3s, sorted, idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcaud-'));
    for (const k of ['voice', 'music']) mkdirSync(join(dir, k));
    const big = Buffer.alloc(1000, 1);
    writeFileSync(join(dir, 'voice', 'b.mp3'), big); writeFileSync(join(dir, 'voice', 'a.mp3'), big);
    writeFileSync(join(dir, 'voice', 'tiny.mp3'), 'x'); writeFileSync(join(dir, 'voice', 'n.txt'), big); writeFileSync(join(dir, 'music', 'cosmic.mp3'), big);
    const run = () => execFileSync('node', ['scripts/dc_audio_manifest.mjs', dir]).toString();
    expect(run()).toContain('written');
    expect(JSON.parse(readFileSync(join(dir, 'available.json'), 'utf8'))).toEqual({ voice: ['a', 'b'], music: ['cosmic'], sfx: [] });
    expect(run()).toContain('unchanged');
  });
});
