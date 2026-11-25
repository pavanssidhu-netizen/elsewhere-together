import { describe, expect, it } from 'vitest';
import { LINES, MUSIC_IDS, SFX_IDS } from '../content/lines';
import {
  EMPTY_MANIFEST, MUSIC_DURATIONS_SEC, SFX_DURATIONS, equalPowerCurve, hasFile, loopCrossfadeSec, loopPassStart, parseManifest, trackSpec,
} from './plan';
import { createDCAudio, getDCAudioDebug } from './dcAudio';

describe('manifest parsing and gating', () => {
  it('accepts a valid manifest', () => {
    const m = parseManifest('{"voice":["tm_intro_1"],"music":["cosmic"],"sfx":[]}');
    expect(hasFile(m, 'voice', 'tm_intro_1')).toBe(true);
    expect(hasFile(m, 'music', 'cosmic')).toBe(true);
    expect(hasFile(m, 'music', 'forest')).toBe(false);
    expect(hasFile(m, 'voice', 'cosmic')).toBe(false);
  });
  it('treats junk as nothing available and never throws', () => {
    for (const bad of ['', '<!doctype html>', 'null', '[]', '{"voice":"x"}', 42, null, undefined, '{"voice":[1,null,"../x","a/b"]}']) {
      const m = parseManifest(bad as unknown);
      expect(m.voice.size + m.music.size + m.sfx.size).toBe(0);
    }
    expect(parseManifest('{').voice).toBe(EMPTY_MANIFEST.voice);
  });
});

describe('loop scheduling math', () => {
  it('overlaps the tail of pass k with the head of pass k+1 by exactly the crossfade', () => {
    for (const D of [20, 30, 40, 3]) {
      const x = loopCrossfadeSec(D);
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThanOrEqual(1.25); expect(x).toBeLessThanOrEqual(D / 4);
      const s0 = loopPassStart(10, 0, D, x), s1 = loopPassStart(10, 1, D, x), s2 = loopPassStart(10, 2, D, x);
      expect(s0 + D - s1).toBeCloseTo(x); // overlap
      expect(s2 - s1).toBeCloseTo(D - x); // steady period
    }
    expect(loopCrossfadeSec(40)).toBeGreaterThanOrEqual(1.0);
  });
  it('equal-power curves sum to constant power', () => {
    const a = equalPowerCurve(33, 'in'), b = equalPowerCurve(33, 'out');
    for (let i = 0; i < 33; i++) expect(a[i] ** 2 + b[i] ** 2).toBeCloseTo(1, 5);
    expect(a[0]).toBeCloseTo(0); expect(a[32]).toBeCloseTo(1); expect(b[0]).toBeCloseTo(1); expect(b[32]).toBeCloseTo(0);
  });
});

describe('ids are complete', () => {
  it('every music id has a synth score and a duration; every sfx id a duration', () => {
    for (const id of MUSIC_IDS) { expect(trackSpec(id).id).toBe(id); expect(MUSIC_DURATIONS_SEC[id]).toBeGreaterThan(0); }
    for (const id of SFX_IDS) expect(SFX_DURATIONS[id]).toBeGreaterThan(0);
    expect(MUSIC_IDS).toContain('forest_tense'); expect(SFX_IDS).toContain('fail_sting');
    for (const id of ['tm_fail1_1', 'tm_jab1_1']) expect(LINES.some(l => l.id.startsWith(id.slice(0, -1)))).toBe(true);
  });
  it('forest_tense is minor, faster than forest and slower than final_minute', () => {
    const f = trackSpec('forest'), t = trackSpec('forest_tense'), m = trackSpec('final_minute');
    expect(t.bpm).toBeGreaterThan(f.bpm); expect(t.bpm).toBeLessThan(m.bpm);
    const insts = new Set(t.notes.map(n => n.inst));
    expect(insts.has('timp')).toBe(true); expect(insts.has('strings')).toBe(true);
    expect(t.notes.some(n => n.inst === 'pluck' && n.midi === 76)).toBe(false); // no major third (E natural) in the melody
    expect(new Set(m.notes.map(n => n.inst))).toContain('kick');
  });
});

describe('fallback selection without Web Audio', () => {
  it('voice with no file or context resolves (synth pacing), high priority is not cut by normal', async () => {
    const a = createDCAudio({ relaxed: false, reduceMotion: false, muted: false, music: 1, voice: 1, sfx: 1 });
    const hi = a.playVoice('tm_intro_4', { priority: 'high' });
    const t0 = Date.now(); await a.playVoice('tm_intro_3'); // dropped at once
    expect(Date.now() - t0).toBeLessThan(100);
    expect(getDCAudioDebug()!.voiceId).toBe('tm_intro_4');
    await hi;
    expect(getDCAudioDebug()!.manifest).toBeNull(); // nothing fetched before unlock
  });
});
