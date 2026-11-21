// Partner voice lines (pre-rendered as voice_<cue>.mp3) and factual environmental clues. No numbers, no stats.
import type { VoiceCue } from '../sim/types';

export const VOICE_LINES: Record<VoiceCue, string> = {
  boot: "I can hear you. I don't know where you are.",
  find: "I'll head for the place you named. Keep the light on.",
  safe: "I'm staying here a moment. This side is holding.",
  help: "I can try what you described. Give me a moment.",
  echo_received: 'I heard that. I felt it.',
  divergence: 'Your voice is coming from too many places.',
  overstrain: "Please. We can't keep calling like this.",
  anchor: 'Something here remembers us both.',
  final: 'There you are.',
  clear: 'I hear you. Clearly this time.',
  distant: "You're far away. Say it again?",
  refusal: "Not now. I can't spare anything. Let me steady myself first.",
};
export const VOICE_CUES = Object.keys(VOICE_LINES) as VoiceCue[];

/** Static clue strings (kept for UI compatibility). Real clues come from the engine, per object and state. */
export const HINTS = {
  REST: 'Rest by the garden, the stones or the thread terminal until the Thread settles.',
  DONE: 'The Thread has settled. Start a new run to play again.',
} as const;

/** First-touch captions (transient, in-world). */
export const INTRO: Record<string, string> = {
  lantern: 'An old lantern in the clearing. Cold, but the glass is whole. It would take fuel.',
  bridge: 'A bridge over the stream. Boards are missing, and the water runs high.',
  radio: 'An old radio on the far bank, humming with something that is not this world.',
  greenhouse: 'A small garden of seedlings. Dry fibre grows here; so does shelter.',
  tide: 'A sluice gate holds the stream back. The ford and the sand path lie under water.',
  thread_terminal: 'A thread stone. Resting here loosens the knot between you.',
  anchor_LANTERN: 'A marker stone by the road. It rings when a lit lantern stands near.',
  anchor_GREENHOUSE: 'A marker stone by the garden, carved half a thread. The other half is across the river.',
  anchor_LIGHTHOUSE: 'The lookout. An iron bowl waits on top, unlit.',
  stones: 'Old echo stones. They hum a three-note motif when the radio is tuned.',
  wheel: 'A waterwheel beside the sluice. It feeds a cable that runs toward the radio.',
  inscription: 'A carved stone on the sand path, worn smooth by tides.',
  planks: 'A pile of weathered planks.',
  woodpile: 'A stack of dry wood under the trees.',
};

export const WARNINGS: Record<1 | 2 | 3, string> = {
  1: 'The Thread frays. The colours dull at the edges. Rest, or let the other side catch up.',
  2: 'Their voice thins to a single note. Rest at the garden, the stones or the thread stone now.',
  3: 'The Thread goes quiet.',
};

export const FADE_TEXT = 'The Thread frays past mending. Two worlds, no longer one.';
export const ALIEN_TEXT = "The radio answers in a voice that is no one's. The forest grows over with strange leaves. The stones will bring you back.";
export const STONES_TEXT = 'The stones are warm. The knot loosens.';
export const TERMINAL_TEXT = 'You rest by the thread stone. The knot loosens.';
export const TOO_FAR = 'Too far. Walk up to it first.';
