// Bot harness: 7 policies acting ONLY through legal MOVE / INTERACT.
//   npx vite-node scripts/bots.ts -- --seeds 500
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { SimEngine } from '../src/sim/engine';
import { act, objectiveHint, planStep, planWin, wait, type PlanPolicy } from '../src/sim/planner';
import { mulberry32, hash32 } from '../src/sim/rng';
import { OBJECT_TILES } from '../src/world/topology';
import type { Choice, Command, DomainEvent, SimulationState } from '../src/sim/types';

export type PolicyName = 'SELF_ONLY' | 'ECHO_HEAVY' | 'LET_GO_HEAVY' | 'RANDOM_CURIOUS' | 'PLANNER' | 'MALICIOUS' | 'NOVICE';
export const POLICIES: PolicyName[] = ['SELF_ONLY', 'ECHO_HEAVY', 'LET_GO_HEAVY', 'RANDOM_CURIOUS', 'PLANNER', 'MALICIOUS', 'NOVICE'];
type Rng = () => number;
type Decide = (s: Readonly<SimulationState>, rng: Rng) => Command | null;

const FORK_OBJS = ['lantern', 'greenhouse', 'tide', 'bridge', 'radio'];
const pick = <T,>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];
const weighted = (rng: Rng, l: number, sf: number): Choice => { const r = rng(); return r < l ? 'LET_GO' : r < l + sf ? 'SELF' : 'ECHO'; };

function planned(pol: (rng: Rng) => PlanPolicy): Decide {
  return (s, rng) => planStep(s, pol(rng));
}

const DECIDE: Record<PolicyName, () => Decide> = {
  PLANNER: () => planned(() => ({})),
  SELF_ONLY: () => planned(() => ({ allowEcho: false, choose: () => 'SELF' })),
  LET_GO_HEAVY: () => planned(() => ({ allowEcho: false, choose: () => 'LET_GO' })),
  ECHO_HEAVY: () => planned(rng => ({ choose: (_t, p) => (p === 'DONATE' || rng() < 0.6 ? 'ECHO' : 'SELF') })),
  NOVICE: () => {
    let wander = 0;
    return (s, rng) => {
      const h = objectiveHint(s);
      const isFork = FORK_OBJS.includes(h.objectId);
      // a human reads the hint and walks there; they pick a verb by feel
      const verb = isFork ? (h.verb && rng() < 0.6 ? h.verb : weighted(rng, 0.5, 0.35)) : undefined; // reads the hint 60% of the time
      const c = act(s, h.objectId, verb);
      if (c) { wander = 0; return c; }
      wander++;
      return wait(s);
    };
  },
  RANDOM_CURIOUS: () => {
    let target = '', choice: Choice = 'LET_GO', ttl = 0;
    return (s, rng) => {
      if (s.v2.examined.length && s.v2.coherenceDebt >= 60 && rng() < 0.5) { target = rng() < 0.5 ? 'stones' : 'thread_terminal'; ttl = 30; }
      if (ttl-- <= 0) {
        const ids = Object.keys(OBJECT_TILES);
        target = pick(rng, ids); choice = weighted(rng, 0.34, 0.33); ttl = 25;
      }
      return act(s, target, choice) ?? (ttl = 0, wait(s));
    };
  },
  MALICIOUS: () => {
    let target = 'lantern';
    return (s, rng) => {
      // never visits the stones or the terminal; spams forks, favours ECHO and SELF
      if (rng() < 0.2) target = pick(rng, FORK_OBJS.filter(o => o !== 'radio' && o !== 'bridge'));
      const choice: Choice = rng() < 0.55 ? 'ECHO' : 'SELF';
      return act(s, target, choice) ?? act(s, 'lantern', choice) ?? wait(s);
    };
  },
};

interface RunResult {
  seed: number; policy: PolicyName; outcome: 'WIN' | 'FADE' | 'TIMEOUT'; ticks: number; interactions: number;
  donated: number; consumed: number; maxDrift: number; maxStrain: number; egg: boolean;
  anchorOrder: string; signature: string; softlock: boolean; commands: Command[];
}

export function runBot(policy: PolicyName, seed: number, maxTicks: number): RunResult {
  const e = new SimEngine(seed, undefined, true);
  const rng = mulberry32(hash32(seed, policy, 'bot'));
  const decide = DECIDE[policy]();
  const cmds: Command[] = [];
  let interactions = 0, maxDrift = 0, maxStrain = 0, egg = false, rejects = 0;
  const order: string[] = [];
  let snapshot: SimulationState | null = null;
  for (let guard = 0; guard < maxTicks * 3 && e.getState().v2.tick < maxTicks; guard++) {
    const s = e.getState();
    if (s.won || s.phase === 'FADE') break;
    const c = decide(s, rng);
    if (!c) break;
    const before = s.v2.tick;
    const evs: DomainEvent[] = e.dispatch(c);
    cmds.push(c);
    if (e.getState().v2.tick === before) { if (++rejects > 400) break; } else rejects = 0;
    if (c.type === 'INTERACT' && !evs.some(x => x.type === 'REJECTED')) interactions++;
    for (const ev of evs) {
      if (ev.type === 'ANCHOR_ALIGNED') order.push(ev.anchorId[0]);
      if (ev.type === 'REALM' && ev.realm === 'ALIEN') egg = true;
      if (ev.type === 'WARNING' && !snapshot) snapshot = JSON.parse(JSON.stringify(e.getState()));
    }
    maxDrift = Math.max(maxDrift, e.getState().realityDrift);
    maxStrain = Math.max(maxStrain, e.getState().bondStrain);
  }
  const s = e.getState();
  const outcome: RunResult['outcome'] = s.won ? 'WIN' : s.phase === 'FADE' ? 'FADE' : 'TIMEOUT';
  let softlock = false;
  if (outcome !== 'WIN') {
    // softlock = the planner cannot win from the last non-terminal state we have (first warning, or the final state)
    const from = (outcome === 'FADE' ? snapshot : s) as SimulationState | null;
    if (from) {
      const p = new SimEngine(from.seed, from, true);
      for (const c of planWin(from)) p.dispatch(c);
      softlock = !p.getState().won;
    }
  }
  const picks = s.events.filter(r => r.actorId === 'player').map(r => r.templateId[0] + r.choice[0]);
  const consumed = s.echoCredits.filter(c => c.consumed).length;
  return {
    seed, policy, outcome, ticks: s.v2.tick, interactions, donated: s.echoCredits.length, consumed, maxDrift, maxStrain, egg,
    anchorOrder: order.join(''), signature: order.join('') + '|' + [...new Set(picks.filter(p => p[1] === 'E'))].sort().join(','),
    softlock, commands: cmds,
  };
}

const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const pct = (n: number, d: number) => Math.round((1000 * n) / d) / 10;

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: number) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
  const seeds = arg('--seeds', 500), maxTicks = arg('--max-ticks', 600);
  mkdirSync('reports/bots', { recursive: true });
  for (const f of readdirSync('reports/bots')) if (f.startsWith('replay_')) rmSync('reports/bots/' + f);
  const summary: Record<string, unknown> = {};
  const rows: string[] = [];
  const hdr = ['policy', 'win%', 'fade%', 'timeout%', 'softlock%', 'medTicks', 'medInter', 'echoGive', 'echoUsed', 'maxDrift', 'maxStrain', 'egg%', 'winOrders', 'winStrats'];
  rows.push(hdr.join('\t'));
  for (const p of POLICIES) {
    const runs: RunResult[] = [];
    for (let seed = 1; seed <= seeds; seed++) runs.push(runBot(p, seed, maxTicks));
    const n = runs.length;
    const wins = runs.filter(r => r.outcome === 'WIN');
    const cnt = (o: string) => runs.filter(r => r.outcome === o).length;
    const avg = (f: (r: RunResult) => number) => Math.round((10 * runs.reduce((a, r) => a + f(r), 0)) / n) / 10;
    const rec = {
      seeds: n, win: pct(wins.length, n), fade: pct(cnt('FADE'), n), timeout: pct(cnt('TIMEOUT'), n),
      softlock: pct(runs.filter(r => r.softlock).length, n), medianTicks: median(runs.map(r => r.ticks)),
      medianInteractions: median(runs.map(r => r.interactions)), echoesDonated: avg(r => r.donated), echoesConsumed: avg(r => r.consumed),
      maxDrift: Math.max(...runs.map(r => r.maxDrift)), maxStrain: Math.max(...runs.map(r => r.maxStrain)),
      eggRate: pct(runs.filter(r => r.egg).length, n),
      winningAnchorOrders: [...new Set(wins.map(r => r.anchorOrder))], winningStrategies: [...new Set(wins.map(r => r.signature))].length,
    };
    summary[p] = rec;
    rows.push([p, rec.win, rec.fade, rec.timeout, rec.softlock, rec.medianTicks, rec.medianInteractions, rec.echoesDonated, rec.echoesConsumed,
      rec.maxDrift, rec.maxStrain, rec.eggRate, rec.winningAnchorOrders.join('/') || '-', rec.winningStrategies].join('\t'));
    const fail = runs.find(r => r.outcome !== 'WIN');
    if (fail) {
      const lines = [JSON.stringify({ policy: p, seed: fail.seed, outcome: fail.outcome, ticks: fail.ticks }), ...fail.commands.map(c => JSON.stringify(c))];
      writeFileSync(`reports/bots/replay_${p}.jsonl`, lines.join('\n') + '\n');
    }
  }
  const allWin = new Set<string>();
  for (const p of POLICIES) { void p; }
  summary._meta = { seeds, maxTicks, note: 'softlock = planner cannot win from first-warning (FADE) or final (TIMEOUT) state' };
  writeFileSync('reports/bots/summary.json', JSON.stringify(summary, null, 2));
  void allWin;
  console.log(rows.map(r => r.split('\t').map((c, i) => (i === 0 ? c.padEnd(15) : c.padStart(9))).join('')).join('\n'));
}

if (!process.env.BOTS_NO_MAIN) main();
