/**
 * Adaptive audio for "Out of Sync".
 *
 * Music is 100% synthesized with Web Audio (no music files). Voice/SFX try
 * assets/audio/voice_<cue>.mp3 and sfx_<name>.mp3 and fall back to synthesized stand-ins.
 *
 * Graph:
 *   amber layer (pad+bass+pluck) -> amberLP(drift) ----------------------------┐
 *   cyan layer (bells) -> cyanGain(drift) -> cyanLP(drift) -> dry --------------┼-> musicGain -> master
 *                                         └-> delay(drift, feedback) -> wet ----┤
 *   heartbeat (strain) ---------------------------------------------------------┘
 *   voice -> voiceLP(drift) -> voiceGain ----------------------------------------> master
 *   sfx -> sfxGain --------------------------------------------------------------> master
 *   master -> compressor -> destination
 */
import type { VoiceCue } from '../sim/types';

export type SfxName = 'branch_split' | 'echo_send' | 'archive_open' | 'anchor_lock' | 'drift_warning' | 'final_merge';

const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// 8-bar loop: Dm Bb F C | Dm Gm C F  (D minor home, resolving to F major)
const CHORDS: number[][] = [
  [50, 53, 57], [50, 53, 58], [53, 57, 60], [52, 55, 60],
  [50, 53, 57], [50, 55, 58], [52, 55, 60], [53, 57, 60],
];
const ROOTS = [38, 34, 41, 36, 38, 43, 36, 41];
// melody per bar: [beat, midi, lengthInBeats]
const MELODY: [number, number, number][][] = [
  [[0, 74, 1.5], [1.5, 72, 0.5], [2, 69, 2]],
  [[0, 70, 1], [1, 74, 1], [2, 72, 2]],
  [[0, 72, 1.5], [1.5, 69, 0.5], [2, 65, 2]],
  [[0, 67, 1], [1, 72, 1], [2, 76, 2]],
  [[0, 74, 1.5], [1.5, 77, 0.5], [2, 76, 1], [3, 74, 1]],
  [[0, 74, 1], [1, 70, 1], [2, 67, 2]],
  [[0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 76, 1]],
  [[0, 77, 2], [2, 72, 1], [3, 69, 1]],
];
// Cyan bell beats per bar (sparse, off the amber melody's strong beats)
const BELL_BEATS: number[][] = [[1, 3.5], [2.5], [1.5, 3], [2], [1, 3.5], [2.5], [1.5], [2, 3.5]];

const PRIORITY: Record<VoiceCue, number> = {
  boot: 1, find: 1, safe: 1, help: 1, echo_received: 2, divergence: 2, overstrain: 2, anchor: 3, final: 4, clear: 2, distant: 1, refusal: 2,
};
const VOICE_PITCH: Record<VoiceCue, number> = {
  boot: 392, find: 440, safe: 349, help: 330, echo_received: 523, divergence: 311, overstrain: 294, anchor: 587, final: 659, clear: 466, distant: 277, refusal: 262,
};
const SFX_MIN_GAP_MS: Record<SfxName, number> = {
  branch_split: 300, echo_send: 300, archive_open: 300, anchor_lock: 500, drift_warning: 8000, final_merge: 2000,
};
const VOICE_REPEAT_MS = 15000;
const VOICE_GAP_MS = 1200;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private amberLP!: BiquadFilterNode;
  private amberBus!: GainNode;
  private cyanBus!: GainNode;
  private cyanLP!: BiquadFilterNode;
  private delay!: DelayNode;
  private delayFb!: GainNode;
  private delayWet!: GainNode;
  private voiceLP!: BiquadFilterNode;
  private voiceGain!: GainNode;
  private sfxGain!: GainNode;

  private muted = false;
  private volume = 0.8;
  private drift = 0;
  private strain = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBarTime = 0;
  private barIndex = 0;
  private cyanHeld = false; // true during convergence (bells forced in tune)

  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voiceToken = 0;
  private voiceCue: VoiceCue | null = null;
  private voiceStop: (() => void) | null = null;
  private lastVoiceAt = 0;
  private lastCueAt = new Map<string, number>();
  private lastSfxAt = new Map<string, number>();
  private onVis = (): void => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  /** Call from a user gesture (Start button / first touch). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.build();
      document.addEventListener('visibilitychange', this.onVis);
    }
    void this.ctx.resume();
    if (!this.timer) {
      this.nextBarTime = this.ctx.currentTime + 0.15;
      this.timer = setInterval(() => this.tick(), 120);
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(0, now);
      this.musicGain.gain.linearRampToValueAtTime(0.55, now + 2.5);
      this.applyState(true);
      // preload (silent failures)
      (['boot', 'find', 'safe', 'help', 'echo_received', 'divergence', 'overstrain', 'anchor', 'final'] as VoiceCue[]).forEach((c) => void this.load(`voice_${c}`));
      (['branch_split', 'echo_send', 'archive_open', 'anchor_lock', 'drift_warning', 'final_merge'] as SfxName[]).forEach((n) => void this.load(`sfx_${n}`));
    }
  }

  setState(drift: number, strain: number): void {
    this.drift = clamp(drift, 0, 100);
    this.strain = clamp(strain, 0, 100);
    this.applyState(false);
  }

  setMuted(b: boolean): void { this.muted = b; this.applyMaster(); }
  isMuted(): boolean { return this.muted; }
  setVolume(n: number): void { this.volume = clamp(n, 0, 1); this.applyMaster(); }

  playVoice(cue: VoiceCue): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const nowMs = performance.now();
    const pri = PRIORITY[cue];
    if (this.voiceCue && pri <= PRIORITY[this.voiceCue]) return; // never interrupt equal/higher priority
    if (nowMs - (this.lastCueAt.get(cue) ?? -1e9) < VOICE_REPEAT_MS && cue !== 'final') return;
    if (pri < 3 && nowMs - this.lastVoiceAt < VOICE_GAP_MS) return;
    this.voiceStop?.();
    this.lastCueAt.set(cue, nowMs);
    this.lastVoiceAt = nowMs;
    const token = ++this.voiceToken;
    this.voiceCue = cue;
    this.voiceStop = null;
    void this.load(`voice_${cue}`).then((buf) => {
      if (token !== this.voiceToken || !this.ctx) return; // superseded
      const done = (): void => { if (token === this.voiceToken) { this.voiceCue = null; this.voiceStop = null; } };
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.voiceLP);
        src.onended = done;
        this.voiceStop = () => { try { src.stop(); } catch { /* already stopped */ } this.voiceToken++; this.voiceCue = null; this.voiceStop = null; };
        src.start();
      } else {
        const dur = this.synthVoiceBlip(cue);
        const t = setTimeout(done, dur * 1000);
        this.voiceStop = () => { clearTimeout(t); this.voiceToken++; this.voiceCue = null; this.voiceStop = null; };
      }
    });
  }

  playSfx(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - (this.lastSfxAt.get(name) ?? -1e9) < SFX_MIN_GAP_MS[name]) return;
    this.lastSfxAt.set(name, nowMs);
    void this.load(`sfx_${name}`).then((buf) => {
      if (!this.ctx) return;
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.sfxGain);
        src.start();
      } else {
        this.synthSfx(name);
      }
    });
  }

  /**
   * Ending: both layers resolve to a wide F major chord, bells ring in tune, drift/strain colouring is removed.
   * Call together with playSfx('final_merge') / playVoice('final') at the WIN moment.
   */
  playConvergence(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.cyanHeld = true;
    this.drift = 0;
    this.strain = 0;
    this.applyState(false);
    const t0 = ctx.currentTime + 0.05;
    // swelling F major pad
    [29, 41, 53, 57, 60, 65, 69].forEach((m, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 1.8);
      g.gain.setTargetAtTime(0, t0 + 4.5, 1.2);
      o.connect(g); g.connect(this.amberLP);
      o.start(t0); o.stop(t0 + 9);
    });
    // amber melody phrase + cyan bells answering, both in F major
    [[77, 0], [72, 0.7], [69, 1.4], [72, 2.1], [77, 2.9]].forEach(([m, dt]) => this.pluck(m, t0 + 0.4 + dt, 1.2, 0.16));
    [[84, 0.35], [81, 1.05], [88, 1.75], [84, 2.45], [89, 3.2]].forEach(([m, dt]) => this.bell(m, t0 + 0.4 + dt, 0.12, 0));
    setTimeout(() => { this.cyanHeld = false; }, 9000);
  }

  // ───────────────────────── internals ─────────────────────────

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    this.amberLP = ctx.createBiquadFilter();
    this.amberLP.type = 'lowpass'; this.amberLP.frequency.value = 6000; this.amberLP.Q.value = 0.5;
    this.amberBus = ctx.createGain();
    this.amberBus.gain.value = 0.9;
    this.amberLP.connect(this.amberBus); this.amberBus.connect(this.musicGain);

    this.cyanBus = ctx.createGain();
    this.cyanBus.gain.value = 0.8;
    this.cyanLP = ctx.createBiquadFilter();
    this.cyanLP.type = 'lowpass'; this.cyanLP.frequency.value = 7000; this.cyanLP.Q.value = 0.7;
    this.cyanBus.connect(this.cyanLP);
    this.cyanLP.connect(this.musicGain); // dry
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = BEAT * 0.75;
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.3;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = 0.25;
    this.cyanLP.connect(this.delay);
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet); this.delayWet.connect(this.musicGain);

    this.voiceLP = ctx.createBiquadFilter();
    this.voiceLP.type = 'lowpass'; this.voiceLP.frequency.value = 9000;
    this.voiceGain = ctx.createGain(); this.voiceGain.gain.value = 1;
    this.voiceLP.connect(this.voiceGain); this.voiceGain.connect(this.master);

    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
  }

  private applyMaster(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  /** All drift/strain-dependent continuous params; smooth ~0.5s ramps (time constant 0.15s). */
  private applyState(immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const d = this.drift / 100;
    const now = ctx.currentTime;
    const tc = immediate ? 0.01 : 0.15;
    const ramp = (p: AudioParam, v: number): void => { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, tc); };
    ramp(this.amberLP.frequency, 6000 - 2500 * d);
    ramp(this.cyanLP.frequency, 7000 - 6200 * d);       // 7k -> 800 Hz
    ramp(this.cyanBus.gain, 0.8 * (1 - 0.5 * d));
    ramp(this.delayWet.gain, 0.25 + 0.5 * d);
    ramp(this.delayFb.gain, 0.3 + 0.35 * d);
    ramp(this.voiceLP.frequency, 9000 - 5500 * d);      // moderate; speech stays intelligible (>=3.5k)
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      if (ctx) this.nextBarTime = Math.max(this.nextBarTime, ctx.currentTime + 0.1);
      return;
    }
    // if the tab slept, don't try to catch up
    if (this.nextBarTime < ctx.currentTime - 0.2) this.nextBarTime = ctx.currentTime + 0.1;
    while (this.nextBarTime < ctx.currentTime + 0.6) {
      this.scheduleBar(this.barIndex % 8, this.nextBarTime);
      this.barIndex++;
      this.nextBarTime += BAR;
    }
  }

  private scheduleBar(b: number, t: number): void {
    const ctx = this.ctx!;
    // pad (3 triangle voices) with slow swell, overlapping into next bar
    CHORDS[b].forEach((m) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = mtof(m);
      o.detune.value = (m % 3 - 1) * 4;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.7);
      g.gain.setValueAtTime(0.045, t + BAR - 0.2);
      g.gain.linearRampToValueAtTime(0, t + BAR + 0.9);
      o.connect(g); g.connect(this.amberLP);
      o.start(t); o.stop(t + BAR + 1);
    });
    // bass
    {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = mtof(ROOTS[b]);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.05);
      g.gain.setTargetAtTime(0, t + BAR - 0.6, 0.25);
      o.connect(g); g.connect(this.amberLP);
      o.start(t); o.stop(t + BAR + 0.3);
    }
    // felt-piano-ish melody
    MELODY[b].forEach(([beat, m, len]) => this.pluck(m, t + beat * BEAT, len * BEAT, 0.13));
    // cyan bells: chord tones an octave+ up, jittered by strain (rhythmic desync) and detuned by drift
    const tones = CHORDS[b].map((m) => m + 24);
    BELL_BEATS[b].forEach((beat, k) => {
      const jitter = this.cyanHeld ? 0 : (Math.random() - 0.5) * (this.strain / 100) * 0.22;
      this.bell(tones[(b + k * 2) % 3], t + beat * BEAT + jitter, 0.09, this.cyanHeld ? 0 : this.drift);
    });
    // heartbeat when strained
    if (!this.cyanHeld && this.strain >= 15) {
      const amp = clamp((this.strain - 10) / 90, 0, 1) * 0.3;
      const every = this.strain > 60 ? 1 : 2; // beats
      for (let beat = 0; beat < 4; beat += every) {
        const j = (Math.random() - 0.3) * (this.strain / 100) * 0.12;
        this.thump(t + beat * BEAT + Math.max(0, j), amp);
        this.thump(t + beat * BEAT + 0.19 + Math.max(0, j), amp * 0.6);
      }
    }
  }

  private pluck(m: number, t: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o1.type = 'triangle'; o1.frequency.value = mtof(m);
    o2.type = 'sine'; o2.frequency.value = mtof(m) * 2; g2.gain.value = 0.25;
    const end = t + Math.max(0.5, dur * 1.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, end);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.amberLP);
    o1.start(t); o2.start(t); o1.stop(end + 0.05); o2.stop(end + 0.05);
  }

  private bell(m: number, t: number, peak: number, drift: number): void {
    const ctx = this.ctx!;
    const f = mtof(m);
    const cents = (Math.random() - 0.5) * 2 * (drift / 100) * 45;
    const g = ctx.createGain();
    const end = t + 2.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, end);
    const o1 = ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = f; o1.detune.value = cents;
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = f * 2.76; o2.detune.value = cents; g2.gain.value = 0.18;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.cyanBus);
    o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  }

  private thump(t: number, amp: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }

  // ───────────── asset loading (fail-silent) ─────────────

  private load(base: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(base);
    if (!p) {
      const root = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
      const url = `${root}assets/audio/${base}.mp3`;
      p = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.arrayBuffer();
          if (data.byteLength < 200 || !this.ctx) return null; // dev servers may answer with a tiny/HTML fallback
          return await this.ctx.decodeAudioData(data);
        } catch {
          return null;
        }
      })();
      this.buffers.set(base, p);
    }
    return p;
  }

  // ───────────── synthesized stand-ins ─────────────

  /** Soft two-note blip as a placeholder for spoken lines. Returns duration in seconds. */
  private synthVoiceBlip(cue: VoiceCue): number {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.02;
    const f = VOICE_PITCH[cue];
    [0, 0.14].forEach((dt, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 0 ? f : f * 1.122;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.16, t + dt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dt + 0.28);
      o.connect(g); g.connect(this.voiceLP);
      o.start(t + dt); o.stop(t + dt + 0.3);
    });
    return 0.5;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.01): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private synthSfx(name: SfxName): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const d = this.sfxGain;
    switch (name) {
      case 'branch_split':
        this.tone(d, 'sine', 880, 880, t, 0.5, 0.18, 0.003);
        this.tone(d, 'sine', 880, 1320, t + 0.15, 1.1, 0.12);
        this.tone(d, 'sine', 880, 587, t + 0.15, 1.1, 0.12);
        break;
      case 'echo_send':
        this.tone(d, 'sine', 62, 48, t, 0.2, 0.35); this.tone(d, 'sine', 62, 48, t + 0.28, 0.2, 0.28);
        this.tone(d, 'triangle', 500, 900, t, 0.9, 0.07, 0.2);
        break;
      case 'archive_open': {
        this.tone(d, 'triangle', 110, 220, t, 0.6, 0.14, 0.05);
        const n = ctx.createBufferSource();
        const len = Math.floor(ctx.sampleRate * 0.25);
        const b = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = b.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) * (i % 900 < 450 ? 1 : 0.2);
        n.buffer = b;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
        const g = ctx.createGain(); g.gain.value = 0.08;
        n.connect(hp); hp.connect(g); g.connect(d);
        n.start(t + 0.2);
        break;
      }
      case 'anchor_lock':
        [587, 698, 880].forEach((f, i) => { this.tone(d, 'sine', f, f, t + i * 0.16, 1.9 - i * 0.1, 0.14); this.tone(d, 'sine', f * 2.01, f * 2.01, t + i * 0.16, 1.2, 0.04); });
        break;
      case 'drift_warning': {
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(330, t + 1.8);
        lfo.frequency.value = 5.5; lg.gain.value = 14;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.9);
        o.connect(g); g.connect(d);
        o.start(t); lfo.start(t); o.stop(t + 2); lfo.stop(t + 2);
        break;
      }
      case 'final_merge':
        [349, 440, 523, 698, 880].forEach((f, i) => this.tone(d, 'sine', f, f, t + i * 0.12, 3, 0.1, 0.5));
        break;
    }
  }
}
