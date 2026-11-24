// Pure (no Phaser) game model of the forest: verified puzzle config + SimEngine + the 180 s clock. The scene only draws and feeds input into it.
import { SimEngine } from '../../sim/engine';
import { verifiedConfig, MODEL } from '../../sim/verify';
import type { Command, DomainEvent, PuzzleConfig, SimulationState } from '../../sim/types';
import type { ForestSummary } from '../contracts';

export const FOREST_SECONDS = MODEL.BUDGET;            // 180
export const RELAXED_SECONDS = MODEL.RELAXED_BUDGET;   // 300
export const MILESTONES = [120, 60, 30, 10] as const;

export interface ModelTickResult { events: DomainEvent[]; milestones: number[]; lost: boolean }

export class ForestModel {
  readonly engine: SimEngine;
  readonly cfg: PuzzleConfig;
  readonly total: number;
  timeLeft: number;
  elapsed = 0;
  private partnerClock = 0;
  private fired = new Set<number>();
  /** Set once the player has had to ask; wired by the scene to the debug/hint line. */
  calls = 0;

  constructor(readonly seed: number, readonly character: 'SAM' | 'JENSEN', readonly relaxed = false, cfg?: PuzzleConfig) {
    this.cfg = cfg ?? verifiedConfig(seed, character).cfg;
    this.engine = new SimEngine(seed, undefined, false, { cfg: this.cfg });
    this.total = relaxed ? RELAXED_SECONDS : FOREST_SECONDS;
    this.timeLeft = this.total;
  }

  get state(): Readonly<SimulationState> { return this.engine.getState(); }
  get won(): boolean { return this.state.won; }
  get faded(): boolean { return this.state.link === 'FADED' || this.state.phase === 'FADE'; }
  get lost(): boolean { return !this.won && (this.timeLeft <= 0 || this.faded); }

  dispatch(cmd: Command): DomainEvent[] {
    if (cmd.type === 'CALL') this.calls++;
    return this.engine.dispatch(cmd);
  }

  /** Advance the clock by `dt` live seconds (the caller only calls this while the game is live). The partner acts on its own every 3 s. */
  tick(dt: number, partnerTicks = true): ModelTickResult {
    const events: DomainEvent[] = [];
    const milestones: number[] = [];
    if (this.won || this.lost) return { events, milestones, lost: this.lost };
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (partnerTicks) this.partnerClock += dt; else this.partnerClock = 0; // a deliberate wait IS a partner tick
    while (this.partnerClock >= MODEL.PARTNER_TICK) {
      this.partnerClock -= MODEL.PARTNER_TICK;
      if (!this.won && !this.faded) events.push(...this.engine.dispatch({ type: 'ADVANCE_PARTNER' }));
    }
    for (const m of MILESTONES) {
      const left = this.total - this.elapsed;
      if (left <= m && !this.fired.has(m)) { this.fired.add(m); if (left > m - 8) milestones.push(m); }
    }
    return { events, milestones, lost: this.lost };
  }

  summary(won: boolean): ForestSummary {
    const s = this.state;
    const mine = s.v2.journey.filter(j => j.actor === 'player' && j.action === 'FORK');
    const inherited = s.v2.journey.filter(j => j.action === 'TEMPORAL');
    const decisions = [
      ...mine.slice(0, 5).map(j => (j.cause ?? '').split('. ').slice(-1)[0] || (j.effect ?? '')),
      ...inherited.slice(0, 3).map(j => j.effect ?? j.cause ?? ''),
    ].filter(Boolean).slice(0, 7);
    return {
      won, character: this.character, seed: this.seed,
      secondsUsed: Math.round(this.elapsed), secondsLeft: Math.round(Math.max(0, this.total - this.elapsed)),
      branches: Math.max(0, s.events.length - 1), callsMade: s.messages.filter(m => m.from === 'player').length,
      partnerActions: s.v2.journey.filter(j => j.actor === 'partner' && j.action !== 'WAIT' && j.action !== 'TEMPORAL').length,
      usedAlternateHistory: s.retraceCount > 0, decisions,
    };
  }
}

/** 0 = healthy bond .. 1 = collapsing, from the hidden drift/strain and the link state (never shown as a number). */
export function bondStress(s: Readonly<SimulationState>): number {
  const base = Math.max(s.realityDrift / 75, s.bondStrain / 90);
  const link = s.link === 'FADED' ? 1 : s.link === 'LAST_SIGNAL' ? 0.85 : s.link === 'FRAYING' ? 0.5 : 0;
  return Math.max(0, Math.min(1, Math.max(base * 0.8, link)));
}
