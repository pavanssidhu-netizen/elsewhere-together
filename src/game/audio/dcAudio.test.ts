import { describe, expect, it } from 'vitest';
import type { DCSettings } from '../contracts';
import { createDCAudio, getDCAudioDebug } from './dcAudio';

const settings = (): DCSettings => ({ relaxed: false, reduceMotion: false, muted: false, music: 0.7, voice: 1, sfx: 0.8 });

describe('createDCAudio without an AudioContext (node)', () => {
  it('never throws and tracks buses/mute/stress', async () => {
    const s = settings(), a = createDCAudio(s);
    expect(() => { a.playMusic('cosmic'); a.playSfx('beep'); a.unlock(); a.setBondStress(0.8); a.stopMusic(); a.skipVoice(); }).not.toThrow();
    a.setBus('music', 0.25); a.setBus('sfx', 2); a.setMuted(true);
    const d = getDCAudioDebug()!;
    expect(d.buses).toEqual({ music: 0.25, voice: 1, sfx: 1 });
    expect(d.muted).toBe(true); expect(d.stress).toBeCloseTo(0.8); expect(d.unlocked).toBe(false);
    await a.playVoice('no_such_line');
    expect(d.requested['voice:no_such_line']).toBeUndefined();
    expect(getDCAudioDebug()!.requested['voice:no_such_line']).toBe('unknown-id');
  });
  it('playVoice stays correctly paced (and skippable) while locked', async () => {
    const a = createDCAudio(settings()), t0 = Date.now();
    await a.playVoice('tm_intro_4'); // "Oh." -> 465 ms
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
    const p = a.playVoice('tm_intro_3'); a.skipVoice();
    const t1 = Date.now(); await p; expect(Date.now() - t1).toBeLessThan(100);
  });
});
