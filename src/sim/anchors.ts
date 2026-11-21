import type { AnchorId, SimulationState, Stats, WorldStat } from './types';
import { retraceTargets } from './branches';
import { HINTS } from '../content/dialogue';

export interface Req { stat?: WorldStat; min?: number; max?: number; flag?: string }

export const ANCHOR_ORDER: AnchorId[] = ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'];
export const ANCHOR_STRAIN_CAP = 70;   // maximum strain at which LANTERN / GREENHOUSE lock
export const WIN_DRIFT_MAX = 35;
export const WIN_STRAIN_MAX = 55;

export const ANCHOR_REQS: Record<AnchorId, { player: Req[]; partner: Req[] }> = {
  LANTERN: {
    player: [{ stat: 'light', min: 2 }, { stat: 'signal', min: 2 }],
    partner: [{ stat: 'signal', min: 2 }],
  },
  GREENHOUSE: {
    player: [{ stat: 'growth', min: 2 }, { stat: 'water', max: 1 }],
    partner: [{ stat: 'growth', min: 2 }],
  },
  LIGHTHOUSE: {
    player: [{ flag: 'COAST_OPEN' }, { stat: 'signal', min: 2 }],
    partner: [{ stat: 'signal', min: 2 }],
  },
};

export function reqMet(r: Req, world: Stats, flags: string[]): boolean {
  if (r.flag) return flags.includes(r.flag);
  const v = world[r.stat!];
  return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
}

export function nodeMeets(s: Pick<SimulationState, 'nodes'>, nodeId: string, reqs: Req[]): boolean {
  const n = s.nodes[nodeId];
  return reqs.every(r => reqMet(r, n.world, n.flags));
}

export const playerMeets = (s: SimulationState, id: AnchorId) => nodeMeets(s, s.player.nodeId, ANCHOR_REQS[id].player);
export const partnerMeets = (s: SimulationState, id: AnchorId) => nodeMeets(s, s.partner.nodeId, ANCHOR_REQS[id].partner);

/** Partner goal ANCHOR is eligible for the first unaligned anchor whose partner side is met but not yet latched. */
export function eligibleAnchor(s: SimulationState): AnchorId | null {
  for (const id of ANCHOR_ORDER) {
    const a = s.anchors.find(x => x.id === id)!;
    if (!a.aligned && !a.partnerReady && partnerMeets(s, id)) return id;
  }
  return null;
}

/** Unmet partner requirements across unaligned anchors, in anchor order. */
export function unmetPartnerReqs(s: SimulationState): Req[] {
  const out: Req[] = [];
  for (const id of ANCHOR_ORDER) {
    const a = s.anchors.find(x => x.id === id)!;
    if (a.aligned || a.partnerReady) continue;
    for (const r of ANCHOR_REQS[id].partner) {
      const n = s.nodes[s.partner.nodeId];
      if (!reqMet(r, n.world, n.flags)) out.push(r);
    }
  }
  return out;
}

/** Refresh derived readiness flags. Aligned never reverts; partner readiness is latched until aligned. */
export function refreshAnchors(s: SimulationState): void {
  for (const a of s.anchors) {
    if (a.aligned) { a.playerReady = true; a.partnerReady = true; continue; }
    a.playerReady = playerMeets(s, a.id);
  }
}

export type AnchorCheck = { ok: true } | { ok: false; hint: string };

export function checkAnchor(s: SimulationState, id: AnchorId): AnchorCheck {
  const a = s.anchors.find(x => x.id === id)!;
  if (a.aligned) return { ok: false, hint: `THE ${id} IS ALREADY ALIGNED. GO TO THE NEXT ANCHOR` };
  if (id === 'LIGHTHOUSE' && s.anchors.some(x => x.id !== 'LIGHTHOUSE' && !x.aligned)) return { ok: false, hint: HINTS.ORDER };
  if (!playerMeets(s, id)) {
    const alt = retraceTargets(s.nodes, s.player.nodeId).some(t => nodeMeets(s, t, ANCHOR_REQS[id].player));
    if (alt) return { ok: false, hint: HINTS.RETRACE_SIGNAL };
    const h = id === 'LANTERN' ? HINTS.LANTERN_PLAYER : id === 'GREENHOUSE' ? HINTS.GREENHOUSE_PLAYER : HINTS.LIGHTHOUSE_PLAYER;
    return { ok: false, hint: h };
  }
  if (!a.partnerReady && !partnerMeets(s, id)) return { ok: false, hint: HINTS.PARTNER_WAIT };
  const cap = id === 'LIGHTHOUSE' ? WIN_STRAIN_MAX : ANCHOR_STRAIN_CAP;
  if (s.bondStrain > cap || !s.partner.stable) return { ok: false, hint: HINTS.REST };
  if (id === 'LIGHTHOUSE' && s.realityDrift > WIN_DRIFT_MAX) return { ok: false, hint: HINTS.DRIFT };
  return { ok: true };
}
