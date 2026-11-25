// Director's Cut audio facade. Never throws. Files in public/assets/dc/audio/{voice,music,sfx}/<id>.mp3 win; otherwise original synthesised stand-ins.
//
//  music tracks -> musicStress(gain) -> musicLP -> musicVol -> master
//  voice        -> voiceLP(mild)     -> voiceVol --------------> master
//  sfx          ------------------------> sfxVol -------------> master -> compressor -> destination
import type { DCAudio, DCSettings } from '../contracts';
import { MUSIC_IDS, type MusicId, type SfxId, SFX_IDS } from '../content/lines';
import {
  EMPTY_MANIFEST, MANIFEST_URL, beatSec, clamp, drainNotes, babbleSchedule, equalPowerCurve, hasFile, lineFor, looksLikeAudio, loopCrossfadeSec,
  loopPassStart, musicUrl, parseManifest, profileFor, sfxUrl, stressMix, stressRampSec, trackSpec, voiceDurationMs, voiceUrl,
  type AudioManifest, type Cursor, type FileKind, type TrackSpec,
} from './plan';
import { playBabble, playNote, playSfxSynth } from './synth';

export type Backing = 'file' | 'synth' | 'unknown-id';
export interface DCAudioDebug {
  unlocked: boolean; ctxState: string; muted: boolean; stress: number;
  musicId: MusicId | null; musicBacking: Backing | null; musicPasses: number; // file passes scheduled so far (loop crossfade)
  buses: { music: number; voice: number; sfx: number };
  voiceId: string | null;
  manifest: { voice: number; music: number; sfx: number } | null; // null until fetched
  requested: Record<string, Backing>; // e.g. 'music:cosmic', 'voice:tm_intro_1', 'sfx:beep'
}
let lastDebug: (() => DCAudioDebug) | null = null;
/** DCAudio plus the optional playVoice priority. A 'normal' line requested while a 'high' line is playing is dropped (resolves at once) instead of cutting it. */
export interface DCAudioWithPriority extends DCAudio { playVoice(id: string, opts?: { priority?: 'normal' | 'high' }): Promise<void> }
/** QA/test hook: state of the most recently created DCAudio. */
export function getDCAudioDebug(): DCAudioDebug | null { return lastDebug ? lastDebug() : null; }

interface Track {
  id: MusicId; out: GainNode; thin: GainNode; detune: ConstantSourceNode; backing: Backing;
  srcs?: Set<AudioBufferSourceNode>; passes?: number; timer?: ReturnType<typeof setInterval>; stop(): void;
}
const LOOKAHEAD = 1.5, TICK_MS = 250;
const MUSIC_LEVEL = 0.9;

export function createDCAudio(settings: DCSettings): DCAudioWithPriority {
  let ctx: AudioContext | null = null;
  let master!: GainNode, musicVol!: GainNode, musicStress!: GainNode, musicLP!: BiquadFilterNode, voiceVol!: GainNode, voiceLP!: BiquadFilterNode, sfxVol!: GainNode;
  let stress = 0, unlocked = false;
  let wantMusic: { id: MusicId; fadeMs: number } | null = null;
  let cur: Track | null = null, curId: MusicId | null = null;
  let musicToken = 0;
  const requested: Record<string, Backing> = {};
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  let manifest: AudioManifest | null = null, manifestP: Promise<AudioManifest> | null = null;
  let voice: { id: string; high: boolean; stop: () => void; done: () => void } | null = null;
  let voiceToken = 0;

  const volOf = (b: 'music' | 'voice' | 'sfx'): number => clamp(settings[b], 0, 1);
  const ramp = (p: AudioParam, v: number, sec: number): void => {
    if (!ctx) return;
    const now = ctx.currentTime;
    try { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(v, now + sec); } catch { /* ignore */ }
  };
  const expRamp = (p: AudioParam, v: number, sec: number): void => {
    if (!ctx) return;
    const now = ctx.currentTime;
    try { p.cancelScheduledValues(now); p.setValueAtTime(Math.max(p.value, 1), now); p.exponentialRampToValueAtTime(Math.max(v, 1), now + sec); } catch { /* ignore */ }
  };

  /** One fetch of available.json (first unlock). Anything wrong => nothing available (pure synth). */
  function loadManifest(): Promise<AudioManifest> {
    if (!manifestP) {
      manifestP = (async () => {
        try {
          if (typeof fetch !== 'function') return EMPTY_MANIFEST;
          const r = await fetch(MANIFEST_URL, { cache: 'no-cache' });
          if (!r.ok) return EMPTY_MANIFEST;
          return parseManifest(await r.text());
        } catch { return EMPTY_MANIFEST; }
      })().then(m => (manifest = m));
    }
    return manifestP;
  }
  /** Only requests files the manifest lists. */
  async function loadFile(kind: FileKind, id: string, url: string): Promise<AudioBuffer | null> {
    const m = await loadManifest();
    return hasFile(m, kind, id) ? load(url) : null;
  }

  function load(url: string): Promise<AudioBuffer | null> {
    let p = buffers.get(url);
    if (!p) {
      p = (async () => {
        try {
          if (!ctx || typeof fetch !== 'function') return null;
          const r = await fetch(url);
          if (!r.ok) return null;
          const bytes = await r.arrayBuffer();
          if (!looksLikeAudio(bytes, r.headers.get('content-type'))) return null;
          return await ctx.decodeAudioData(bytes);
        } catch { return null; }
      })();
      buffers.set(url, p);
    }
    return p;
  }

  function applyBuses(): void {
    if (!ctx) return;
    ramp(master.gain, settings.muted ? 0 : 1, 0.05);
    ramp(musicVol.gain, volOf('music') * MUSIC_LEVEL, 0.08);
    ramp(voiceVol.gain, volOf('voice'), 0.08);
    ramp(sfxVol.gain, volOf('sfx'), 0.08);
  }
  function applyStress(rampSec: number): void {
    if (!ctx) return;
    const m = stressMix(stress);
    ramp(musicStress.gain, m.musicGain, rampSec);
    expRamp(musicLP.frequency, m.musicLpHz, rampSec);
    expRamp(voiceLP.frequency, m.voiceLpHz, rampSec);
    if (cur) { ramp(cur.thin.gain, m.thin, rampSec); ramp(cur.detune.offset, m.detuneCents, rampSec); }
  }

  function build(): void {
    const AC: typeof AudioContext | undefined = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = settings.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    musicVol = ctx.createGain(); musicVol.gain.value = volOf('music') * MUSIC_LEVEL;
    musicStress = ctx.createGain(); musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicStress.connect(musicLP); musicLP.connect(musicVol); musicVol.connect(master);
    voiceLP = ctx.createBiquadFilter(); voiceLP.type = 'lowpass'; voiceLP.frequency.value = 16000;
    voiceVol = ctx.createGain(); voiceVol.gain.value = volOf('voice');
    voiceLP.connect(voiceVol); voiceVol.connect(master);
    sfxVol = ctx.createGain(); sfxVol.gain.value = volOf('sfx'); sfxVol.connect(master);
    applyStress(0.01);
  }

  // ---------- music ----------
  /** Equal-power fade (sin in / cos out). No setValueAtTime before the curve: it would overlap the curve and throw. */
  function fadeTo(t: Track, from: number, to: number, sec: number): void {
    if (!ctx) return;
    const now = ctx.currentTime;
    const curve = equalPowerCurve(24, to > from ? 'in' : 'out', to > from ? to : from);
    try { t.out.gain.cancelScheduledValues(now); t.out.gain.setValueCurveAtTime(curve, now, Math.max(0.02, sec)); } catch { /* ignore */ }
  }
  function retire(t: Track, fadeMs: number): void {
    // start from the gain the track has right now, so cutting a half-faded-in track does not jump to full level
    let from = 1; try { from = clamp(t.out.gain.value, 0.0001, 1); } catch { /* ignore */ }
    fadeTo(t, from, 0, fadeMs / 1000);
    if (t.timer) clearInterval(t.timer);
    t.timer = undefined;
    setTimeout(() => { try { t.srcs?.forEach(s => { try { s.stop(); } catch { /* ignore */ } }); t.detune.stop(); t.out.disconnect(); t.thin.disconnect(); } catch { /* ignore */ } }, fadeMs + 150);
  }
  /** File-backed music: passes overlap by x seconds with an equal-power crossfade (no source.loop). 'reunion' (loop=false) plays one pass. */
  function startFile(t: Track, buf: AudioBuffer, loop: boolean): void {
    const c = ctx!, D = buf.duration, x = loop ? loopCrossfadeSec(D) : 0;
    const t0 = c.currentTime + 0.05, srcs = new Set<AudioBufferSourceNode>();
    t.srcs = srcs;
    let k = 0;
    const pass = (): void => {
      const start = loopPassStart(t0, k, D, x);
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = buf; s.connect(g); g.connect(t.out);
      s.onended = () => { srcs.delete(s); try { g.disconnect(); } catch { /* ignore */ } };
      if (loop && x > 0) {
        if (k > 0) { g.gain.value = 0; g.gain.setValueCurveAtTime(equalPowerCurve(16, 'in'), start, x); } // ends at 1 and holds until the fade-out curve
        g.gain.setValueCurveAtTime(equalPowerCurve(16, 'out'), start + D - x, x);
      }
      s.start(start); s.stop(start + D + 0.05); srcs.add(s);
      k++; t.passes = k;
    };
    pass();
    if (loop && x > 0) {
      t.timer = setInterval(() => { if (ctx && loopPassStart(t0, k, D, x) - c.currentTime < 2.5) { try { pass(); } catch { /* ignore */ } } }, TICK_MS);
    }
  }
  function startSynth(id: MusicId, out: GainNode, thin: GainNode, detune: ConstantSourceNode): { timer: ReturnType<typeof setInterval>; spec: TrackSpec } {
    const c = ctx!, spec = trackSpec(id), spb = beatSec(spec);
    const start = c.currentTime + 0.08, cursor: Cursor = { i: 0, loop: 0, done: false };
    const lvl = c.createGain(); lvl.gain.value = spec.level; lvl.connect(out);
    const thinLvl = thin; thinLvl.connect(lvl);
    const main = c.createGain(); main.connect(lvl);
    const tick = () => {
      if (!ctx || cursor.done) return;
      const until = (c.currentTime + LOOKAHEAD - start) / spb;
      for (const { abs, note } of drainNotes(spec, cursor, until)) {
        const t = start + abs * spb;
        if (t < c.currentTime) continue; // too late (tab was throttled): skip rather than burst
        try { playNote(c, main, thinLvl, note, t, spb, detune); } catch { /* ignore */ }
      }
    };
    tick();
    return { timer: setInterval(tick, TICK_MS), spec };
  }

  async function startMusic(id: MusicId, fadeMs: number): Promise<void> {
    const token = ++musicToken;
    const buf = await loadFile('music', id, musicUrl(id));
    if (token !== musicToken || !ctx) return;
    const c = ctx;
    const out = c.createGain(), thin = c.createGain(), detune = c.createConstantSource();
    out.gain.value = 0; thin.gain.value = stressMix(stress).thin; detune.offset.value = stressMix(stress).detuneCents; detune.start();
    out.connect(musicStress);
    const t: Track = { id, out, thin, detune, backing: buf ? 'file' : 'synth', stop() { /* set below */ } };
    if (buf) {
      startFile(t, buf, trackSpec(id).loop);
    } else {
      const r = startSynth(id, out, thin, detune); t.timer = r.timer;
    }
    requested['music:' + id] = t.backing;
    const prev = cur;
    cur = t;
    if (prev) retire(prev, fadeMs);
    fadeTo(t, 0, 1, prev ? fadeMs / 1000 : Math.min(fadeMs, 600) / 1000);
  }

  // ---------- voice ----------
  function endVoice(): void {
    const v = voice; voice = null; voiceToken++;
    if (v) { try { v.stop(); } catch { /* ignore */ } v.done(); }
  }

  const api: DCAudioWithPriority = {
    unlock() {
      try {
        if (!ctx) build();
        if (!ctx) return;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* ignore */ });
        if (!unlocked) {
          unlocked = true;
          void loadManifest();
          if (wantMusic) { void startMusic(wantMusic.id, wantMusic.fadeMs).catch(() => { /* ignore */ }); }
        }
      } catch { /* never throw */ }
    },
    playMusic(id, opts) {
      try {
        if (!(MUSIC_IDS as readonly string[]).includes(id)) return;
        const fadeMs = opts?.fadeMs ?? 1500;
        if (id === curId) return;
        wantMusic = { id, fadeMs };
        curId = id;
        if (unlocked && ctx) void startMusic(id, fadeMs).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    },
    stopMusic(fadeMs = 1500) {
      try {
        musicToken++; curId = null; wantMusic = null;
        if (cur) { retire(cur, fadeMs); cur = null; }
      } catch { /* ignore */ }
    },
    setBondStress(v) {
      try {
        const n = clamp(v, 0, 1);
        if (Math.abs(n - stress) < 0.005) return;
        const r = stressRampSec(stress, n);
        stress = n; applyStress(r);
      } catch { /* ignore */ }
    },
    playVoice(id, opts) {
      const line = lineFor(id);
      if (!line) { requested['voice:' + id] = 'unknown-id'; return Promise.resolve(); }
      const high = opts?.priority === 'high';
      if (voice?.high && !high) return Promise.resolve(); // a quick jab never cuts a story-critical line
      endVoice();
      const token = ++voiceToken;
      return new Promise<void>(resolve => {
        let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
        const v = { id, high, stop: () => { /* replaced when audio starts */ }, done: () => { if (!finished) { finished = true; if (timer) clearTimeout(timer); resolve(); } } };
        voice = v;
        const ms = voiceDurationMs(line.text);
        if (!unlocked || !ctx) { requested['voice:' + id] = 'synth'; timer = setTimeout(() => { if (voice === v) voice = null; v.done(); }, ms); return; } // silent but correctly paced
        void (async () => {
          const buf = await loadFile('voice', id, voiceUrl(id));
          if (token !== voiceToken || finished || !ctx) return;
          try {
            if (buf) {
              requested['voice:' + id] = 'file';
              const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voiceLP);
              s.onended = () => { if (voice === v) voice = null; v.done(); };
              v.stop = () => { try { s.onended = null; s.stop(); } catch { /* ignore */ } };
              s.start();
            } else {
              requested['voice:' + id] = 'synth';
              const prof = profileFor(line.who, line.mood);
              const stop = playBabble(ctx, voiceLP, babbleSchedule(line.text, line.who, line.mood), prof, ms / 1000);
              v.stop = stop;
              timer = setTimeout(() => { if (voice === v) voice = null; v.done(); }, ms);
            }
          } catch { if (voice === v) voice = null; v.done(); }
        })();
      });
    },
    skipVoice() { try { endVoice(); } catch { /* ignore */ } },
    playSfx(id: SfxId) {
      try {
        if (!(SFX_IDS as readonly string[]).includes(id)) return;
        if (!unlocked || !ctx) return;
        void loadFile('sfx', id, sfxUrl(id)).then(buf => {
          if (!ctx) return;
          try {
            if (buf) { requested['sfx:' + id] = 'file'; const s = ctx.createBufferSource(); s.buffer = buf; s.connect(sfxVol); s.start(); }
            else { requested['sfx:' + id] = 'synth'; playSfxSynth(ctx, sfxVol, id); }
          } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    },
    setMuted(m) { try { settings.muted = !!m; applyBuses(); } catch { /* ignore */ } },
    setBus(bus, volume01) { try { settings[bus] = clamp(volume01, 0, 1); applyBuses(); } catch { /* ignore */ } },
  };

  lastDebug = () => ({
    unlocked, ctxState: ctx?.state ?? 'none', muted: settings.muted, stress, musicId: curId, musicBacking: cur?.backing ?? null, musicPasses: cur?.passes ?? 0,
    buses: { music: settings.music, voice: settings.voice, sfx: settings.sfx }, manifest: manifest ? { voice: manifest.voice.size, music: manifest.music.size, sfx: manifest.sfx.size } : null, voiceId: voice?.id ?? null, requested: { ...requested },
  });
  return api;
}
