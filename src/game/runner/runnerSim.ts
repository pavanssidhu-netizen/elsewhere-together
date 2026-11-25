// 'Stitch the Timeline': pure, fixed-timestep, seeded simulation of the 4-lane thread runner.
// No Math.random, no wall clock, no Phaser. All rules are integer ticks so validation is exact.
import { mulberry32, hash32 } from '../../shared/rng';

export const LANES = 4;
/** Lane the thread starts in (second from the left). */
export const START_LANE = 1;
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
/** One lane change per this many ticks (0.18 s). */
export const MOVE_COOLDOWN = 11;
/** A pressed move that cannot be applied yet is kept this many ticks (input buffer). */
export const MOVE_BUFFER = 10;
export const MAX_HITS = 3;
export const ANCHORS_TO_WIN = 3;
/** Ticks before the first row reaches the player (ready/lead-in). */
export const LEAD_TICKS = 130;
/** A decoy anchor looks real, then turns broken this many ticks before it reaches the player (about 0.65 s: one or two lane changes plus a human reaction, no more). */
export const TRAP_FLIP_TICKS = 40;
/** A moving broken anchor finishes sliding sideways this many ticks before it arrives, so its final lane is readable early enough to dodge. */
export const MOVER_SETTLE_TICKS = 34;
/** ...and the slide itself takes this many ticks. */
export const MOVER_SLIDE_TICKS = 56;
/** Safety margin (ticks) the generator keeps on top of cooldown*lane-steps between rows. */
const MARGIN = 2;

export type Move = -1 | 0 | 1;
export interface RunnerInput { move?: Move }
export interface Row {
  tick: number;
  /** bit i set = lane i blocked by a fractured-timeline hazard */
  blocked: number;
  /** lane of the repair anchor in this row, -1 = none */
  anchorLane: number;
  /** 0.. = index of the anchor row (first ANCHORS_TO_WIN are the planned ones, the rest are spares if one is missed) */
  anchorIdx: number;
  /** cosmetic variant, seeded */
  variant: number;
  /** Broken anchor that slides sideways from lane `from` to lane `to` while it falls. `blocked` holds only bit `to`: the lane it ends in. */
  mover?: { from: number; to: number };
  /** Decoy anchor in this lane: collectable-looking until TRAP_FLIP_TICKS before arrival, then broken. `blocked` holds this lane's bit; it is never collectable. */
  trapLane?: number;
}
export type SimEvent =
  | { type: 'lane'; tick: number; from: number; to: number }
  | { type: 'hit'; tick: number; lane: number; hits: number; row: number }
  | { type: 'anchor'; tick: number; lane: number; anchors: number; row: number }
  | { type: 'missed'; tick: number; row: number }
  | { type: 'win'; tick: number }
  | { type: 'lose'; tick: number; reason: 'hits' | 'faded' };
export type Status = 'playing' | 'won' | 'lost';
export interface RunnerResult { status: Status; reason: 'hits' | 'faded' | null; hits: number; anchors: number; ticks: number; seconds: number }
export interface RunnerState {
  tick: number; seconds: number; lane: number; prevLane: number; lastMoveTick: number;
  hits: number; anchors: number; nextRow: number; dist: number; speed: number; progress: number; status: Status;
}

const bit = (lane: number) => 1 << lane;
const LANE_LIST = Array.from({ length: LANES }, (_, i) => i);

/** Minimum ticks between two rows so that the player can go from lane a to lane b. */
export function needTicks(a: number, b: number): number {
  return a === b ? 1 : MOVE_COOLDOWN * Math.abs(a - b) + MARGIN;
}

/** One DP step of the reachable-lane set. Returns the lanes at row `r` that are survivable and reachable from `prev` lanes. */
export function reachNext(prev: readonly number[], prevTick: number, r: Row): number[] {
  const out: number[] = [];
  for (let b = 0; b < LANES; b++) {
    if (r.blocked & bit(b)) continue;
    if (r.anchorLane >= 0 && r.anchorLane !== b) continue; // anchors are forced: the validator insists they are collectable
    if (prev.some(a => r.tick - prevTick >= needTicks(a, b))) out.push(b);
  }
  return out;
}

/** Validator: every row keeps a viable path, anchors included. Returns the index of the first bad row or -1. */
export function validateRows(rows: readonly Row[]): number {
  let reach = [START_LANE]; let t = 0;
  for (let i = 0; i < rows.length; i++) {
    reach = reachNext(reach, t, rows[i]);
    if (reach.length === 0) return i;
    t = rows[i].tick;
  }
  return -1;
}

export interface Tuning { v0: number; vmax: number; rampSec: number; gap0: number; gap1: number; anchorSec: number[]; spare: number[]; moverSec: number[]; trapSec: number }
export const NORMAL: Tuning = { v0: 250, vmax: 430, rampSec: 40, gap0: 1.05, gap1: 0.64, anchorSec: [11.6, 23.4, 35.4], spare: [47.4, 59.4], moverSec: [17.2, 29.0], trapSec: 30.8 };
export const RELAXED: Tuning = { v0: 190, vmax: 320, rampSec: 44, gap0: 1.4, gap1: 0.95, anchorSec: [12.6, 25.4, 38.2], spare: [51, 63.5], moverSec: [18.6, 31.4], trapSec: 33.4 };
const END_SEC = 76;

/** Distance (pixels of scroll) travelled by time `t` seconds. Visual only. */
export function distAt(tu: Tuning, t: number): number {
  const k = (tu.vmax - tu.v0) / tu.rampSec;
  const r = Math.min(t, tu.rampSec);
  return tu.v0 * r + (k * r * r) / 2 + (t > tu.rampSec ? tu.vmax * (t - tu.rampSec) : 0);
}
export function speedAt(tu: Tuning, t: number): number { return tu.v0 + (tu.vmax - tu.v0) * Math.min(1, t / tu.rampSec); }

// Pre-validated templates: lists of blocked-lane masks (bit i = lane i). Each row in a template is still run through the validator.
const SINGLE = [1, 2, 4, 8];
const DOUBLE = [3, 5, 6, 9, 10, 12];          // two open lanes
const TRIPLE = [7, 11, 13, 14];               // one open lane (late and rare)
const ZIGZAG = [[12, 3, 12], [3, 12, 3], [10, 5, 10], [5, 10, 5], [9, 6, 9], [6, 9, 6]]; // forces lane changes (the open pair alternates)
const STAGGER = [[1, 2, 4, 8], [8, 4, 2, 1], [1, 4], [8, 2], [2, 8], [4, 1]];
const pick = <T>(rng: () => number, a: readonly T[]): T => a[Math.floor(rng() * a.length)];

export function generateRows(seed: number, relaxed: boolean): Row[] {
  const tu = relaxed ? RELAXED : NORMAL;
  const rng = mulberry32(hash32('runner-rows', seed, relaxed ? 1 : 0));
  const rows: Row[] = [];
  let reach = [START_LANE]; let lastTick = 0;
  const anchorTicks = [...tu.anchorSec, ...tu.spare].map((s, i) => Math.round((s + (i < 3 ? rng() * 1.3 : 0.4 * rng())) * TICK_HZ));
  let nextAnchor = 0;
  // special rows: two moving broken anchors and one decoy anchor that turns bad (never inside an anchor row)
  const moverTicks = tu.moverSec.map(sec => Math.round((sec + rng() * 1.2) * TICK_HZ));
  let nextMover = 0;
  const trapTick = Math.round((tu.trapSec + rng() * 1.0) * TICK_HZ);
  let trapDone = false; let trapLaneUsed = -1; let lastAnchorLane = -1;
  let cursor = LEAD_TICKS;
  const gapTicks = (tick: number) => {
    const d = Math.min(1, tick / TICK_HZ / 38);
    const g = tu.gap0 + (tu.gap1 - tu.gap0) * d;
    return Math.round((g * (0.92 + rng() * 0.2)) * TICK_HZ);
  };
  const tryAdd = (cand: Row[]): boolean => {
    let r = reach; let t = lastTick;
    for (const c of cand) { r = reachNext(r, t, c); if (r.length === 0) return false; t = c.tick; }
    for (const c of cand) rows.push(c);
    reach = r; lastTick = t; return true;
  };
  const mk = (tick: number, blocked: number, anchorLane = -1, anchorIdx = -1): Row => ({ tick, blocked, anchorLane, anchorIdx, variant: Math.floor(rng() * 8) });
  const endTick = END_SEC * TICK_HZ;
  let guard = 0;
  while (cursor < endTick && guard++ < 2000) {
    const sec = cursor / TICK_HZ;
    const d = Math.min(1, sec / 38);
    if (nextAnchor < anchorTicks.length && cursor >= anchorTicks[nextAnchor]) {
      // anchor row: lane chosen among lanes reachable from the previous row
      const lanes: number[] = [];
      for (let b = 0; b < LANES; b++) if (reach.some(a => cursor - lastTick >= needTicks(a, b))) lanes.push(b);
      // after the decoy, the real third anchor is as far from the decoy's lane as the timing allows: whoever fell for it has to hurry across
      let lane = lanes[Math.floor(rng() * lanes.length)];
      if (trapLaneUsed >= 0 && nextAnchor === ANCHORS_TO_WIN - 1) lane = [...lanes].sort((x, y) => Math.abs(y - trapLaneUsed) - Math.abs(x - trapLaneUsed) || x - y)[0];
      lastAnchorLane = lane;
      let ok = false;
      // sometimes hazards ride along in the other lanes (not in the first anchor, which is a gentle introduction)
      const others = LANE_LIST.filter(l => l !== lane);
      const tries = [nextAnchor === 0 ? 0 : bit(pick(rng, others)), 0];
      for (const m of tries) { if (tryAdd([mk(cursor, m, lane, nextAnchor)])) { ok = true; break; } }
      if (!ok) { cursor += 10; continue; }
      nextAnchor++;
      cursor += gapTicks(cursor) + 12;
      continue;
    }
    // moving broken anchor: slides left to right, ends in the lane that is blocked
    if (nextAnchor < ANCHORS_TO_WIN && nextMover < moverTicks.length && cursor >= moverTicks[nextMover] && cursor < anchorTicks[nextAnchor] - 70) {
      const to = pick(rng, [2, 3]); const from = pick(rng, [0, 1].filter(f => to - f >= 2));
      const row = { ...mk(cursor, bit(to)), mover: { from, to } };
      nextMover++;
      if (tryAdd([row])) { cursor += gapTicks(cursor); continue; }
      cursor += 8; continue;
    }
    // decoy anchor: looks like an anchor, turns broken as it nears the player
    if (nextAnchor < ANCHORS_TO_WIN && !trapDone && cursor >= trapTick && cursor < anchorTicks[nextAnchor] - 60) {
      // the lure sits where the player probably is: in (or next to) the lane of the anchor they just collected
      const near = lastAnchorLane >= 0 ? [lastAnchorLane, Math.min(LANES - 1, lastAnchorLane + 1), Math.max(0, lastAnchorLane - 1)] : LANE_LIST;
      const lane = pick(rng, near);
      const row = { ...mk(cursor, bit(lane)), trapLane: lane };
      if (tryAdd([row])) { trapDone = true; trapLaneUsed = lane; cursor += gapTicks(cursor) + 20; continue; }
      cursor += 8; continue;
    }
    // choose a template by difficulty
    const roll = rng();
    const pDouble = (relaxed ? 0.1 : 0.2) + d * (relaxed ? 0.25 : 0.4);
    const pTriple = d < 0.4 ? 0 : (relaxed ? 0.02 : 0.1) * d;
    const pZig = d < 0.25 ? 0 : (relaxed ? 0.08 : 0.2) * d + (relaxed ? 0 : 0.05);
    const pStag = 0.18;
    let masks: number[];
    if (roll < pZig) masks = pick(rng, ZIGZAG);
    else if (roll < pZig + pStag * (relaxed ? 0.6 : 1)) masks = pick(rng, STAGGER);
    else if (roll < pZig + pStag + pTriple) masks = [pick(rng, TRIPLE)];
    else if (roll < pZig + pStag + pTriple + pDouble) masks = [pick(rng, DOUBLE)];
    else masks = [pick(rng, SINGLE)];
    const nextSpecial = Math.min(nextMover < moverTicks.length ? moverTicks[nextMover] : Infinity, trapDone ? Infinity : trapTick);
    const cand: Row[] = []; let tk = cursor;
    // the next anchor must not be crowded out by a long template
    const nextA = nextAnchor < anchorTicks.length ? anchorTicks[nextAnchor] : Infinity;
    for (let i = 0; i < masks.length; i++) {
      if (tk >= nextA - 20 && i > 0) break;
      if (i > 0 && tk >= nextSpecial) break;     // do not let a long template jump over a mover or the decoy
      cand.push(mk(tk, masks[i]));
      tk += gapTicks(tk);
    }
    if (tryAdd(cand)) cursor = tk; else cursor += 8;
  }
  return rows;
}

export class RunnerSim {
  readonly seed: number;
  readonly relaxed: boolean;
  readonly tuning: Tuning;
  readonly rows: readonly Row[];
  /** Index of the row where the ANCHORS_TO_WIN-th anchor sits (used for the progress bar). */
  readonly goalTick: number;
  private tick = 0;
  private lane = START_LANE; private prevLane = START_LANE; private lastMove = -1000;
  private queued: Move = 0; private queuedAt = -1000;
  private hits = 0; private anchors = 0; private nextRow = 0;
  private status: Status = 'playing'; private reason: 'hits' | 'faded' | null = null;
  private acc = 0;
  private readonly rowDone: boolean[];

  constructor(seed: number, opts: { relaxed?: boolean } = {}) {
    this.seed = seed >>> 0; this.relaxed = !!opts.relaxed;
    this.tuning = this.relaxed ? RELAXED : NORMAL;
    this.rows = generateRows(this.seed, this.relaxed);
    this.rowDone = this.rows.map(() => false);
    const anchorRows = this.rows.filter(r => r.anchorLane >= 0);
    this.goalTick = (anchorRows[ANCHORS_TO_WIN - 1] ?? this.rows[this.rows.length - 1]).tick;
  }

  get result(): RunnerResult {
    return { status: this.status, reason: this.reason, hits: this.hits, anchors: this.anchors, ticks: this.tick, seconds: this.tick / TICK_HZ };
  }
  get state(): RunnerState {
    const t = this.tick / TICK_HZ;
    return {
      tick: this.tick, seconds: t, lane: this.lane, prevLane: this.prevLane, lastMoveTick: this.lastMove, hits: this.hits, anchors: this.anchors,
      nextRow: this.nextRow, dist: distAt(this.tuning, t), speed: speedAt(this.tuning, t), progress: Math.min(1, this.tick / this.goalTick), status: this.status,
    };
  }
  /** True when a lane change pressed right now would be applied immediately. */
  get canMove(): boolean { return this.tick + 1 - this.lastMove >= MOVE_COOLDOWN; }
  rowCollected(i: number): boolean { return this.rowDone[i]; }
  /** Fraction (0..1) of the next tick already accumulated; lets the renderer interpolate between ticks. */
  get subTick(): number { return Math.max(0, Math.min(1, this.acc / DT)); }

  /** Advance by `dt` seconds of caller time using fixed ticks. `input.move` is a single lane-change press, consumed by the first tick. */
  step(input: RunnerInput, dt: number): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.status !== 'playing') return ev;
    this.acc += dt;
    let move: Move = input.move ?? 0;
    // `acc` is compared with a half-tick slack so float sums of 1/60 never drop a tick
    while (this.acc >= DT - 1e-9 && this.status === 'playing') {
      this.acc -= DT;
      this.tickOnce(move, ev);
      move = 0;
    }
    if (move !== 0 && this.status === 'playing') { this.queued = move; this.queuedAt = this.tick; } // pressed between ticks: keep it for the next one
    return ev;
  }

  private tickOnce(move: Move, ev: SimEvent[]): void {
    this.tick++;
    if (move !== 0) { this.queued = move; this.queuedAt = this.tick; }
    if (this.queued !== 0 && this.tick - this.queuedAt > MOVE_BUFFER) this.queued = 0;
    if (this.queued !== 0 && this.tick - this.lastMove >= MOVE_COOLDOWN) {
      const to = Math.max(0, Math.min(LANES - 1, this.lane + this.queued));
      this.queued = 0;
      if (to !== this.lane) {
        ev.push({ type: 'lane', tick: this.tick, from: this.lane, to });
        this.prevLane = this.lane; this.lane = to; this.lastMove = this.tick;
      }
    }
    while (this.nextRow < this.rows.length && this.rows[this.nextRow].tick <= this.tick) {
      const i = this.nextRow++; const r = this.rows[i];
      if (r.blocked & bit(this.lane)) {
        this.hits++;
        ev.push({ type: 'hit', tick: this.tick, lane: this.lane, hits: this.hits, row: i });
        if (this.hits >= MAX_HITS) { this.status = 'lost'; this.reason = 'hits'; ev.push({ type: 'lose', tick: this.tick, reason: 'hits' }); return; }
      }
      if (r.anchorLane >= 0) {
        if (r.anchorLane === this.lane) {
          this.rowDone[i] = true; this.anchors++;
          ev.push({ type: 'anchor', tick: this.tick, lane: this.lane, anchors: this.anchors, row: i });
          if (this.anchors >= ANCHORS_TO_WIN) { this.status = 'won'; ev.push({ type: 'win', tick: this.tick }); return; }
        } else ev.push({ type: 'missed', tick: this.tick, row: i });
      }
    }
    if (this.nextRow >= this.rows.length && this.tick > this.rows[this.rows.length - 1].tick + 90) {
      this.status = 'lost'; this.reason = 'faded'; ev.push({ type: 'lose', tick: this.tick, reason: 'faded' });
    }
  }
}

// ---- bots (for tests and the browser harness) -------------------------------------------------------------------

/** Lane per row of a perfect path (forced anchors), or null if none exists. Backward DP, prefers the fewest lane changes. */
export function planPerfect(rows: readonly Row[]): number[] | null {
  const n = rows.length;
  // feasible[i][b] = lane b at row i is on some full path
  const feas: boolean[][] = rows.map(() => LANE_LIST.map(() => false));
  for (let i = n - 1; i >= 0; i--) {
    for (let b = 0; b < LANES; b++) {
      const r = rows[i];
      if ((r.blocked & bit(b)) || (r.anchorLane >= 0 && r.anchorLane !== b)) continue;
      if (i === n - 1) { feas[i][b] = true; continue; }
      feas[i][b] = LANE_LIST.some(c => feas[i + 1][c] && rows[i + 1].tick - r.tick >= needTicks(b, c));
    }
  }
  const plan: number[] = [];
  let cur = START_LANE; let t = 0;
  for (let i = 0; i < n; i++) {
    const cands = LANE_LIST.filter(b => feas[i][b] && rows[i].tick - t >= needTicks(cur, b));
    if (cands.length === 0) return null;
    cands.sort((x, y) => Math.abs(x - cur) - Math.abs(y - cur));
    cur = cands[0]; plan.push(cur); t = rows[i].tick;
  }
  return plan;
}

export interface Bot { move(sim: RunnerSim): Move }
/** Never moves. */
export function noInputBot(): Bot { return { move: () => 0 }; }
/** Follows the pre-computed perfect path, changing lanes right after each row has passed. */
export function perfectBot(sim: RunnerSim): Bot {
  const plan = planPerfect(sim.rows);
  return {
    move(s) {
      const st = s.state;
      if (!plan || st.status !== 'playing') return 0;
      const i = st.nextRow; if (i >= plan.length) return 0;
      const want = plan[i];
      if (want === st.lane || !s.canMove) return 0;
      return want > st.lane ? 1 : -1;
    },
  };
}
/** A human-ish bot: only reacts to a row once it is `reactTicks` away, and plays greedily (nearest open lane, no look-ahead). */
export function humanBot(reactTicks: number): Bot {
  return {
    move(s) {
      const st = s.state;
      if (st.status !== 'playing' || !s.canMove) return 0;
      const r = s.rows[st.nextRow]; if (!r) return 0;
      if (r.tick - st.tick > reactTicks) return 0;
      const good = (l: number) => !(r.blocked & bit(l)) && (r.anchorLane < 0 || r.anchorLane === l);
      if (good(st.lane)) return 0;
      const cands = LANE_LIST.filter(good).sort((a, b) => Math.abs(a - st.lane) - Math.abs(b - st.lane));
      if (!cands.length) return 0;
      return cands[0] > st.lane ? 1 : -1;
    },
  };
}
/** Plays the whole run with a bot at the fixed tick rate. */
export function runBot(sim: RunnerSim, bot: Bot, maxTicks = 60 * TICK_HZ): RunnerResult {
  for (let i = 0; i < maxTicks && sim.result.status === 'playing'; i++) sim.step({ move: bot.move(sim) }, DT);
  return sim.result;
}
