import { describe, expect, it } from 'vitest';
import { ForestRun, MemoryStarStore, LocalStarStore, medalFor, MEDAL_BRONZE, MEDAL_SILVER, MEDAL_GOLD } from './run';
import { referenceSolution } from './solutions';
import type { Order } from './api';
import { feed } from './helpers';

function clearCurrent(run: ForestRun, order: Order) {
  const s = run.startAttempt(order);
  const sol = referenceSolution(run.roomId, order, run.stageSeed);
  feed(s, sol.phase1);
  if (s.view().status === 'PLAYING') s.input({ t: 'END_LOOP' });
  s.beginPhase2();
  feed(s, sol.phase2);
  return run.finishAttempt()!;
}
function failCurrent(run: ForestRun, order: Order) {
  const s = run.startAttempt(order);
  s.input({ t: 'END_LOOP' }); s.beginPhase2(); s.input({ t: 'END_LOOP' });
  return run.finishAttempt()!;
}

describe('ForestRun', () => {
  it('medal thresholds', () => {
    expect([MEDAL_BRONZE, MEDAL_SILVER, MEDAL_GOLD]).toEqual([3500, 6500, 9500]);
    expect(medalFor(3499)).toBe('NONE'); expect(medalFor(3500)).toBe('BRONZE');
    expect(medalFor(6500)).toBe('SILVER'); expect(medalFor(9500)).toBe('GOLD');
  });
  it('three stages in order win the run; summary is filled', () => {
    const run = new ForestRun(42, { stars: new MemoryStarStore(), character: 'JENSEN' });
    expect(run.charges).toBe(3);
    expect(run.suggestedOrder).toBe('FUTURE_FIRST');
    const orders: Order[] = ['FUTURE_FIRST', 'PAST_FIRST', 'FUTURE_FIRST'];
    for (let i = 0; i < 3; i++) {
      expect(run.roomId).toBe(i + 1);
      const r = clearCurrent(run, orders[i]);
      expect(r.cleared).toBe(true);
    }
    expect(run.status).toBe('WON');
    expect(run.total).toBeGreaterThan(3500);
    const sum = run.toForestSummary();
    expect(sum.won).toBe(true); expect(sum.character).toBe('JENSEN');
    expect(sum.branches).toBe(6); expect(sum.usedAlternateHistory).toBe(true);
    expect(sum.callsMade).toBe(1 + 2); // pins dropped in stage 1 (1) and 3 (2)
    expect(sum.partnerActions).toBeGreaterThan(20);
    expect(sum.secondsUsed).toBe(0); expect(sum.secondsLeft).toBe(0);
    expect(sum.decisions[0]).toMatch(/^Stage 1 cleared as Jensen first, \d+ beats? spare$/);
    expect(sum.decisions[1]).toMatch(/^Stage 2 cleared as Sam first/);
  });
  it('failed attempts cost a charge and restart the same stage; 0 charges loses', () => {
    const run = new ForestRun(1, { stars: new MemoryStarStore() });
    const seed = run.stageSeed;
    const r = failCurrent(run, 'PAST_FIRST');
    expect(r.cleared).toBe(false); expect(run.charges).toBe(2); expect(run.roomId).toBe(1); expect(run.stageSeed).toBe(seed);
    failCurrent(run, 'FUTURE_FIRST');
    const last = failCurrent(run, 'PAST_FIRST');
    expect(last.run).toBe('LOST'); expect(run.toForestSummary().won).toBe(false);
    expect(() => run.startAttempt('PAST_FIRST')).toThrow();
  });
  it('relaxed run has 5 charges and 26-beat stages', () => {
    const run = new ForestRun(1, { relaxed: true, stars: new MemoryStarStore() });
    expect(run.charges).toBe(5);
    expect(run.startAttempt('PAST_FIRST').view().budget).toBe(26);
  });
  it('Chrono-Mastery star needs both orders on the same stage id', () => {
    const stars = new MemoryStarStore();
    const a = new ForestRun(5, { stars });
    expect(clearCurrent(a, 'PAST_FIRST').starEarned).toBe(false);
    const b = new ForestRun(6, { stars });
    expect(clearCurrent(b, 'PAST_FIRST').starEarned).toBe(false); // same order again
    const c = new ForestRun(7, { stars });
    expect(clearCurrent(c, 'FUTURE_FIRST').starEarned).toBe(true);
    expect(c.starsEarned).toEqual([1]);
    expect(c.summaryLines().some((l) => l.includes('Chrono-Mastery'))).toBe(true);
  });
  it('LocalStarStore is safe under node', () => {
    const st = new LocalStarStore();
    expect(st.get(1)).toEqual({ PAST_FIRST: false, FUTURE_FIRST: false });
    st.mark(1, 'PAST_FIRST');
    expect(st.get(1).PAST_FIRST).toBe(true);
  });
});
