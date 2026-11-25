import type { Character } from '../../../flow/flow';
import type { Order, RoomId, Stage } from '../api';
import { ROOMS } from '../rooms';
import { CHARGES_NORMAL, CHARGES_RELAXED, ForestRun } from '../run';
import { RELAXED_BUDGET, STANDARD_BUDGET } from '../sim';
import type { RunPort } from './runPort';

/** Thin adapter: the scene talks to RunPort; progression, scoring, stars and medals all live in ForestRun (run.ts). */
export function createRunPort(seed: number, character: Character, relaxed: boolean): RunPort {
  const run = new ForestRun(seed, { relaxed, character });
  const port: RunPort = {
    get charges() { return run.charges; },
    maxCharges: relaxed ? CHARGES_RELAXED : CHARGES_NORMAL,
    get roomIndex() { return Math.min(run.stageIndex, 2); },
    get room() { return { ...ROOMS[Math.min(run.stageIndex, 2)], budget: relaxed ? RELAXED_BUDGET : STANDARD_BUDGET }; },
    get total() { return run.total; },
    begin: (o: Order): Stage => run.startAttempt(o),
    cleared: () => {
      const id = run.roomId as RoomId, order = run.currentOrder as Order;
      const res = run.finishAttempt();
      const st = run.stars.get(id);
      return { starEarned: !!res?.starEarned, hasStar: st.PAST_FIRST && st.FUTURE_FIRST, needOther: st.PAST_FIRST && st.FUTURE_FIRST ? null : order === 'PAST_FIRST' ? 'FUTURE_FIRST' : 'PAST_FIRST', lastRoom: run.status === 'WON' };
    },
    failed: () => { run.finishAttempt(); },
    advance: () => { /* ForestRun advances inside finishAttempt() */ },
    get result() { return run.status === 'WON' ? 'WON' : run.status === 'LOST' ? 'LOST' : null; },
    medal: () => run.medal,
    summary: () => run.toForestSummary(),
    raw: run,
  };
  return port;
}
