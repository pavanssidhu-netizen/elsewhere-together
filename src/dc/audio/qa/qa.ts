// QA harness: taps the master output with an analyser so a headless run can prove the signal is non-silent (we cannot hear it).
import { createDCAudio, getDCAudioDebug } from '../dcAudio';
import { LINES, MUSIC_IDS, SFX_IDS } from '../../content/lines';

let analyser: AnalyserNode | null = null;
const orig = AudioContext.prototype.createDynamicsCompressor;
AudioContext.prototype.createDynamicsCompressor = function (this: AudioContext) {
  const c = orig.call(this); analyser = this.createAnalyser(); analyser.fftSize = 2048; c.connect(analyser); return c;
};
const settings = { relaxed: false, reduceMotion: false, muted: false, music: 0.7, voice: 1, sfx: 0.8 };
const audio = createDCAudio(settings);
const buf = new Float32Array(2048);
/** peak of the master output over `ms` */
const peak = (ms: number) => new Promise<number>(res => {
  let p = 0; const t0 = performance.now();
  const f = () => {
    if (analyser) { analyser.getFloatTimeDomainData(buf); for (const v of buf) p = Math.max(p, Math.abs(v)); }
    if (performance.now() - t0 < ms) setTimeout(f, 20); else res(p);
  };
  f();
});
document.getElementById('go')!.addEventListener('click', () => audio.unlock());
(window as any).__qa = { audio, debug: getDCAudioDebug, peak, LINES, MUSIC_IDS, SFX_IDS, settings };
