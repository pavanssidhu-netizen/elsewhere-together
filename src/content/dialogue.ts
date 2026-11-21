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
  DRIFT: 'YOUR WORLDS ARE TOO FAR APART: RETRACE TO AN EARLIER SIGNAL BRANCH OR ASK YOUR PARTNER TO FIND YOU',
  ECHO_FULL: 'THE PARTNER ALREADY HOLDS TWO ECHOES: ASK THEM TO HELP, OR REST, BEFORE GIVING MORE',
  TUTORIAL: (id: string) => `NOT YET: THE ${id.toUpperCase()} CALLS TO YOU FIRST`,
  DONE: 'THE THREAD IS WHOLE. START A NEW RUN TO PLAY AGAIN',
} as const;
