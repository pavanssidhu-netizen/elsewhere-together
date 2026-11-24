// Pure forest2 run state: 3 stages, Thread charges, score, medals, Chrono-Mastery stars. No Phaser/DOM.
import type { Order, RoomId, Stage, StageView } from './api';
import type { Character } from '../../flow/flow';
import type { ForestSummary } from '../contracts';
import { hash32 } from '../../sim/rng';
import { createStage, STANDARD_BUDGET } from './sim';

export const MEDAL_BRONZE = 3500;
export const MEDAL_SILVER = 6500;
export const MEDAL_GOLD = 9500;
export const CHARGES_NORMAL = 3;
export const CHARGES_RELAXED = 5;
export const STARS_KEY = 'oos-dc-stars';
export type Medal = 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD';

export function medalFor(total: number): Medal {
  return total >= MEDAL_GOLD ? 'GOLD' : total >= MEDAL_SILVER ? 'SILVER' : total >= MEDAL_BRONZE ? 'BRONZE' : 'NONE';
}

/** Which orders have ever cleared a stage; a Chrono-Mastery Star = both. */
export interface StarStore {
  get(stageId: RoomId): { PAST_FIRST: boolean; FUTURE_FIRST: boolean };
  mark(stageId: RoomId, order: Order): void;
}

export class MemoryStarStore implements StarStore {
  private d: Record<string, { PAST_FIRST: boolean; FUTURE_FIRST: boolean }> = {};
  get(id: RoomId) { return { ...(this.d[id] ?? { PAST_FIRST: false, FUTURE_FIRST: false }) }; }
  mark(id: RoomId, order: Order) { this.d[id] = { ...this.get(id), [order]: true }; }
}

/** localStorage-backed; silently degrades to memory when storage is missing (node/tests) or throws. */
export class LocalStarStore implements StarStore {
  private mem = new MemoryStarStore();
  private ls(): Storage | null {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
  }
  private read(): Record<string, { PAST_FIRST: boolean; FUTURE_FIRST: boolean }> {
    const s = this.ls();
    if (!s) return {};
    try { return JSON.parse(s.getItem(STARS_KEY) ?? '{}') ?? {}; } catch { return {}; }
  }
  get(id: RoomId) {
    const v = this.read()[id];
    const m = this.mem.get(id);
    return { PAST_FIRST: !!v?.PAST_FIRST || m.PAST_FIRST, FUTURE_FIRST: !!v?.FUTURE_FIRST || m.FUTURE_FIRST };
  }
  mark(id: RoomId, order: Order) {
    this.mem.mark(id, order);
    const s = this.ls();
    if (!s) return;
    try {
      const all = this.read();
      all[id] = { ...this.get(id), [order]: true };
      s.setItem(STARS_KEY, JSON.stringify(all));
    } catch { /* storage full or blocked: ignore */ }
  }
}

export interface StageRecord { room: RoomId; order: Order; spare: number; score: number; attempts: number }
export interface RunOptions { relaxed?: boolean; character?: Character; stars?: StarStore }
export type RunStatus = 'CHOOSING' | 'PLAYING' | 'WON' | 'LOST';
export interface AttemptResult { cleared: boolean; view: StageView; chargesLeft: number; run: RunStatus; starEarned: boolean }

const ROOM_ORDER: RoomId[] = [1, 2, 3];

export class ForestRun {
  readonly seed: number;
  readonly relaxed: boolean;
  readonly character: Character;
  readonly stars: StarStore;
  charges: number;
  stageIndex = 0;
  status: RunStatus = 'CHOOSING';
  total = 0;
  records: StageRecord[] = [];
  starsEarned: RoomId[] = [];
  current: Stage | null = null;
  currentOrder: Order | null = null;
  private attemptsThisStage = 0;
  private ordersUsed = new Set<Order>();
  private loops = 0;
  private pins = 0;
  private ghostBeats = 0;

  constructor(seed: number, opts: RunOptions = {}) {
    this.seed = seed >>> 0;
    this.relaxed = !!opts.relaxed;
    this.character = opts.character ?? 'SAM';
    this.stars = opts.stars ?? new LocalStarStore();
    this.charges = this.relaxed ? CHARGES_RELAXED : CHARGES_NORMAL;
  }

  get roomId(): RoomId { return ROOM_ORDER[Math.min(this.stageIndex, 2)]; }
  /** Seed for the current stage (same for every attempt of that stage, so the room variant is stable). */
  get stageSeed(): number { return hash32(this.seed, 'forest2-stage', this.stageIndex); }
  /** Order pre-highlighted on the choice screen. */
  get suggestedOrder(): Order { return this.character === 'SAM' ? 'PAST_FIRST' : 'FUTURE_FIRST'; }
  get medal(): Medal { return medalFor(this.total); }

  startAttempt(order: Order): Stage {
    if (this.status === 'WON' || this.status === 'LOST') throw new Error('run is over');
    this.current = createStage(this.roomId, order, this.stageSeed, { relaxed: this.relaxed });
    this.currentOrder = order;
    this.ordersUsed.add(order);
    this.attemptsThisStage++;
    this.status = 'PLAYING';
    return this.current;
  }

  /** Call when the current stage view is CLEARED or FAILED. Returns undefined while still in progress. */
  finishAttempt(): AttemptResult | undefined {
    if (!this.current || !this.currentOrder) return undefined;
    const view = this.current.view();
    if (view.status !== 'CLEARED' && view.status !== 'FAILED') return undefined;
    const rec = this.current.recording();
    this.loops += (rec.phase1.length ? 1 : 0) + (rec.phase2.length ? 1 : 0);
    this.pins += view.pins.length;
    this.ghostBeats += view.ghost ? view.ghost.beatIndex : 0;
    const order = this.currentOrder;
    let starEarned = false;
    if (view.status === 'CLEARED') {
      const room = this.roomId;
      const before = this.stars.get(room);
      this.stars.mark(room, order);
      const after = this.stars.get(room);
      starEarned = !(before.PAST_FIRST && before.FUTURE_FIRST) && after.PAST_FIRST && after.FUTURE_FIRST;
      if (starEarned) this.starsEarned.push(room);
      this.total += view.score.total;
      this.records.push({ room, order, spare: Math.max(0, STANDARD_BUDGET - view.beat), score: view.score.total, attempts: this.attemptsThisStage });
      this.stageIndex++;
      this.attemptsThisStage = 0;
      this.status = this.stageIndex >= ROOM_ORDER.length ? 'WON' : 'CHOOSING';
    } else {
      this.charges--;
      this.status = this.charges <= 0 ? 'LOST' : 'CHOOSING';
    }
    this.current = null; this.currentOrder = null;
    return { cleared: view.status === 'CLEARED', view, chargesLeft: this.charges, run: this.status, starEarned };
  }

  get usedAlternateHistory(): boolean { return this.ordersUsed.size >= 2; }

  summaryLines(): string[] {
    const lines = this.records.map((r) => {
      const who = r.order === 'PAST_FIRST' ? 'Sam' : 'Jensen';
      return `Stage ${r.room} cleared as ${who} first, ${r.spare} beat${r.spare === 1 ? '' : 's'} spare`;
    });
    for (const s of this.starsEarned) lines.push(`Stage ${s}: Chrono-Mastery Star earned (cleared both ways)`);
    if (this.medal !== 'NONE') lines.push(`${this.medal[0]}${this.medal.slice(1).toLowerCase()} medal, ${this.total} points`);
    return lines;
  }

  toForestSummary(): ForestSummary {
    return {
      won: this.status === 'WON', character: this.character, seed: this.seed,
      secondsUsed: 0, secondsLeft: 0, // unused in the turn-based forest
      branches: this.loops, callsMade: this.pins, partnerActions: this.ghostBeats,
      usedAlternateHistory: this.usedAlternateHistory, decisions: this.summaryLines(),
    };
  }
}
