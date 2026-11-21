// Bot harness: policies act ONLY through legal commands (MOVE / INTERACT / CALL / ADVANCE_PARTNER) on the real SimEngine.
// Novice-style bots read only objectiveHint() (observation: own world, inventory, partner voice), never hidden state.
//   npx vite-node scripts/bots.ts -- --seeds 200
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { SimEngine } from '../src/sim/engine';
import { act, hintToCommand, objectiveHint, planStep, safePlace, shuffle, wait } from '../src/sim/planner';
import { mulberry32, hash32 } from '../src/sim/rng';
import { OBJECT_TILES } from '../src/world/topology';
import type { Command, DomainEvent, PhysicalAction, SimulationState } from '../src/sim/types';

export type PolicyName = 'planner' | 'guided_novice' | 'mostly_calls' | 'cautious_self' | 'random_interactor' | 'reckless' | 'secret_hunter';
export const POLICIES: PolicyName[] = ['planner', 'guided_novice', 'mostly_calls', 'cautious_self', 'random_interactor', 'reckless', 'secret_hunter'];
type Rng = () => number;
type Decide = (s: Readonly<SimulationState>, rng: Rng) => Command | null;

const pick = <T,>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];
const OBJS = Object.keys(OBJECT_TILES);
const ACTS: PhysicalAction[] = ['RELIGHT', 'BRACE', 'OPEN_SLUICE', 'PROTECT', 'HARVEST', 'TUNE', 'HOLD_SIGNAL', 'OBSERVE', 'BEACON', 'GATHER', 'REST'];

const DECIDE: Record<PolicyName, () => Decide> = {
  planner: () => s => planStep(s),

  // follows the on-screen hint most of the time, but gets curious and sometimes does something else
  guided_novice: () => {
    let detour = 0, target = 'lantern';
    return (s, rng) => {
      if (detour > 0) { detour--; return act(s, target) ?? shuffle(s); }
      if (rng() < 0.12) { detour = 6; target = pick(rng, OBJS); return act(s, target) ?? shuffle(s); }
      const h = objectiveHint(s);
      // a novice does not always understand "call across": acts on it about two times in three
      if (h.action === 'CALL' && rng() < 0.35) return wait(s);
      if (h.action === 'REST' && rng() < 0.4) return shuffle(s);
      return hintToCommand(s, h) ?? wait(s);
    };
  },

  // leans on the Thread: calls constantly, does local work only when out of fuel
  mostly_calls: () => (s, rng) => {
    if (s.player.inventory.fuel >= 1 && rng() < 0.55) {
      const kinds = ['CALL', 'LOCATION', 'WARNING', 'TECHNIQUE'] as const;
      return { type: 'CALL', kind: pick(rng, [...kinds]) };
    }
    if (rng() < 0.35) return planStep(s);
    if (s.player.inventory.fuel < 1) return act(s, 'woodpile', 'GATHER') ?? act(s, 'greenhouse', 'HARVEST') ?? wait(s);
    return planStep(s);
  },

  // self-first: never calls, never tells the partner anything; rests when strained
  cautious_self: () => (s) => {
    if (s.bondStrain > 20) { const sp = safePlace(s); if (sp) return act(s, sp, 'REST') ?? wait(s); }
    return hintToCommand(s, objectiveHint(s, { skipCalls: true })) ?? wait(s);
  },

  random_interactor: () => {
    let target = 'lantern', action: PhysicalAction | undefined, ttl = 0;
    return (s, rng) => {
      if (ttl-- <= 0) { target = pick(rng, OBJS); action = rng() < 0.5 ? undefined : pick(rng, ACTS); ttl = 14; }
      if (rng() < 0.08) return { type: 'CALL' };
      return act(s, target, action) ?? (ttl = 0, shuffle(s));
    };
  },

  // burns everything: strips the garden, calls and holds the signal constantly, never rests
  reckless: () => (s, rng) => {
    const inv = s.player.inventory;
    if (inv.fuel < 1) {
      if (s.player.taken.wood < 3) return act(s, 'woodpile', 'GATHER') ?? wait(s);
      return act(s, 'greenhouse', 'HARVEST') ?? wait(s);
    }
    const r = rng();
    if (r < 0.5) return { type: 'CALL' };
    if (r < 0.8) return act(s, 'radio', 'HOLD_SIGNAL') ?? { type: 'CALL' };
    return act(s, 'lantern', 'RELIGHT') ?? { type: 'CALL' };
  },

  // finds the echo-stones motif on the way (observe stones, tune the radio until the same tone repeats, touch the stones)
  secret_hunter: () => (s, _rng) => {
    const v = s.v2;
    if (!v.crossed) return planStep(s);
    if (!v.secretFound) {
      if (!v.examined.includes('stones')) return act(s, 'stones', 'OBSERVE') ?? wait(s);
      const m = v.tuneMotif;
      if (m.length >= 2 && m[m.length - 1] === m[m.length - 2]) return act(s, 'stones', 'OBSERVE') ?? wait(s);
      return act(s, 'radio', 'TUNE') ?? wait(s);
    }
    return planStep(s);
  },
};

export interface RunResult {
  seed: number; policy: PolicyName; outcome: 'WIN' | 'FADE' | 'TIMEOUT'; ticks: number; interactions: number; calls: number;
  maxDrift: number; maxStrain: number; secret: boolean; anchorOrder: string; partnerSites: string; mix: string;
  hasNextStep: boolean; recoveryPath: boolean; link: string; commands: Command[];
}

export function runBot(policy: PolicyName, seed: number, maxTicks = 700): RunResult {
  const e = new SimEngine(seed, undefined, true);
  const rng = mulberry32(hash32(seed, policy, 'bot'));
  const decide = DECIDE[policy]();
  const cmds: Command[] = [];
  let interactions = 0, calls = 0, maxDrift = 0, maxStrain = 0, rejects = 0;
  const order: string[] = [];
  const mix: Record<string, number> = {};
  let sawWarning = false;
  for (let guard = 0; guard < maxTicks * 4 && e.getState().v2.tick < maxTicks; guard++) {
    const s = e.getState();
    if (s.won || s.phase === 'FADE') break;
    const c = decide(s, rng);
    if (!c) break;
    const before = s.v2.tick + s.turn;
    const evs: DomainEvent[] = e.dispatch(c);
    cmds.push(c);
    const rej = evs.some(x => x.type === 'REJECTED');
    if (e.getState().v2.tick + e.getState().turn === before) { if (++rejects > 300) break; } else rejects = 0;
    if (c.type === 'INTERACT' && !rej) { interactions++; const k = c.action ?? 'default'; mix[k] = (mix[k] ?? 0) + 1; }
    if (c.type === 'CALL' && !rej) { calls++; mix.CALL = (mix.CALL ?? 0) + 1; }
    for (const ev of evs) {
      if (ev.type === 'ANCHOR_ALIGNED') order.push(ev.anchorId[0]);
      if (ev.type === 'WARNING') sawWarning = true;
    }
    maxDrift = Math.max(maxDrift, e.getState().realityDrift);
    maxStrain = Math.max(maxStrain, e.getState().bondStrain);
  }
  const s = e.getState();
  const outcome: RunResult['outcome'] = s.won ? 'WIN' : s.phase === 'FADE' ? 'FADE' : 'TIMEOUT';
  const h = objectiveHint(s);
  void sawWarning;
  return {
    seed, policy, outcome, ticks: s.v2.tick, interactions, calls, maxDrift, maxStrain, secret: s.v2.secretFound,
    anchorOrder: order.join(''), partnerSites: s.anchors.map(a => (a.partnerReady ? 'P' : '-') + (a.playerReady ? 'p' : '-')).join(' '),
    mix: Object.entries(mix).sort().map(([k, v]) => `${k}:${v}`).join(','),
    hasNextStep: !!h.text && outcome !== 'WIN', recoveryPath: outcome === 'TIMEOUT' ? !!safePlace(s) : outcome === 'FADE', link: s.link, commands: cmds,
  };
}

const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const pct = (n: number, d: number) => Math.round((1000 * n) / d) / 10;

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: number) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
  const seeds = arg('--seeds', 200), maxTicks = arg('--max-ticks', 700);
  mkdirSync('reports/bots', { recursive: true });
  for (const f of readdirSync('reports/bots')) if (f.startsWith('replay_')) rmSync('reports/bots/' + f);
  const summary: Record<string, unknown> = {};
  const rows = [['policy', 'win%', 'fade%', 'timeout%', 'medTicks', 'medInter', 'avgCalls', 'secret%', 'maxDrift', 'maxStrain', 'winOrders', 'strategies'].join('\t')];
  for (const p of POLICIES) {
    const runs: RunResult[] = [];
    for (let seed = 1; seed <= seeds; seed++) runs.push(runBot(p, seed, maxTicks));
    const n = runs.length, wins = runs.filter(r => r.outcome === 'WIN');
    const cnt = (o: string) => runs.filter(r => r.outcome === o).length;
    const timeouts = runs.filter(r => r.outcome === 'TIMEOUT');
    const rec = {
      seeds: n, win: pct(wins.length, n), fade: pct(cnt('FADE'), n), timeout: pct(timeouts.length, n),
      timeoutWithNextStep: timeouts.filter(r => r.hasNextStep).length,
      medianTicks: median(runs.map(r => r.ticks)), medianInteractions: median(runs.map(r => r.interactions)),
      avgCalls: Math.round((10 * runs.reduce((a, r) => a + r.calls, 0)) / n) / 10,
      secretRate: pct(runs.filter(r => r.secret).length, n),
      maxDrift: Math.max(...runs.map(r => r.maxDrift)), maxStrain: Math.max(...runs.map(r => r.maxStrain)),
      winningAnchorOrders: [...new Set(wins.map(r => r.anchorOrder))], winningStrategies: [...new Set(wins.map(r => r.mix.split(',').map(x => x.split(':')[0]).sort().join('+')))].length,
      winSeedSample: wins.slice(0, 3).map(r => r.seed), fadeSeedSample: runs.filter(r => r.outcome === 'FADE').slice(0, 3).map(r => r.seed),
      timeoutSeedSample: timeouts.slice(0, 3).map(r => r.seed),
    };
    summary[p] = rec;
    rows.push([p, rec.win, rec.fade, rec.timeout, rec.medianTicks, rec.medianInteractions, rec.avgCalls, rec.secretRate, rec.maxDrift, rec.maxStrain,
      rec.winningAnchorOrders.slice(0, 4).join('/') || '-', rec.winningStrategies].join('\t'));
    const fail = runs.find(r => r.outcome !== 'WIN');
    if (fail) {
      const lines = [JSON.stringify({ policy: p, seed: fail.seed, outcome: fail.outcome, ticks: fail.ticks, link: fail.link }), ...fail.commands.map(c => JSON.stringify(c))];
      writeFileSync(`reports/bots/replay_${p}.jsonl`, lines.join('\n') + '\n');
    }
  }
  summary._meta = { seeds, maxTicks, note: 'timeoutWithNextStep = timeouts where an observation-based hint still named a next physical step' };
  writeFileSync('reports/bots/summary.json', JSON.stringify(summary, null, 2));
  console.log(rows.map(r => r.split('\t').map((c, i) => (i === 0 ? c.padEnd(18) : c.padStart(10))).join('')).join('\n'));
}

if (!process.env.BOTS_NO_MAIN) main();
