// Director's Cut: central, pure flow controller. No Phaser, no DOM, no wall clock.
// Scenes ask it what state we are in; it owns routing, seeds, pause and the "may timers run?" rule.
import { hash32 } from '../sim/rng';

export type FlowState =
  | 'TITLE' | 'COSMIC_INTRO' | 'CHARACTER_SELECT'
  | 'FOREST_GAME' | 'FOREST_SUCCESS' | 'FOREST_FAILURE'
  | 'ABDUCTION' | 'TIME_MASTER_OFFICE' | 'SOUP_ENDING'
  | 'THREAD_RUNNER' | 'RUNNER_SUCCESS' | 'RUNNER_FAILURE'
  | 'REUNION_ENDING' | 'FINAL_ENDING';

export type Character = 'JENSEN' | 'SAM';
export type EndingKind = 'FOREST_REUNION' | 'SOUP' | 'RUNNER_REPAIRED' | 'RUNNER_COLLAPSE';

export type FlowEvent =
  | { type: 'START' }                                   // title -> intro
  | { type: 'SKIP' }                                    // skip the current cutscene (never breaks state)
  | { type: 'SELECT'; character: Character }
  | { type: 'FOREST_WON' } | { type: 'FOREST_LOST' }   // timer / sim result
  | { type: 'CONTINUE' }                                // a non-interactive beat finished (same as SKIP where skippable)
  | { type: 'REFUSE' } | { type: 'ACCEPT' }             // office choice
  | { type: 'RUNNER_WON' } | { type: 'RUNNER_LOST' }
  | { type: 'RETRY' }                                   // instant retry of the current minigame
  | { type: 'REPLAY' }                                  // whole story again
  | { type: 'RESTART_FOREST' } | { type: 'RESTART_RUNNER' }
  | { type: 'PAUSE' } | { type: 'RESUME' };

export interface Outcome { game: 'FOREST' | 'RUNNER'; result: 'WIN' | 'LOSE'; seed: number; character: Character | null }

export interface FlowSnapshot {
  state: FlowState; paused: boolean; character: Character | null;
  baseSeed: number; forestSeed: number | null; runnerSeed: number | null;
  attempts: { forest: number; runner: number };
  lastOutcome: Outcome | null; outcomes: Outcome[]; ending: EndingKind | null;
  history: FlowState[];
}

/** Cutscenes and menus: gameplay timers must not advance here. */
const GAMEPLAY: ReadonlySet<FlowState> = new Set<FlowState>(['FOREST_GAME', 'THREAD_RUNNER']);
const SKIPPABLE: ReadonlySet<FlowState> = new Set<FlowState>([
  'COSMIC_INTRO', 'ABDUCTION', 'TIME_MASTER_OFFICE', 'SOUP_ENDING', 'FOREST_SUCCESS', 'FOREST_FAILURE', 'RUNNER_SUCCESS', 'RUNNER_FAILURE', 'REUNION_ENDING',
]);

export class FlowController {
  private s: FlowSnapshot;
  private listeners = new Set<(s: Readonly<FlowSnapshot>, e: FlowEvent) => void>();

  constructor(baseSeed = 48219) {
    this.s = {
      state: 'TITLE', paused: false, character: null, baseSeed, forestSeed: null, runnerSeed: null,
      attempts: { forest: 0, runner: 0 }, lastOutcome: null, outcomes: [], ending: null, history: ['TITLE'],
    };
  }

  get state(): FlowState { return this.s.state; }
  snapshot(): Readonly<FlowSnapshot> { return JSON.parse(JSON.stringify(this.s)); }
  subscribe(fn: (s: Readonly<FlowSnapshot>, e: FlowEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Gameplay timers (countdown, runner clock, partner AI ticks) may advance only when this is true. */
  get timersRunning(): boolean { return GAMEPLAY.has(this.s.state) && !this.s.paused; }
  get skippable(): boolean { return SKIPPABLE.has(this.s.state); }
  get isEnding(): boolean { return this.s.ending !== null; }

  /** Deterministic per-attempt seed so a retry is new but replayable. */
  private seedFor(game: 'forest' | 'runner'): number {
    return hash32(this.s.baseSeed, game, this.s.attempts[game]);
  }

  private go(next: FlowState): void { this.s.state = next; this.s.history.push(next); }

  private record(game: 'FOREST' | 'RUNNER', result: 'WIN' | 'LOSE'): void {
    const seed = (game === 'FOREST' ? this.s.forestSeed : this.s.runnerSeed) ?? 0;
    const o: Outcome = { game, result, seed, character: this.s.character };
    this.s.lastOutcome = o; this.s.outcomes.push(o);
  }

  private startForest(): void {
    this.s.attempts.forest++;
    this.s.forestSeed = this.seedFor('forest');
    this.go('FOREST_GAME');
  }
  private startRunner(): void {
    this.s.attempts.runner++;
    this.s.runnerSeed = this.seedFor('runner');
    this.go('THREAD_RUNNER');
  }
  private finish(kind: EndingKind, state: FlowState): void { this.s.ending = kind; this.go(state); }

  /** Returns true if the event changed state. Invalid or out-of-place events are ignored, never throw. */
  dispatch(e: FlowEvent): boolean {
    const s = this.s;
    const before = JSON.stringify(s);
    switch (e.type) {
      case 'PAUSE': if (GAMEPLAY.has(s.state)) s.paused = true; break;
      case 'RESUME': s.paused = false; break;
      case 'REPLAY':
        if (s.ending !== null) { // full story again; keep the base seed, bump nothing else
          s.character = null; s.ending = null; s.paused = false; s.forestSeed = null; s.runnerSeed = null; this.go('TITLE');
        }
        break;
      case 'RESTART_FOREST': // any time after the forest has been unlocked
        if (s.character && (s.attempts.forest > 0)) { s.paused = false; s.ending = null; this.startForest(); }
        break;
      case 'RESTART_RUNNER': // only once the runner has been unlocked
        if (s.history.includes('TIME_MASTER_OFFICE')) { s.paused = false; s.ending = null; this.startRunner(); }
        break;
      default: this.step(e);
    }
    const changed = JSON.stringify(s) !== before;
    if (changed) for (const l of [...this.listeners]) l(this.snapshot(), e);
    return changed;
  }

  private step(e: FlowEvent): void {
    const s = this.s;
    if (s.paused && e.type !== 'SKIP') return; // a paused game accepts nothing but resume (handled above)
    const next = (ev: FlowEvent['type']) => e.type === ev || (e.type === 'SKIP' && this.skippable) || e.type === 'CONTINUE';
    switch (s.state) {
      case 'TITLE': if (e.type === 'START') this.go('COSMIC_INTRO'); break;
      case 'COSMIC_INTRO': if (e.type === 'SKIP' || e.type === 'CONTINUE') this.go('CHARACTER_SELECT'); break;
      case 'CHARACTER_SELECT': if (e.type === 'SELECT') { s.character = e.character; this.startForest(); } break;
      case 'FOREST_GAME':
        if (e.type === 'FOREST_WON') { this.record('FOREST', 'WIN'); this.go('FOREST_SUCCESS'); }
        else if (e.type === 'FOREST_LOST') { this.record('FOREST', 'LOSE'); this.go('FOREST_FAILURE'); }
        break;
      case 'FOREST_SUCCESS': if (next('CONTINUE')) this.finish('FOREST_REUNION', 'REUNION_ENDING'); break;
      case 'FOREST_FAILURE': if (next('CONTINUE')) this.go('ABDUCTION'); break;
      case 'ABDUCTION': if (next('CONTINUE')) this.go('TIME_MASTER_OFFICE'); break;
      case 'TIME_MASTER_OFFICE':
        if (e.type === 'REFUSE') { s.ending = 'SOUP'; this.go('SOUP_ENDING'); }
        else if (e.type === 'ACCEPT') this.startRunner();
        else if (e.type === 'SKIP') this.go('TIME_MASTER_OFFICE'); // skipping dialogue leaves the choice on screen
        break;
      case 'THREAD_RUNNER':
        if (e.type === 'RUNNER_WON') { this.record('RUNNER', 'WIN'); this.go('RUNNER_SUCCESS'); }
        else if (e.type === 'RUNNER_LOST') { this.record('RUNNER', 'LOSE'); this.go('RUNNER_FAILURE'); }
        break;
      case 'RUNNER_SUCCESS': if (next('CONTINUE')) this.finish('RUNNER_REPAIRED', 'FINAL_ENDING'); break;
      case 'RUNNER_FAILURE':
        if (e.type === 'RETRY') this.startRunner();                       // instant retry, new deterministic seed
        else if (next('CONTINUE')) this.finish('RUNNER_COLLAPSE', 'FINAL_ENDING');
        break;
      case 'SOUP_ENDING': case 'REUNION_ENDING': case 'FINAL_ENDING': break; // wait for REPLAY
    }
    // the forest also offers an instant retry from its failure beat
    if (s.state === 'FOREST_FAILURE' && e.type === 'RETRY') this.startForest();
  }
}
