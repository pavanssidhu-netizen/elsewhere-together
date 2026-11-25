// Pure (no Web Audio) parts of the DC audio: urls, durations, bus/stress mapping, synth score data, voice babble schedule.
import { LINE_BY_ID, type Line, type MusicId, type SfxId } from '../content/lines';

export const AUDIO_BASE = './assets/dc/audio';
export const musicUrl = (id: string): string => `${AUDIO_BASE}/music/${id}.mp3`;
export const voiceUrl = (id: string): string => `${AUDIO_BASE}/voice/${id}.mp3`;
export const sfxUrl = (id: string): string => `${AUDIO_BASE}/sfx/${id}.mp3`;

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Stand-in voice length: about 55 ms per caption character + 300 ms. */
export const voiceDurationMs = (text: string): number => Math.round(text.length * 55 + 300);

/** True when fetched bytes look like an audio file rather than the dev server's HTML fallback page. */
export function looksLikeAudio(bytes: ArrayBuffer, contentType?: string | null): boolean {
  if (bytes.byteLength < 256) return false;
  if (contentType && /text\/html/i.test(contentType)) return false;
  const u = new Uint8Array(bytes, 0, 16);
  const ascii = String.fromCharCode(...u).toLowerCase();
  if (ascii.startsWith('<') || ascii.includes('<!doc') || ascii.includes('<html')) return false;
  const id3 = ascii.startsWith('id3');
  const frameSync = u[0] === 0xff && (u[1] & 0xe0) === 0xe0;
  const riff = ascii.startsWith('riff') || ascii.startsWith('ogg') || ascii.startsWith('flac');
  return id3 || frameSync || riff;
}

/** Bond stress 0..1 -> music/voice/sfx shaping. Voice stays >= 3.5 kHz lowpass, sfx untouched. */
export interface StressMix { musicGain: number; musicLpHz: number; detuneCents: number; thin: number; voiceLpHz: number }
export function stressMix(stress: number): StressMix {
  const s = clamp(stress, 0, 1);
  return {
    musicGain: 1 - 0.55 * s,
    musicLpHz: 18000 * Math.pow(900 / 18000, s),   // 18 kHz (open) -> 900 Hz (muffled), exponential
    detuneCents: 28 * s * s,
    thin: 1 - 0.85 * s,                            // sparkle/upper layers fade out
    voiceLpHz: 16000 - (16000 - 3600) * s,
  };
}
/** Ramp time grows a little with the size of the change (0.3..0.7 s). */
export const stressRampSec = (from: number, to: number): number => 0.3 + 0.4 * clamp(Math.abs(to - from), 0, 1);

// ---------- Voice stand-in (formant babble) ----------
export interface VoiceProfile { f0: number; formantScale: number; syllableMs: number; wobble: number; bubble: number; wave: OscillatorType; vowelBias: number }
const PROFILES: Record<Line['who'], VoiceProfile> = {
  TIME_MASTER: { f0: 92, formantScale: 0.82, syllableMs: 150, wobble: 0.04, bubble: 0, wave: 'sawtooth', vowelBias: 0 },
  JENSEN: { f0: 300, formantScale: 1.18, syllableMs: 105, wobble: 0.1, bubble: 0.35, wave: 'triangle', vowelBias: 2 },
  SAM: { f0: 215, formantScale: 1.02, syllableMs: 125, wobble: 0.14, bubble: 0.15, wave: 'sawtooth', vowelBias: 1 },
};
const MOODS: Record<string, { pitch: number; tempo: number; wobble: number }> = {
  serious: { pitch: 1, tempo: 1, wobble: 0 },
  sarcastic: { pitch: 0.97, tempo: 0.92, wobble: 0.03 },
  urgent: { pitch: 1.08, tempo: 1.3, wobble: 0.03 },
  smug: { pitch: 0.95, tempo: 0.88, wobble: 0.02 },
  crying: { pitch: 1.1, tempo: 0.95, wobble: 0.35 },
  cheery: { pitch: 1.06, tempo: 1.1, wobble: 0.02 },
};
export const profileFor = (who: Line['who'], mood: Line['mood'] = 'serious'): VoiceProfile & { mood: string } => {
  const p = PROFILES[who] ?? PROFILES.SAM, m = MOODS[mood] ?? MOODS.serious;
  return { ...p, f0: p.f0 * m.pitch, syllableMs: p.syllableMs / m.tempo, wobble: p.wobble + m.wobble, mood };
};

// vowel formants F1,F2 (Hz)
const VOWELS: [number, number][] = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1720]];
export interface Syllable { t: number; dur: number; f0: number; f0End: number; f1: number; f2: number; amp: number }

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Deterministic syllable schedule filling exactly voiceDurationMs(text) (times in seconds). Punctuation makes pauses. */
export function babbleSchedule(text: string, who: Line['who'], mood: Line['mood'] = 'serious'): Syllable[] {
  const p = profileFor(who, mood);
  const total = voiceDurationMs(text) / 1000;
  let seed = hashStr(text + who);
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const out: Syllable[] = [];
  const syl = p.syllableMs / 1000;
  let t = 0.04, chars = 0, phrasePos = 0;
  const end = total - 0.12;
  while (t < end) {
    const ch = text[Math.min(text.length - 1, Math.floor((t / total) * text.length))] ?? ' ';
    if (ch === ' ' && rnd() < 0.35) { t += syl * 0.35; continue; }
    if (/[.,!?]/.test(ch)) { t += syl * 0.8; phrasePos = 0; chars++; if (chars % 2) continue; }
    const v = VOWELS[(Math.floor(rnd() * VOWELS.length) + p.vowelBias) % VOWELS.length];
    const dur = Math.min(syl * (0.7 + rnd() * 0.5), end - t);
    if (dur < 0.03) break;
    const contour = 1 + 0.12 * Math.sin(phrasePos * 0.9) + (rnd() - 0.5) * 0.2;
    const f0 = p.f0 * contour;
    out.push({
      t, dur, f0, f0End: f0 * (1 + (rnd() - 0.55) * 0.12 + (p.bubble ? (rnd() < p.bubble ? 0.25 : 0) : 0)),
      f1: v[0] * p.formantScale, f2: v[1] * p.formantScale, amp: 0.6 + rnd() * 0.4,
    });
    t += syl * (0.85 + rnd() * 0.3);
    phrasePos++;
  }
  return out;
}
export const lineFor = (id: string): Line | undefined => LINE_BY_ID[id];

// ---------- Music synth score data ----------
export type Inst =
  | 'pad' | 'glass' | 'pulse' | 'bass' | 'pluck' | 'flute' | 'celesta' | 'stac' | 'harpsi' | 'choir' | 'fanfare' | 'arp' | 'chipbass'
  | 'kick' | 'tom' | 'hat' | 'snare' | 'timp';
export interface Note { beat: number; dur: number; midi: number; vel: number; inst: Inst; thin?: boolean }
export interface TrackSpec { id: MusicId; bpm: number; beats: number; loop: boolean; level: number; notes: Note[] }

const N = (notes: Note[], inst: Inst, start: number, seq: [number, number][], vel = 0.7, thin = false): void => {
  let b = start;
  for (const [midi, dur] of seq) { if (midi > 0) notes.push({ beat: b, dur, midi, vel, inst, thin }); b += dur; }
};
const chordAt = (notes: Note[], inst: Inst, beat: number, dur: number, midis: number[], vel = 0.5, thin = false): void => {
  for (const m of midis) notes.push({ beat, dur, midi: m, vel, inst, thin });
};

function cosmic(): TrackSpec {
  const n: Note[] = [];
  const chords = [[50, 57, 64, 65], [46, 53, 57, 64], [43, 50, 57, 62], [45, 52, 59, 64]]; // Dm9-ish, Bbmaj7#11-ish, Gadd9, Asus
  chords.forEach((c, i) => chordAt(n, 'pad', i * 8, 8.5, c, 0.5));
  const glass = [88, 84, 91, 86, 93, 88, 81, 84];
  glass.forEach((m, i) => n.push({ beat: 1.5 + i * 4 + (i % 3) * 0.5, dur: 3, midi: m, vel: 0.35, inst: 'glass', thin: true }));
  for (let i = 0; i < 4; i++) { n.push({ beat: i * 8 + 3.5, dur: 0.5, midi: 38, vel: 0.5, inst: 'pulse' }); n.push({ beat: i * 8 + 6, dur: 0.5, midi: 45, vel: 0.3, inst: 'pulse', thin: true }); }
  return { id: 'cosmic', bpm: 60, beats: 32, loop: true, level: 1.3, notes: n };
}

const FOREST_MEL: [number, number][] = [
  [76, 1], [79, .5], [81, .5], [79, 1], [76, 1], [74, 1], [77, .5], [79, .5], [77, 1], [74, 1],
  [72, 1], [76, .5], [79, .5], [84, 1], [83, .5], [81, .5], [79, 3], [0, 1],
  [81, 1], [81, .5], [83, .5], [84, 1], [81, 1], [79, 1], [79, .5], [81, .5], [83, 1], [79, 1],
  [77, 1], [81, .5], [79, .5], [77, 1], [76, .5], [74, .5], [72, 3], [0, 1],
];
const FOREST_BASS_ROOTS = [48, 43, 48, 48, 41, 48, 41, 48]; // C G C C F C F(G) C
const FOREST_CHORDS: number[][] = [[60, 64, 67], [59, 62, 67], [60, 64, 67], [57, 60, 64], [60, 65, 69], [60, 64, 67], [60, 65, 69], [59, 62, 67]];
function forest(): TrackSpec {
  const n: Note[] = [];
  N(n, 'pluck', 0, FOREST_MEL, 0.75);
  // flute-like counter-line in the second half (thirds below)
  N(n, 'flute', 16, FOREST_MEL.slice(18).map(([m, d]): [number, number] => [m > 0 ? m - 4 : 0, d]), 0.35, true);
  for (let b = 0; b < 8; b++) {
    n.push({ beat: b * 4, dur: 0.9, midi: FOREST_BASS_ROOTS[b], vel: 0.8, inst: 'bass' });
    n.push({ beat: b * 4 + 2, dur: 0.9, midi: FOREST_BASS_ROOTS[b] + (b % 2 ? 7 : 0), vel: 0.6, inst: 'bass' });
    for (const o of [1, 3]) chordAt(n, 'stac', b * 4 + o, 0.3, FOREST_CHORDS[b], 0.32);
    n.push({ beat: b * 4, dur: 2, midi: FOREST_CHORDS[b][2] + 24, vel: 0.35, inst: 'celesta', thin: true });
    n.push({ beat: b * 4 + 2.5, dur: 2, midi: FOREST_CHORDS[b][1] + 24, vel: 0.28, inst: 'celesta', thin: true });
  }
  return { id: 'forest', bpm: 108, beats: 32, loop: true, level: 1.6, notes: n };
}

function finalMinute(): TrackSpec {
  const n: Note[] = [];
  const roots = [50, 46, 43, 45]; // D Bb G A
  const choirs = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
  roots.forEach((r, bar) => {
    const pat = [0, 7, 12, 7, 0, 7, 12, 15];
    const third = bar === 3 ? 4 : bar === 1 ? 4 : 3;
    for (let i = 0; i < 8; i++) {
      const off = pat[i] === 15 ? 12 + third : pat[i];
      n.push({ beat: bar * 4 + i * 0.5, dur: 0.4, midi: r + 12 + off, vel: i % 2 ? 0.45 : 0.65, inst: 'stac' });
      if (i % 2 === 0) n.push({ beat: bar * 4 + i * 0.5, dur: 0.4, midi: r + 24 + off, vel: 0.28, inst: 'stac', thin: true });
    }
    chordAt(n, 'choir', bar * 4, 4.1, choirs[bar], 0.5);
    n.push({ beat: bar * 4, dur: 1, midi: 38, vel: 1, inst: 'timp' });
    n.push({ beat: bar * 4 + 2, dur: 1, midi: 38, vel: 0.8, inst: 'timp' });
    n.push({ beat: bar * 4 + 3.5, dur: 0.5, midi: 43, vel: 0.6, inst: 'tom' });
    n.push({ beat: bar * 4 + 1.5, dur: 0.5, midi: 45, vel: 0.45, inst: 'tom', thin: true });
  });
  return { id: 'final_minute', bpm: 150, beats: 16, loop: true, level: 0.55, notes: n };
}

function office(): TrackSpec {
  const n: Note[] = [];
  // regal fanfare (Bb major) answered by a prissy flourish; repeats with harpsichord counterpoint
  N(n, 'fanfare', 0, [[65, .5], [65, .5], [70, 1], [74, .75], [0, .25], [77, 1.5], [74, .5], [77, 3]], 0.7);
  N(n, 'fanfare', 8, [[79, .5], [77, .5], [74, .5], [72, .5], [70, 1], [72, .5], [74, .5], [70, 3]], 0.55);
  N(n, 'harpsi', 8, [[82, .25], [81, .25], [82, .25], [84, .25], [82, 1], [79, 1], [77, 1], [74, 1], [75, 1], [76, 1], [77, 2]], 0.5, true);
  for (let i = 0; i < 16; i++) {
    const root = [46, 46, 51, 51, 46, 46, 43, 48][Math.floor(i / 2)];
    n.push({ beat: i, dur: 0.22, midi: root + (i % 2 ? 12 : 0), vel: 0.6, inst: 'stac' });
    if (i % 4 === 2) chordAt(n, 'harpsi', i, 0.4, [root + 12, root + 16, root + 19], 0.35);
  }
  N(n, 'harpsi', 0, [[58, 1], [62, 1], [65, 1], [62, 1]], 0.4);
  n.push({ beat: 0, dur: 1, midi: 38, vel: 0.7, inst: 'timp' }, { beat: 8, dur: 1, midi: 38, vel: 0.7, inst: 'timp' });
  return { id: 'office', bpm: 126, beats: 16, loop: true, level: 1.7, notes: n };
}

function runner(): TrackSpec {
  const n: Note[] = [];
  const roots = [45, 45, 41, 43]; // Am Am F G
  const chords = [[0, 3, 7, 12], [0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]];
  roots.forEach((r, bar) => {
    for (let i = 0; i < 16; i++) {
      const c = chords[bar];
      n.push({ beat: bar * 4 + i * 0.25, dur: 0.2, midi: r + 24 + c[[0, 1, 2, 3, 2, 1, 2, 3][i % 8] % 4] + (i >= 8 && bar === 3 ? 12 : 0), vel: i % 4 === 0 ? 0.55 : 0.38, inst: 'arp', thin: i % 2 === 1 });
    }
    for (let i = 0; i < 8; i++) n.push({ beat: bar * 4 + i * 0.5, dur: 0.4, midi: r - (i % 4 === 3 ? -12 : 0), vel: 0.7, inst: 'chipbass' });
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0) n.push({ beat: bar * 4 + b, dur: 0.2, midi: 36, vel: 0.9, inst: 'kick' });
      else n.push({ beat: bar * 4 + b, dur: 0.2, midi: 50, vel: 0.6, inst: 'snare' });
      n.push({ beat: bar * 4 + b + 0.5, dur: 0.1, midi: 90, vel: 0.35, inst: 'hat', thin: true });
    }
  });
  return { id: 'runner', bpm: 140, beats: 16, loop: true, level: 0.5, notes: n };
}

function reunion(): TrackSpec {
  const n: Note[] = [];
  N(n, 'pluck', 0, [[76, 1], [79, .5], [81, .5], [79, 1], [76, 1], [74, 1], [79, 1], [84, 2]], 0.6);
  N(n, 'flute', 8, [[84, 1.5], [83, .5], [81, 1], [79, 1], [76, 4]], 0.5);
  [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 60, 65, 69], [48, 60, 64, 67], [48, 62, 67, 71]].forEach((c, i) => {
    const b = i < 4 ? i * 2 : 8 + (i - 4) * 4;
    chordAt(n, 'pad', b, i < 4 ? 2.2 : 4.5, c, 0.4);
  });
  [84, 88, 91, 96].forEach((m, i) => n.push({ beat: 10 + i * 0.5, dur: 3, midi: m, vel: 0.35, inst: 'celesta', thin: true }));
  n.push({ beat: 12, dur: 4, midi: 48, vel: 0.6, inst: 'bass' });
  return { id: 'reunion', bpm: 84, beats: 16, loop: false, level: 1.3, notes: n };
}

// forest_tense (after the 1st failed room): placeholder = a darker, faster take on the forest score until the AUDIO agent writes its own
const forestTense = (): TrackSpec => { const t = forest(); return { ...t, id: 'forest_tense', bpm: Math.round(t.bpm * 1.15), level: t.level }; };
const BUILDERS: Record<MusicId, () => TrackSpec> = { cosmic, forest, forest_tense: forestTense, final_minute: finalMinute, office, runner, reunion };
export const trackSpec = (id: MusicId): TrackSpec => {
  const t = BUILDERS[id]();
  t.notes.sort((a, b) => a.beat - b.beat);
  return t;
};
export const beatSec = (spec: TrackSpec): number => 60 / spec.bpm;
export const loopSeconds = (spec: TrackSpec): number => spec.beats * beatSec(spec);

/** Look-ahead scheduler cursor: returns the notes (absolute beat) falling before untilBeat and advances the cursor. */
export interface Cursor { i: number; loop: number; done: boolean }
export function drainNotes(spec: TrackSpec, cur: Cursor, untilBeat: number): { abs: number; note: Note }[] {
  const out: { abs: number; note: Note }[] = [];
  while (!cur.done) {
    const note = spec.notes[cur.i];
    const abs = cur.loop * spec.beats + note.beat;
    if (abs >= untilBeat) break;
    out.push({ abs, note });
    if (++cur.i >= spec.notes.length) { cur.i = 0; cur.loop++; if (!spec.loop) cur.done = true; }
  }
  return out;
}

// ---------- SFX nominal durations (seconds), also used by the generator ----------
export const SFX_DURATIONS: Record<SfxId, number> = {
  beep: 0.3, ui_click: 0.1, ui_confirm: 0.4, pink_flash: 0.6, branch: 0.7, beacon_light: 1.0, thread_call: 1.2, echo_cyan: 1.0, tick: 0.08, warning: 0.8,
  collapse: 1.8, fail_sting: 1.6, abduct_beam: 2.2, soup_plop: 0.45, lane_move: 0.18, hit: 0.5, anchor_pickup: 0.6, thread_snap: 0.7, cosmic_boom: 2.0, reunion_chime: 2.5, pickup: 0.35, fuel_burn: 0.9,
};

export const MUSIC_DURATIONS_SEC: Record<MusicId, number> = { cosmic: 40, forest: 40, forest_tense: 40, final_minute: 30, office: 30, runner: 30, reunion: 20 };
