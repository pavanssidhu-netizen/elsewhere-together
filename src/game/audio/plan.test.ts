import { describe, expect, it } from 'vitest';
import { LINES, MUSIC_IDS, SFX_IDS } from '../content/lines';
import {
  SFX_DURATIONS, babbleSchedule, drainNotes, looksLikeAudio, musicUrl, sfxUrl, stressMix, stressRampSec, trackSpec, voiceDurationMs, voiceUrl, type Cursor,
} from './plan';
import { buildLinesJson } from '../../../scripts/audio/lines_data';

describe('plan', () => {
  it('voice duration ~55ms/char + 300ms', () => {
    expect(voiceDurationMs('Oh.')).toBe(465);
    expect(voiceDurationMs('x'.repeat(100))).toBe(5800);
  });
  it('urls follow the asset layout', () => {
    expect(musicUrl('cosmic')).toBe('./assets/game/audio/music/cosmic.mp3');
    expect(voiceUrl('tm_start')).toBe('./assets/game/audio/voice/tm_start.mp3');
    expect(sfxUrl('beep')).toBe('./assets/game/audio/sfx/beep.mp3');
  });
  it('rejects the dev server HTML fallback, accepts mp3 headers', () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html>' + ' '.repeat(400)).buffer;
    expect(looksLikeAudio(html, 'text/html')).toBe(false);
    expect(looksLikeAudio(html, null)).toBe(false);
    const mp3 = new Uint8Array(1000); mp3.set([0x49, 0x44, 0x33]);
    expect(looksLikeAudio(mp3.buffer, 'audio/mpeg')).toBe(true);
    expect(looksLikeAudio(new ArrayBuffer(10), null)).toBe(false);
  });
  it('stress mapping: 0 restores, 1 muffles music but keeps voice >= 3.5 kHz', () => {
    const a = stressMix(0), b = stressMix(1), mid = stressMix(0.5);
    expect(a.musicGain).toBe(1); expect(a.musicLpHz).toBeCloseTo(18000); expect(a.detuneCents).toBe(0); expect(a.thin).toBe(1);
    expect(b.musicGain).toBeLessThan(0.5); expect(b.musicLpHz).toBeLessThan(1000); expect(b.thin).toBeLessThan(0.2);
    for (const s of [0, 0.25, 0.5, 0.75, 1, 5, -1, NaN]) expect(stressMix(s).voiceLpHz).toBeGreaterThanOrEqual(3500);
    expect(mid.musicGain).toBeLessThan(a.musicGain); expect(mid.musicGain).toBeGreaterThan(b.musicGain);
    expect(stressRampSec(0, 1)).toBeCloseTo(0.7); expect(stressRampSec(0.5, 0.5)).toBeCloseTo(0.3);
  });
  it('every music id has a distinct, well-formed score', () => {
    const sigs = new Set<string>();
    for (const id of MUSIC_IDS) {
      const s = trackSpec(id);
      expect(s.id).toBe(id);
      expect(s.notes.length).toBeGreaterThan(10);
      for (const n of s.notes) { expect(n.beat).toBeGreaterThanOrEqual(0); expect(n.beat).toBeLessThan(s.beats); expect(n.midi).toBeGreaterThan(0); expect(n.dur).toBeGreaterThan(0); }
      sigs.add(`${s.bpm}:${s.beats}:${new Set(s.notes.map(n => n.inst)).size}`);
    }
    expect(sigs.size).toBe(MUSIC_IDS.length);
    expect(trackSpec('reunion').loop).toBe(false);
  });
  it('scheduler loops seamlessly and stops for non-looping tracks', () => {
    const spec = trackSpec('forest'), cur: Cursor = { i: 0, loop: 0, done: false };
    const a = drainNotes(spec, cur, spec.beats), b = drainNotes(spec, cur, spec.beats * 2);
    expect(a.length).toBe(spec.notes.length); expect(b.length).toBe(spec.notes.length);
    expect(Math.min(...b.map(x => x.abs))).toBeGreaterThanOrEqual(spec.beats);
    const r = trackSpec('reunion'), rc: Cursor = { i: 0, loop: 0, done: false };
    expect(drainNotes(r, rc, 1000).length).toBe(r.notes.length); expect(rc.done).toBe(true);
  });
  it('babble fills the caption-scaled duration and differs per speaker/mood', () => {
    for (const l of LINES) {
      const total = voiceDurationMs(l.text) / 1000, sch = babbleSchedule(l.text, l.who, l.mood);
      expect(sch.length).toBeGreaterThan(0);
      for (const s of sch) { expect(s.t + s.dur).toBeLessThanOrEqual(total); expect(s.dur).toBeGreaterThan(0); }
    }
    const t = 'Of course they have, honestly.';
    const tm = babbleSchedule(t, 'TIME_MASTER'), je = babbleSchedule(t, 'JENSEN');
    expect(tm[0].f0).toBeLessThan(150); expect(je[0].f0).toBeGreaterThan(200);
    expect(babbleSchedule(t, 'SAM', 'urgent').length).toBeGreaterThan(babbleSchedule(t, 'SAM', 'smug').length);
  });
  it('lines.json export covers every line, music and sfx id', () => {
    const j = buildLinesJson();
    expect(j.lines.map(l => l.id)).toEqual(LINES.map(l => l.id));
    expect(j.music.map(m => m.id)).toEqual([...MUSIC_IDS]);
    expect(j.sfx.map(s => s.id)).toEqual([...SFX_IDS]);
    for (const id of SFX_IDS) expect(SFX_DURATIONS[id]).toBeGreaterThan(0);
  });
});
