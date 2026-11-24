// Web Audio synthesis for the DC stand-ins: instruments (music), formant babble (voice), one-shot SFX. No files, CPU-light.
import type { SfxId } from '../content/lines';
import { mtof, type Inst, type Note, type Syllable, type VoiceProfile } from './plan';

type Ctx = BaseAudioContext;
const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noiseBuf(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    noiseCache.set(ctx, b);
  }
  return b;
}

interface Env { a: number; r: number; peak: number; pluck?: boolean; decay?: number }
function envelope(g: GainNode, t: number, dur: number, e: Env): number {
  const p = g.gain, end = t + dur + e.r;
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(e.peak, t + e.a);
  if (e.pluck) p.exponentialRampToValueAtTime(0.0001, t + Math.max(e.a + 0.02, (e.decay ?? dur) + e.r));
  else { p.setValueAtTime(e.peak, Math.max(t + e.a, t + dur)); p.exponentialRampToValueAtTime(0.0001, end); }
  return Math.max(end, t + (e.decay ?? 0) + e.r);
}

interface ToneOpts { t: number; dur: number; freq: number; to?: number; type?: OscillatorType; env: Env; lp?: number; lpTo?: number; partials?: [number, number][]; spread?: number; vib?: [number, number]; detuneCtl?: AudioNode }
/** Generic subtractive voice: osc(+detuned partners/partials) -> lowpass -> envelope -> dest. */
function tone(ctx: Ctx, dest: AudioNode, o: ToneOpts): void {
  const g = ctx.createGain();
  const stopAt = envelope(g, o.t, o.dur, o.env) + 0.05;
  let out: AudioNode = g;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, o.t); f.Q.value = 0.7;
    if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, o.t + o.dur + o.env.r);
    g.connect(f); out = f;
  }
  out.connect(dest);
  const mk = (ratio: number, cents: number, amp: number, type: OscillatorType) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(o.freq * ratio, o.t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * ratio, o.t + o.dur);
    osc.detune.value = cents;
    o.detuneCtl?.connect(osc.detune);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.detune); l.start(o.t); l.stop(stopAt);
    }
    if (amp !== 1) { const a = ctx.createGain(); a.gain.value = amp; osc.connect(a); a.connect(g); } else osc.connect(g);
    osc.start(o.t); osc.stop(stopAt);
  };
  const type = o.type ?? 'sine';
  const sp = o.spread ?? 0;
  mk(1, sp ? -sp : 0, 1, type);
  if (sp) mk(1, sp, 1, type);
  for (const [r, a] of o.partials ?? []) mk(r, 0, a, 'sine');
}

function noise(ctx: Ctx, dest: AudioNode, t: number, dur: number, peak: number, ft: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = ft; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05);
}

/** Schedule one score note on the given destinations (`thin` = upper/sparkle layers that the bond stress fades out). */
export function playNote(ctx: Ctx, main: AudioNode, thin: AudioNode, n: Note, t: number, spb: number, detuneCtl: AudioNode): void {
  const dest = n.thin ? thin : main, f = mtof(n.midi), d = n.dur * spb, v = n.vel, dc = detuneCtl;
  switch (n.inst as Inst) {
    case 'pad': tone(ctx, dest, { t, dur: d, freq: f, type: 'triangle', spread: 9, lp: 1600, env: { a: 1.4, r: 2.2, peak: 0.07 * v }, detuneCtl: dc }); break;
    case 'glass': tone(ctx, dest, { t, dur: d, freq: f, partials: [[2.76, 0.35], [5.4, 0.12]], env: { a: 0.01, r: 1.5, peak: 0.08 * v, pluck: true, decay: d }, detuneCtl: dc }); break;
    case 'pulse': tone(ctx, dest, { t, dur: d, freq: f, to: f * 0.5, lp: 500, env: { a: 0.005, r: 0.4, peak: 0.2 * v, pluck: true, decay: 0.3 }, detuneCtl: dc }); break;
    case 'bass': tone(ctx, dest, { t, dur: d, freq: f, type: 'triangle', lp: 700, env: { a: 0.01, r: 0.1, peak: 0.2 * v, pluck: true, decay: d * 0.8 }, detuneCtl: dc }); break;
    case 'pluck': tone(ctx, dest, { t, dur: d, freq: f, type: 'sawtooth', lp: 3200, lpTo: 700, env: { a: 0.004, r: 0.12, peak: 0.1 * v, pluck: true, decay: Math.min(d + 0.1, 0.55) }, detuneCtl: dc }); break;
    case 'flute': tone(ctx, dest, { t, dur: d, freq: f, partials: [[2, 0.15]], vib: [5, 7], env: { a: 0.07, r: 0.12, peak: 0.1 * v }, detuneCtl: dc }); break;
    case 'celesta': tone(ctx, dest, { t, dur: d, freq: f, partials: [[4, 0.3], [6.3, 0.08]], env: { a: 0.004, r: 0.6, peak: 0.07 * v, pluck: true, decay: 1.0 }, detuneCtl: dc }); break;
    case 'stac': tone(ctx, dest, { t, dur: d, freq: f, type: 'sawtooth', lp: 2200, spread: 5, env: { a: 0.006, r: 0.05, peak: 0.07 * v, pluck: true, decay: Math.min(d, 0.25) }, detuneCtl: dc }); break;
    case 'harpsi': tone(ctx, dest, { t, dur: d, freq: f, type: 'square', lp: 4200, partials: [[2, 0.2]], env: { a: 0.002, r: 0.08, peak: 0.05 * v, pluck: true, decay: Math.min(d + 0.05, 0.4) }, detuneCtl: dc }); break;
    case 'choir': tone(ctx, dest, { t, dur: d, freq: f, type: 'sawtooth', spread: 12, lp: 1100, vib: [5.5, 10], env: { a: 0.5, r: 0.6, peak: 0.045 * v }, detuneCtl: dc }); break;
    case 'fanfare': tone(ctx, dest, { t, dur: d, freq: f, type: 'sawtooth', spread: 6, lp: 900, lpTo: 2600, vib: [5, 4], env: { a: 0.025, r: 0.1, peak: 0.08 * v }, detuneCtl: dc }); break;
    case 'arp': tone(ctx, dest, { t, dur: d, freq: f, type: 'square', lp: 4500, env: { a: 0.003, r: 0.03, peak: 0.045 * v, pluck: true, decay: d }, detuneCtl: dc }); break;
    case 'chipbass': tone(ctx, dest, { t, dur: d, freq: f, type: 'square', lp: 900, env: { a: 0.004, r: 0.03, peak: 0.08 * v, pluck: true, decay: d }, detuneCtl: dc }); break;
    case 'kick': tone(ctx, dest, { t, dur: 0.18, freq: 130, to: 42, env: { a: 0.002, r: 0.08, peak: 0.45 * v, pluck: true, decay: 0.16 } }); break;
    case 'timp': tone(ctx, dest, { t, dur: 0.6, freq: f * 1.6, to: f, env: { a: 0.003, r: 0.3, peak: 0.5 * v, pluck: true, decay: 0.55 } }); noise(ctx, dest, t, 0.08, 0.1 * v, 'lowpass', 600); break;
    case 'tom': tone(ctx, dest, { t, dur: 0.3, freq: f * 2, to: f, env: { a: 0.002, r: 0.1, peak: 0.3 * v, pluck: true, decay: 0.28 } }); break;
    case 'hat': noise(ctx, dest, t, 0.05, 0.12 * v, 'highpass', 7000); break;
    case 'snare': noise(ctx, dest, t, 0.14, 0.2 * v, 'bandpass', 1900, 1500); tone(ctx, dest, { t, dur: 0.1, freq: 190, env: { a: 0.002, r: 0.05, peak: 0.15 * v, pluck: true, decay: 0.1 } }); break;
  }
}

// ---------- voice babble ----------
/** Starts a formant babble on `dest`. Returns a stop function. Whole line = one oscillator + two formant filters automated per syllable. */
export function playBabble(ctx: Ctx, dest: AudioNode, sched: Syllable[], p: VoiceProfile & { mood: string }, totalSec: number): () => void {
  const t0 = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator(); osc.type = p.wave;
  const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), out = ctx.createGain();
  f1.type = f2.type = 'bandpass'; f1.Q.value = p.f0 < 150 ? 9 : 6; f2.Q.value = 8;
  const g2 = ctx.createGain(); g2.gain.value = 0.55;
  osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(out);
  out.gain.value = p.f0 < 150 ? 2.6 : 2.2;
  if (p.f0 < 150) { // theatrical low-end body for the Time Master
    const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 220; body.gain.value = 7;
    out.connect(body); body.connect(dest);
  } else out.connect(dest);
  g.gain.setValueAtTime(0, t0);
  if (p.wobble > 0) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = p.mood === 'crying' ? 6.5 : 5; lg.gain.value = p.wobble * 90;
    l.connect(lg); lg.connect(osc.detune); l.start(t0); l.stop(t0 + totalSec + 0.1);
  }
  for (const s of sched) {
    const a = t0 + s.t, e = a + s.dur;
    osc.frequency.setValueAtTime(s.f0, a); osc.frequency.linearRampToValueAtTime(s.f0End, e);
    f1.frequency.setTargetAtTime(s.f1, a, 0.02); f2.frequency.setTargetAtTime(s.f2, a, 0.02);
    g.gain.setTargetAtTime(0.5 * s.amp, a, 0.012);
    g.gain.setTargetAtTime(0.0, e - 0.03, 0.02);
  }
  osc.start(t0); osc.stop(t0 + totalSec + 0.15);
  return () => {
    const now = ctx.currentTime;
    try { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.01); osc.stop(now + 0.08); } catch { /* already stopped */ }
  };
}

// ---------- SFX ----------
export function playSfxSynth(ctx: Ctx, dest: AudioNode, id: SfxId): void {
  const t = ctx.currentTime + 0.01;
  const T = (o: Partial<ToneOpts> & { freq: number; dur: number; env: Env }) => tone(ctx, dest, { t, ...o });
  const at = (d: number, o: Partial<ToneOpts> & { freq: number; dur: number; env: Env }) => tone(ctx, dest, { ...o, t: t + d });
  const click = (peak: number) => ({ a: 0.002, r: 0.04, peak, pluck: true, decay: 0.05 });
  switch (id) {
    case 'beep': T({ freq: 880, type: 'square', lp: 3000, dur: 0.08, env: { a: 0.003, r: 0.02, peak: 0.12 } }); at(0.14, { freq: 880, type: 'square', lp: 3000, dur: 0.08, env: { a: 0.003, r: 0.02, peak: 0.12 } }); break;
    case 'ui_click': T({ freq: 1400, to: 900, type: 'triangle', dur: 0.04, env: click(0.18) }); break;
    case 'ui_confirm': T({ freq: 660, type: 'triangle', dur: 0.1, env: { a: 0.005, r: 0.1, peak: 0.16, pluck: true, decay: 0.1 } }); at(0.09, { freq: 990, type: 'triangle', dur: 0.2, env: { a: 0.005, r: 0.15, peak: 0.16, pluck: true, decay: 0.2 } }); break;
    case 'pink_flash': T({ freq: 2400, to: 5200, dur: 0.1, partials: [[1.5, 0.5], [2.3, 0.3]], env: { a: 0.002, r: 0.3, peak: 0.1, pluck: true, decay: 0.3 } }); noise(ctx, dest, t, 0.08, 0.2, 'highpass', 4500); at(0.05, { freq: 3100, dur: 0.3, partials: [[1.7, 0.5]], env: { a: 0.002, r: 0.3, peak: 0.07, pluck: true, decay: 0.35 } }); break;
    case 'branch': T({ freq: 520, to: 780, type: 'triangle', dur: 0.25, env: { a: 0.01, r: 0.2, peak: 0.13, pluck: true, decay: 0.3 } }); at(0.08, { freq: 780, to: 1170, dur: 0.3, partials: [[2, 0.3]], env: { a: 0.01, r: 0.3, peak: 0.1, pluck: true, decay: 0.4 } }); break;
    case 'beacon_light': [0, 0.12, 0.24].forEach((d, i) => at(d, { freq: [523, 659, 784][i], partials: [[2, 0.3]], dur: 0.8, env: { a: 0.01, r: 0.5, peak: 0.1, pluck: true, decay: 0.7 } })); noise(ctx, dest, t, 0.5, 0.05, 'bandpass', 600, 3000); break;
    case 'thread_call': T({ freq: 330, to: 660, type: 'sine', dur: 1, partials: [[2, 0.3]], vib: [7, 15], env: { a: 0.15, r: 0.3, peak: 0.12 } }); break;
    case 'echo_cyan': T({ freq: 1568, dur: 0.3, partials: [[2.01, 0.3]], env: { a: 0.005, r: 0.4, peak: 0.09, pluck: true, decay: 0.4 } }); at(0.22, { freq: 1568, dur: 0.3, env: { a: 0.005, r: 0.4, peak: 0.05, pluck: true, decay: 0.4 } }); at(0.44, { freq: 1568, dur: 0.3, env: { a: 0.005, r: 0.4, peak: 0.025, pluck: true, decay: 0.4 } }); break;
    case 'tick': T({ freq: 1800, type: 'square', lp: 4000, dur: 0.02, env: { a: 0.001, r: 0.02, peak: 0.1, pluck: true, decay: 0.02 } }); break;
    case 'warning': for (let i = 0; i < 3; i++) at(i * 0.25, { freq: 520, to: 440, type: 'square', lp: 1800, dur: 0.15, env: { a: 0.004, r: 0.04, peak: 0.1 } }); break;
    case 'collapse': T({ freq: 400, to: 40, type: 'sawtooth', lp: 1500, lpTo: 80, dur: 1.6, env: { a: 0.02, r: 0.2, peak: 0.2 } }); noise(ctx, dest, t, 1.6, 0.25, 'lowpass', 3000, 100); break;
    case 'abduct_beam': T({ freq: 140, to: 900, type: 'sawtooth', lp: 600, lpTo: 4500, spread: 14, dur: 2, vib: [6, 25], env: { a: 0.5, r: 0.3, peak: 0.12 } }); noise(ctx, dest, t, 2.1, 0.06, 'bandpass', 800, 5000, 2); break;
    case 'soup_plop': T({ freq: 180, to: 520, dur: 0.14, env: { a: 0.004, r: 0.15, peak: 0.3, pluck: true, decay: 0.2 } }); at(0.2, { freq: 140, to: 380, dur: 0.1, env: { a: 0.004, r: 0.1, peak: 0.15, pluck: true, decay: 0.15 } }); break;
    case 'lane_move': noise(ctx, dest, t, 0.15, 0.2, 'bandpass', 400, 2500, 1.5); break;
    case 'hit': T({ freq: 180, to: 50, type: 'sawtooth', lp: 900, dur: 0.3, env: { a: 0.002, r: 0.15, peak: 0.28, pluck: true, decay: 0.3 } }); noise(ctx, dest, t, 0.25, 0.22, 'lowpass', 2500, 300); break;
    case 'anchor_pickup': [784, 1175, 1568].forEach((f, i) => at(i * 0.07, { freq: f, type: 'triangle', dur: 0.3, partials: [[2, 0.2]], env: { a: 0.004, r: 0.25, peak: 0.12, pluck: true, decay: 0.3 } })); break;
    case 'thread_snap': T({ freq: 420, to: 180, type: 'triangle', dur: 0.5, partials: [[2.4, 0.4], [3.9, 0.2]], vib: [45, 60], env: { a: 0.002, r: 0.2, peak: 0.2, pluck: true, decay: 0.5 } }); noise(ctx, dest, t, 0.03, 0.2, 'highpass', 3000); break;
    case 'cosmic_boom': T({ freq: 90, to: 28, dur: 1.8, env: { a: 0.01, r: 0.3, peak: 0.6, pluck: true, decay: 1.8 } }); noise(ctx, dest, t, 1.5, 0.3, 'lowpass', 800, 60); break;
    case 'reunion_chime': [[523, 0], [659, 0.05], [784, 0.1], [1047, 0.15]].forEach(([f, d]) => at(d, { freq: f, partials: [[2.76, 0.18], [4, 0.08]], dur: 2, env: { a: 0.006, r: 0.6, peak: 0.1, pluck: true, decay: 2.2 } })); break;
    case 'pickup': T({ freq: 700, to: 1400, type: 'triangle', dur: 0.12, env: { a: 0.004, r: 0.1, peak: 0.14, pluck: true, decay: 0.2 } }); at(0.1, { freq: 1400, type: 'triangle', dur: 0.1, env: { a: 0.004, r: 0.12, peak: 0.1, pluck: true, decay: 0.15 } }); break;
    case 'fuel_burn': noise(ctx, dest, t, 0.8, 0.15, 'bandpass', 600, 1800, 0.8); T({ freq: 90, to: 140, type: 'sawtooth', lp: 400, dur: 0.8, env: { a: 0.1, r: 0.1, peak: 0.08 } }); break;
  }
}
