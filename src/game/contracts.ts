// SHARED CONTRACT for the Director's Cut. Owned by the coordinator: change only with approval.
import type { FlowController, FlowSnapshot, Character } from '../flow/flow';
import type { MusicId, SfxId } from './content/lines';

export const GAME_W = 960;
export const GAME_H = 540;

export const SCENES = {
  Boot: 'BootScene', Title: 'TitleScene', Intro: 'IntroScene', Select: 'SelectScene', Forest: 'ForestScene', Reunion: 'ReunionScene',
  Abduction: 'AbductionScene', Office: 'OfficeScene', Soup: 'SoupScene', Runner: 'RunnerScene', RunnerResult: 'RunnerResultScene', Ending: 'EndingScene',
} as const;

export interface DCSettings { relaxed: boolean; reduceMotion: boolean; muted: boolean; music: number; voice: number; sfx: number }

/** Audio facade. Implemented in src/game/audio/dcAudio.ts. Never throws; silently falls back to synthesised stand-ins if a file is missing. */
export interface DCAudio {
  unlock(): void;                                             // call from the first user gesture
  playMusic(id: MusicId, opts?: { fadeMs?: number }): void;   // crossfades from the current track; same id = no restart
  stopMusic(fadeMs?: number): void;
  /** 0 = healthy bond, 1 = connection collapsing. Lowers music volume + lowpass; voices stay intelligible. Smooth ramps. */
  setBondStress(v01: number): void;
  playVoice(id: string): Promise<void>;                       // resolves when the line ends (or when skipped). Unknown id resolves immediately.
  skipVoice(): void;
  /** true while a voice line is playing (demo mode waits for it instead of cutting it off) */
  isVoiceBusy?(): boolean;
  playSfx(id: SfxId): void;
  setMuted(m: boolean): void;
  setBus(bus: 'music' | 'voice' | 'sfx', volume01: number): void;
}

export interface ForestSummary {
  won: boolean; character: Character; seed: number; secondsUsed: number; secondsLeft: number;
  branches: number;          // forks that really happened (both actors)
  callsMade: number; partnerActions: number; usedAlternateHistory: boolean;
  decisions: string[];       // short human-readable lines for the success summary
}

/** Results the scenes hand to each other (summary text for the endings). */
export interface DCSession {
  forestSummary: ForestSummary | null;
  runnerStats: { hits: number; anchors: number; seed: number; won: boolean } | null;
}

export interface DCServices {
  flow: FlowController; audio: DCAudio; settings: DCSettings; session: DCSession;
  toast(msg: string): void;
}

export interface SceneData { snap: FlowSnapshot; phase?: string; win?: boolean; kind?: string }
