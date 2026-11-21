// Partner voice lines (pre-rendered via ElevenLabs as voice_<cue>.mp3) and hint strings.
import type { VoiceCue } from '../sim/types';

export const VOICE_LINES: Record<VoiceCue, string> = {
  boot: "I can hear you. I don't know where you are.",
  find: "I'll follow the strongest trace. Just keep the light on.",
  safe: 'I\'m staying here for a moment. This world is holding.',
  help: "I can reach towards your path. It'll cost me.",
  echo_received: 'You gave that up for me? I felt it.',
  divergence: 'There are too many versions of your voice.',
  overstrain: "Please. We can't keep borrowing from tomorrow.",
  anchor: 'I found it. Something here remembers us both.',
  final: 'There you are.',
};

export const VOICE_CUES = Object.keys(VOICE_LINES) as VoiceCue[];

/** Actionable hint strings shown via REJECTED events. Never generic "LOCK FAILED". */
export const HINTS = {
  RETRACE_SIGNAL: 'RETRACE TO AN EARLIER SIGNAL BRANCH',
  REST: 'REST AT A THREAD TERMINAL TO LOWER STRAIN',
  LANTERN_PLAYER: 'THE LANTERN IS DARK: RESOLVE ITS FORK UNTIL LIGHT AND SIGNAL REACH 2',
  GREENHOUSE_PLAYER: 'THE SEEDBED IS NOT TENDED: GROW THE GARDEN TO 2 AND KEEP WATER AT 1 OR LESS',
  LIGHTHOUSE_PLAYER: 'THE BEACON CANNOT SEE YOU: OPEN THE COAST AT THE TIDE AND RAISE SIGNAL TO 2',
  PARTNER_WAIT: 'YOUR PARTNER HAS NOT ARRIVED: REST AT A THREAD TERMINAL OR ASK THEM TO FIND YOU',
  ORDER: 'ALIGN THE LANTERN AND THE GREENHOUSE BEFORE THE LIGHTHOUSE',
  DRIFT: 'YOUR WORLDS ARE TOO FAR APART: LAY A HAND ON THE ECHO STONES, OR WAIT FOR YOUR PARTNER TO CLIMB BACK',
  ECHO_FULL: 'THE PARTNER ALREADY HOLDS TWO ECHOES: ASK THEM TO HELP, OR REST, BEFORE GIVING MORE',
  TUTORIAL: (id: string) => `NOT YET: THE ${id.toUpperCase()} CALLS TO YOU FIRST`,
  DONE: 'THE THREAD IS WHOLE. START A NEW RUN TO PLAY AGAIN',
} as const;

/** First-touch captions (transient, in-world). Verbs: E keep it, Q send it across, F let it be. */
export const INTRO: Record<string, string> = {
  lantern: 'An old lamp. Keep its light, send it across to someone far away, or let it be.',
  bridge: 'A bridge over the river. Whatever you do here, the other bank answers.',
  radio: 'A signal mast, humming. Something on the line is not from this world.',
  greenhouse: 'A flooded nursery. The seedbed drinks whatever water you leave it.',
  tide: 'A tidal gate. The sand road to the lighthouse is under water until it turns.',
  thread_terminal: 'A thread terminal. Resting here loosens the knot between you.',
  anchor_LANTERN: 'An anchor stone by the road. It wants a lit lamp, here and elsewhere.',
  anchor_GREENHOUSE: 'An anchor stone by the garden. It wants a living seedbed, here and elsewhere.',
  anchor_LIGHTHOUSE: 'The lighthouse. It only answers once the other two have held.',
  stones: 'Old echo stones. They remember both of you, and they are calm to touch.',
};

export const WARNINGS: Record<1 | 2 | 3, string> = {
  1: 'The thread frays. The old echo stones, on the far bank, still remember you both.',
  2: 'You are coming apart. Rest at the thread terminal, or lay a hand on the echo stones.',
  3: 'Almost gone. The stones and the terminal can still hold you. Go now.',
};

export const FADE_TEXT = 'The thread frays past mending. Two worlds, no longer one. (FADE)';
export const ALIEN_TEXT = 'The mast answers in a voice that is no one\'s. The town grows over with strange leaves. Touch the stones to come back.';
export const STONES_TEXT = 'The stones are warm. The knot loosens.';
export const TERMINAL_TEXT = 'You rest at the terminal. The knot loosens.';
export const TOO_FAR = 'TOO FAR: WALK UP TO IT FIRST';
