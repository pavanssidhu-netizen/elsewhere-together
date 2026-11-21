// V2 planner: acts only through legal MOVE / INTERACT. Used by planWin (demo button), bots and the softlock check.
import type { Choice, Command, SimulationState } from './types';
import { SimEngine } from './engine';
import { ANCHOR_ORDER, ANCHOR_REQS, checkAnchor, playerMeets, type Req } from './anchors';
import { TEMPLATES } from './events';
import { pendingEchoes } from './core';
import { HINTS } from '../content/dialogue';
import { getWalkability, pathTo } from '../world/topology';

export interface PlanPolicy {
  /** Choice for a fork the planner wants to take. `purpose`: own need vs donation to the partner. */
  choose?: (templateId: string, purpose: 'SELF_NEED' | 'DONATE') => Choice;
  allowEcho?: boolean;       // default true
  restAbove?: number;        // rest at the terminal above this strain when it matters (default 40)
}

export const here = (s: Readonly<SimulationState>) => ({ tx: s.v2.gridX, ty: s.v2.gridY });

/** Walk toward an object, or interact once in range. null = unreachable right now. */
export function act(s: Readonly<SimulationState>, objectId: string, choice?: Choice): Command | null {
  const n = s.nodes[s.player.nodeId];
  const p = pathTo(n.world, n.flags, here(s), objectId, s.v2.realm);
  if (!p) return null;
  if (p.length === 0) return choice ? { type: 'INTERACT', objectId, choice } : { type: 'INTERACT', objectId };
  return { type: 'MOVE', tx: p[0].tx, ty: p[0].ty };
}

/** Like act, but when the object is cut off (broken bridge, flooded ford or sand) first repairs the way with a SELF pick. */
export function actR(s: Readonly<SimulationState>, objectId: string, choice?: Choice): Command | null {
  const c = act(s, objectId, choice);
  if (c) return c;
  const n = s.nodes[s.player.nodeId];
  if (n.flags.includes('BRIDGE_CLOSED')) { const b = act(s, 'bridge', 'SELF'); if (b) return b; }
  return act(s, 'tide', 'SELF') ?? act(s, 'greenhouse', 'SELF');
}

/** Legal step that just lets time pass (partner cadence is tick-based): shuffle between two walkable tiles. */
export function wait(s: Readonly<SimulationState>): Command | null {
  const n = s.nodes[s.player.nodeId];
  const w = getWalkability(n.world, n.flags, s.v2.realm);
  const f = here(s);
  const cand = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ tx: f.tx + dx, ty: f.ty + dy }))
    .filter(c => w[c.ty]?.[c.tx]);
  if (!cand.length) return null;
  const c = cand[s.v2.tick % cand.length];
  return { type: 'MOVE', tx: c.tx, ty: c.ty };
}

export function failingReqs(s: Readonly<SimulationState>, reqs: Req[]): Req[] {
  const node = s.nodes[s.player.nodeId];
  return reqs.filter(r => {
    if (r.flag) return !node.flags.includes(r.flag);
    const v = node.world[r.stat!];
    return (r.min !== undefined && v < r.min) || (r.max !== undefined && v > r.max);
  });
}

function helpsSelf(templateId: string, r: Req): boolean {
  const t = TEMPLATES.find(x => x.id === templateId)!;
  const o = t.outcomes[t.selfPreferredOutcome === 'A' ? 0 : 1];
  if (r.flag) return !!o.flags?.includes(r.flag);
  const d = o.delta[r.stat!] ?? 0;
  return (r.min !== undefined && d > 0) || (r.max !== undefined && d < 0);
}

export function templateFor(failing: Req[]): string | null {
  return TEMPLATES.find(t => failing.some(r => helpsSelf(t.id, r)))?.id ?? null;
}

const OBJ_OF: Record<string, string> = { lantern: 'lantern', bridge: 'bridge', radio: 'radio', greenhouse: 'greenhouse', tide: 'tide' };

/** What the partner still needs from the player's side of the thread. */
export function partnerNeeds(s: Readonly<SimulationState>): { signal: boolean; growth: boolean } {
  const pn = s.nodes[s.partner.nodeId];
  const open = (id: string) => { const a = s.anchors.find(x => x.id === id)!; return !a.aligned && !a.partnerReady; };
  return {
    signal: (open('LANTERN') || open('LIGHTHOUSE')) && pn.world.signal < 2,
    growth: open('GREENHOUSE') && pn.world.growth < 2,
  };
}

export function planStep(s: Readonly<SimulationState>, pol: PlanPolicy = {}): Command | null {
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE') return null;
  const choose = pol.choose ?? ((_t, p) => (p === 'DONATE' ? 'ECHO' : 'SELF') as Choice);
  const allowEcho = pol.allowEcho !== false;
  const restAbove = pol.restAbove ?? 40;
  const target = ANCHOR_ORDER.find(id => !s.anchors.find(a => a.id === id)!.aligned)!;
  const chk = checkAnchor(s as SimulationState, target);
  if (chk.ok) return actR(s, 'anchor_' + target);

  const rest0 = () => actR(s, 'thread_terminal') ?? wait(s);
  if (s.realityDrift >= 75 || s.bondStrain >= 80 || s.v2.coherenceDebt >= 20) {
    // stay clear of the FADE: stones soothe drift and debt, the terminal soothes strain
    const near = (id: string) => actR(s, id);
    if (s.bondStrain >= 80) return rest0();
    if (s.v2.coherenceDebt > 0 || s.realityDrift >= 75) return near('stones') ?? rest0();
  }
  const rest = () => actR(s, 'thread_terminal') ?? wait(s);
  // hysteresis: once at the terminal, rest properly instead of leaving at the threshold
  if (s.bondStrain > 20 && act(s, 'thread_terminal')?.type === 'INTERACT') return act(s, 'thread_terminal');
  const needs = partnerNeeds(s);
  const pend = pendingEchoes(s);
  if (allowEcho) {
    for (const [need, kind, tpl] of [[needs.signal, 'signal', 'lantern'], [needs.growth, 'growth', 'greenhouse']] as const) {
      if (need && !pend.some(c => c.kind === kind) && pend.length < 2) {
        if (s.bondStrain > 55) return rest();
        return actR(s, tpl, choose(tpl, 'DONATE'));
      }
    }
  }
  // own needs for the current target
  const failing = failingReqs(s, ANCHOR_REQS[target].player);
  if (failing.length) {
    const t = templateFor(failing);
    if (t) return actR(s, OBJ_OF[t], choose(t, 'SELF_NEED')) ?? wait(s);
  }
  if (!chk.ok && chk.hint === HINTS.DRIFT) {
    if ((s.v2.calm ?? 0) >= 50) { const m = actR(s, 'anchor_' + target); if (m && m.type === 'MOVE') return m; }
    return actR(s, 'stones') ?? rest();
  }
  if (!chk.ok && chk.hint === HINTS.REST) return rest();
  if (s.bondStrain > restAbove && (pend.length > 0 || playerMeets(s as SimulationState, target))) return rest();
  return wait(s);
}

/** Accepts a state (spec) or a SimEngine (Shell demo button). Never mutates its argument. */
export function planWin(input: Readonly<SimulationState> | { getState(): Readonly<SimulationState> }, pol: PlanPolicy = {}, maxTicks = 900): Command[] {
  const state = 'getState' in input ? input.getState() : input;
  const e = new SimEngine(state.seed, state as SimulationState, true);
  const cmds: Command[] = [];
  for (let i = 0; i < maxTicks * 2; i++) {
    const c = planStep(e.getState(), pol);
    if (!c) break;
    const before = e.getState().v2.tick;
    e.dispatch(c);
    if (e.getState().v2.tick === before) break; // rejected: planner stuck
    cmds.push(c);
  }
  return cmds;
}

/** Diegetic next-objective suggestion for a novice: which object to approach and a hint sentence. */
export function objectiveHint(s: Readonly<SimulationState>): { objectId: string; text: string } {
  const target = ANCHOR_ORDER.find(id => !s.anchors.find(a => a.id === id)!.aligned)!;
  const chk = checkAnchor(s as SimulationState, target);
  if (chk.ok) return { objectId: 'anchor_' + target, text: `The ${target.toLowerCase()} anchor is ready.` };
  if (s.v2.coherenceDebt >= 30) return { objectId: 'stones', text: 'The old stones can calm the thread.' };
  if (s.bondStrain > 55) return { objectId: 'thread_terminal', text: HINTS.REST };
  const failing = failingReqs(s, ANCHOR_REQS[target].player);
  const t = templateFor(failing);
  if (t) return { objectId: OBJ_OF[t], text: `The ${t} needs your attention.` };
  return { objectId: 'thread_terminal', text: chk.ok ? '' : chk.hint };
}
