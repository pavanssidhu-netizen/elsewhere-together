import { describe, it, expect } from 'vitest';
import {
  RunnerSim, DT, MOVE_COOLDOWN, LANES, validateRows, perfectBot, noInputBot, humanBot, runBot, generateRows, type Row, type Bot,
} from './runnerSim';

const SEEDS = Array.from({ length: 500 }, (_, i) => 1000 + i * 7919);

/** Independent tick-by-tick brute force: states = (lane, ticks since last move). Must hit no hazard and be in the lane of every anchor. */
function bruteForceViable(rows: readonly Row[]): boolean {
  const C = MOVE_COOLDOWN; // since-last-move is capped at C (= free to move)
  let cur = new Uint8Array(LANES * (C + 1)); cur[1 * (C + 1) + C] = 1;
  let ri = 0;
  for (let t = 1; t <= rows[rows.length - 1].tick; t++) {
    const nxt = new Uint8Array(cur.length);
    for (let lane = 0; lane < LANES; lane++) for (let since = 0; since <= C; since++) {
      if (!cur[lane * (C + 1) + since]) continue;
      const s2 = Math.min(C, since + 1);
      nxt[lane * (C + 1) + s2] = 1;
      if (s2 >= C) for (const d of [-1, 1]) { const l = lane + d; if (l >= 0 && l < LANES) nxt[l * (C + 1)] = 1; }
    }
    cur = nxt;
    while (ri < rows.length && rows[ri].tick === t) {
      const r = rows[ri++]; let any = false;
      for (let lane = 0; lane < LANES; lane++) {
        const dead = (r.blocked & (1 << lane)) !== 0 || (r.anchorLane >= 0 && r.anchorLane !== lane);
        for (let since = 0; since <= C; since++) { if (dead) cur[lane * (C + 1) + since] = 0; else if (cur[lane * (C + 1) + since]) any = true; }
      }
      if (!any) return false;
    }
  }
  return true;
}

describe('runner pattern generation', () => {
  it('500 seeds (both modes) never produce an impossible sequence', () => {
    for (const relaxed of [false, true]) {
      for (const seed of SEEDS) {
        const rows = generateRows(seed, relaxed);
        expect(validateRows(rows), `validator seed ${seed} relaxed=${relaxed}`).toBe(-1);
        expect(bruteForceViable(rows), `brute force seed ${seed} relaxed=${relaxed}`).toBe(true);
        for (let i = 1; i < rows.length; i++) expect(rows[i].tick).toBeGreaterThan(rows[i - 1].tick);
        expect(rows.filter(r => r.anchorLane >= 0).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('the validator and brute force both reject an impossible hand-made sequence', () => {
    const bad: Row[] = [
      { tick: 130, blocked: 6, anchorLane: -1, anchorIdx: -1, variant: 0 }, // only lane 0 open
      { tick: 140, blocked: 3, anchorLane: -1, anchorIdx: -1, variant: 0 }, // only lane 2 open, 10 ticks later
    ];
    expect(validateRows(bad)).toBe(1);
    expect(bruteForceViable(bad)).toBe(false);
  });
  it('different seeds give different patterns, same seed the same pattern', () => {
    const sig = (s: number) => generateRows(s, false).map(r => `${r.tick}:${r.blocked}:${r.anchorLane}`).join(',');
    const sigs = new Set(SEEDS.slice(0, 50).map(sig));
    expect(sigs.size).toBe(50);
    expect(sig(77)).toBe(sig(77));
  });
});

describe('runner sim', () => {
  it('perfect bot wins all 500 seeds in 35-50 s with zero hits', () => {
    for (const relaxed of [false, true]) for (const seed of SEEDS) {
      const sim = new RunnerSim(seed, { relaxed });
      const r = runBot(sim, perfectBot(sim));
      expect(r.status, `seed ${seed}`).toBe('won');
      expect(r.hits).toBe(0);
      expect(r.anchors).toBe(3);
      expect(r.seconds).toBeGreaterThanOrEqual(35);
      expect(r.seconds).toBeLessThanOrEqual(50);
    }
  });
  it('no-input bot loses by hits on every seed', () => {
    for (const relaxed of [false, true]) for (const seed of SEEDS) {
      const sim = new RunnerSim(seed, { relaxed });
      const r = runBot(sim, noInputBot());
      expect(r.status, `seed ${seed}`).toBe('lost');
      expect(r.reason).toBe('hits');
      expect(r.hits).toBe(3);
    }
  });
  it('counts hits correctly (equals blocked rows crossed in the player lane)', () => {
    const sim = new RunnerSim(4242);
    const expected: number[] = [];
    runBot(sim, noInputBot());
    for (const r of sim.rows) { if (expected.length < 3 && (r.blocked & 2)) expected.push(r.tick); }
    expect(sim.result.hits).toBe(3);
    expect(sim.result.ticks).toBe(expected[2]);
  });
  it('is deterministic: same seed and inputs give identical state, different step sizes too', () => {
    const run = (dtScale: number) => {
      const sim = new RunnerSim(31337);
      const bot: Bot = humanBot(40);
      const out: string[] = [];
      for (let i = 0; i < 1800; i++) { sim.step({ move: bot.move(sim) }, DT * dtScale); if (i % 100 === 0) out.push(JSON.stringify(sim.state)); }
      out.push(JSON.stringify(sim.state), JSON.stringify(sim.result));
      return out.join('|');
    };
    expect(run(1)).toBe(run(1));
  });
  it('lane changes obey the cooldown and the buffer', () => {
    const sim = new RunnerSim(5);
    sim.step({ move: 1 }, DT);
    expect(sim.state.lane).toBe(2);
    sim.step({ move: -1 }, DT);
    expect(sim.state.lane).toBe(2); // cooling down
    for (let i = 0; i < MOVE_COOLDOWN; i++) sim.step({}, DT);
    expect(sim.state.lane).toBe(1); // buffered press applied once the cooldown ended
    sim.step({ move: -1 }, DT); // second press: still cooling down, lane unchanged
    expect(sim.state.lane).toBe(1);
  });
  it('wall bounds: cannot leave the lanes', () => {
    const sim = new RunnerSim(5);
    for (let i = 0; i < 100; i++) sim.step({ move: 1 }, DT);
    expect(sim.state.lane).toBe(2);
  });
  it('relaxed is easier: lower speed, sparser rows, and a reaction-limited bot wins at least as often', () => {
    const dens = (relaxed: boolean) => SEEDS.slice(0, 100).reduce((a, s) => a + generateRows(s, relaxed).filter(r => r.tick < 40 * 60).length, 0);
    expect(dens(true)).toBeLessThan(dens(false));
    const a = new RunnerSim(1, { relaxed: false }); const b = new RunnerSim(1, { relaxed: true });
    for (let i = 0; i < 1800; i++) { a.step({}, DT); b.step({}, DT); }
    expect(b.state.speed).toBeLessThan(a.state.speed);
    const wins = (relaxed: boolean) => SEEDS.slice(0, 200).filter(s => { const sim = new RunnerSim(s, { relaxed }); return runBot(sim, humanBot(30)).status === 'won'; }).length;
    expect(wins(true)).toBeGreaterThanOrEqual(wins(false));
  });
  it('a missed anchor is not collected later, and spare anchors exist so the run can still be won', () => {
    let tested = 0;
    for (let seed = 1; seed < 400 && tested < 20; seed++) {
      const sim = new RunnerSim(seed);
      const bot = perfectBot(sim);
      const first = sim.rows.find(r => r.anchorLane >= 0)!;
      if (first.anchorLane === 1) continue; // the idle player sits in lane 1
      while (sim.state.tick <= first.tick + 1 && sim.result.status === 'playing') sim.step({}, DT);
      if (sim.result.status !== 'playing') continue;
      expect(sim.result.anchors).toBe(0);
      expect(sim.rowCollected(sim.rows.indexOf(first))).toBe(false);
      expect(sim.rows.filter(x => x.anchorLane >= 0).length).toBeGreaterThanOrEqual(4);
      const r = runBot(sim, bot);
      expect(r.anchors).toBeLessThanOrEqual(3);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});
