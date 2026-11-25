import { LINES, MUSIC_IDS, SFX_IDS } from '../../src/game/content/lines';
import { MUSIC_DURATIONS_SEC, SFX_DURATIONS } from '../../src/game/audio/plan';

/** Shape of public/assets/game/audio/lines.json (consumed by scripts/audio/generate_audio.py). */
export function buildLinesJson() {
  return {
    lines: LINES.map(l => ({ id: l.id, who: l.who, text: l.text, mood: l.mood ?? 'serious' })),
    music: MUSIC_IDS.map(id => ({ id, durationSec: MUSIC_DURATIONS_SEC[id] })),
    sfx: SFX_IDS.map(id => ({ id, durationSec: SFX_DURATIONS[id] })),
  };
}
