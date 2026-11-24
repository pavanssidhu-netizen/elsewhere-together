import type { DCAudio, DCSettings } from '../contracts';
// STUB: replaced by the audio agent. Silent, never throws.
export function createDCAudio(_s: DCSettings): DCAudio {
  return {
    unlock() {}, playMusic() {}, stopMusic() {}, setBondStress() {}, playVoice: () => Promise.resolve(), skipVoice() {}, playSfx() {}, setMuted() {}, setBus() {},
  };
}
