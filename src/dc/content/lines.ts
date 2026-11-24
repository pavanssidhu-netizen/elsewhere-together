// All spoken / captioned lines, music ids and SFX ids. SHARED CONTRACT: scenes, audio and tests all import from here.
// Voice files (when generated) live at assets/dc/audio/voice/<id>.mp3 ; music at assets/dc/audio/music/<id>.mp3 ; sfx at assets/dc/audio/sfx/<id>.mp3.
export type Speaker = 'TIME_MASTER' | 'JENSEN' | 'SAM';
export interface Line { id: string; who: Speaker; text: string; mood?: 'serious' | 'sarcastic' | 'urgent' | 'smug' | 'crying' | 'cheery' }

export const LINES: Line[] = [
  // --- Stage 1: cosmic intro (Time Master, voice only; his appearance is NOT revealed here)
  { id: 'tm_intro_1', who: 'TIME_MASTER', text: 'A disturbance in the timeline.', mood: 'serious' },
  { id: 'tm_intro_2', who: 'TIME_MASTER', text: 'Interesting. An anomaly of rather extraordinary proportions.', mood: 'serious' },
  { id: 'tm_intro_3', who: 'TIME_MASTER', text: 'Surely the work of a civilisation with a profound understanding of temporal mechanics.', mood: 'serious' },
  { id: 'tm_intro_4', who: 'TIME_MASTER', text: 'Oh.', mood: 'sarcastic' },
  { id: 'tm_intro_5', who: 'TIME_MASTER', text: 'Two mushrooms.', mood: 'sarcastic' },
  { id: 'tm_intro_6', who: 'TIME_MASTER', text: "They've touched the beacon.", mood: 'sarcastic' },
  { id: 'tm_intro_7', who: 'TIME_MASTER', text: 'Of course they have.', mood: 'sarcastic' },
  { id: 'tm_intro_8', who: 'TIME_MASTER', text: 'Well, they have three minutes to put themselves back together before their connection collapses.', mood: 'serious' },
  { id: 'tm_intro_9', who: 'TIME_MASTER', text: 'Honestly. I leave the timeline unattended for five minutes...', mood: 'sarcastic' },
  // --- Stage 2: forest
  { id: 'tm_start', who: 'TIME_MASTER', text: 'Your brother is trapped in another time. Restore both beacons before the Thread fades.', mood: 'serious' },
  { id: 'tm_time_120', who: 'TIME_MASTER', text: 'Two minutes remain. Do try to look busy.', mood: 'sarcastic' },
  { id: 'tm_time_60', who: 'TIME_MASTER', text: 'One minute. I am not saying it is hopeless. I am saying it is a minute.', mood: 'sarcastic' },
  { id: 'tm_time_30', who: 'TIME_MASTER', text: 'Thirty seconds. This is the part where one hurries.', mood: 'urgent' },
  { id: 'tm_time_10', who: 'TIME_MASTER', text: 'Ten seconds! Mushrooms! Please!', mood: 'urgent' },
  { id: 'tm_forest_fail', who: 'TIME_MASTER', text: 'And that is time. Splendid. Truly.', mood: 'sarcastic' },
  { id: 'jensen_cheer', who: 'JENSEN', text: 'Yay!', mood: 'cheery' },
  { id: 'sam_cheer', who: 'SAM', text: 'Woo!', mood: 'cheery' },
  { id: 'jensen_hmm', who: 'JENSEN', text: 'Hm?', mood: 'cheery' },
  { id: 'sam_hmm', who: 'SAM', text: 'Huh?', mood: 'cheery' },
  // --- Stage 3: office
  { id: 'tm_office_1', who: 'TIME_MASTER', text: 'Well. That went spectacularly badly.', mood: 'smug' },
  { id: 'tm_office_2', who: 'TIME_MASTER', text: 'Fortunately, I am the Time Master.', mood: 'smug' },
  { id: 'tm_office_3', who: 'TIME_MASTER', text: 'I can repair this entire mess in seconds.', mood: 'smug' },
  { id: 'tm_office_4', who: 'TIME_MASTER', text: 'All I require is a little gratitude.', mood: 'smug' },
  { id: 'tm_office_5', who: 'TIME_MASTER', text: 'Go on. Beg.', mood: 'smug' },
  { id: 'tm_refuse', who: 'TIME_MASTER', text: 'Very well. Into the soup.', mood: 'sarcastic' },
  { id: 'tm_soup_after', who: 'TIME_MASTER', text: 'There. Reality, repaired. You may thank me never.', mood: 'smug' },
  { id: 'tm_accept_1', who: 'TIME_MASTER', text: 'Excellent. I knew you had good manners.', mood: 'smug' },
  { id: 'tm_accept_2', who: 'TIME_MASTER', text: "Now, naturally, you'll be doing the difficult part.", mood: 'smug' },
  // --- Stage 4: runner results
  { id: 'tm_runner_win', who: 'TIME_MASTER', text: 'And that, naturally, was entirely my doing.', mood: 'smug' },
  { id: 'tm_runner_fail', who: 'TIME_MASTER', text: 'No. No, no, no. This is not how it was meant to go.', mood: 'crying' },
];
export const LINE_BY_ID: Record<string, Line> = Object.fromEntries(LINES.map(l => [l.id, l]));
export type VoiceId = (typeof LINES)[number]['id'];

export const MUSIC_IDS = ['cosmic', 'forest', 'final_minute', 'office', 'runner', 'reunion'] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export const SFX_IDS = [
  'beep', 'ui_click', 'ui_confirm', 'pink_flash', 'branch', 'beacon_light', 'thread_call', 'echo_cyan', 'tick', 'warning',
  'collapse', 'abduct_beam', 'soup_plop', 'lane_move', 'hit', 'anchor_pickup', 'thread_snap', 'cosmic_boom', 'reunion_chime', 'pickup', 'fuel_burn',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const TITLE = 'OUT OF SYNC';
export const TAGLINE = 'Two mushrooms broke time. Now somebody has to put it back.';
export const INSTRUCTION = 'Your brother is trapped in another time. Restore both beacons before the Thread fades.';
