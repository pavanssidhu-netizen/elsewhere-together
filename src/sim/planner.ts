// Deterministic scripted player used for cheapestWinPath(), tests and the demo-seed button.
import type { Command, SimulationState } from './types';
import type { SimEngine } from './engine';
import { TEMPLATES } from './events';
import { ANCHOR_ORDER, ANCHOR_REQS, checkAnchor, playerMeets, type Req } from './anchors';

export interface PlanOpts { echoFirst?: boolean; maxSteps?: number }

const TUTORIAL = ['lantern', 'greenhouse', 'radio'];

function helps(templateId: string, r: Req): boolean {
  const t = TEMPLATES.find(x => x.id === templateId)!;
  const o = t.outcomes[t.selfPreferredOutcome === 'A' ? 0 : 1];
  if (r.flag) return !!o.flags?.includes(r.flag);
  const d = o.delta[r.stat!] ?? 0;
  return (r.min !== undefined && d > 0) || (r.max !== undefined && d < 0);
}

/** Next command for a sensible player, or null when finished. Forks are returned as BEGIN_FORK then RESOLVE_FORK. */
export function nextCommand(s: Readonly<SimulationState>, opts: PlanOpts): Command | null {
  if (s.won) return null;
  if (s.phase === 'BOOT') return { type: 'SET_PHASE', phase: 'EXPLORING' };
  if (s.phase === 'FORK' && s.pendingFork) {
    const first = s.events.filter(e => e.actorId === 'player').length === 0;
    const choice = first && opts.echoFirst && s.pendingFork.templateId === 'lantern' ? 'ECHO' : 'SELF';
    return { type: 'RESOLVE_FORK', eventInstanceId: s.pendingFork.eventInstanceId, choice };
  }
  const target = ANCHOR_ORDER.find(id => !s.anchors.find(a => a.id === id)!.aligned)!;
  if (checkAnchor(s as SimulationState, target).ok) return { type: 'ACTIVATE_ANCHOR', anchorId: target, actor: 'player' };
  if (s.bondStrain > 12) return { type: 'REST_AT_TERMINAL' };
  const played = s.events.filter(e => e.actorId === 'player').length;
  if (played < TUTORIAL.length) return { type: 'BEGIN_FORK', templateId: TUTORIAL[played] };
  if (!playerMeets(s as SimulationState, target)) {
    const unmet = ANCHOR_REQS[target].player;
    const node = s.nodes[s.player.nodeId];
    const failing = unmet.filter(r => {
      if (r.flag) return !node.flags.includes(r.flag);
      const v = node.world[r.stat!];
      return (r.min !== undefined && v < r.min) || (r.max !== undefined && v > r.max);
    });
    const t = TEMPLATES.find(x => failing.some(r => helps(x.id, r)));
    return { type: 'BEGIN_FORK', templateId: (t ?? TEMPLATES[0]).id };
  }
  return s.bondStrain > 0 ? { type: 'REST_AT_TERMINAL' } : { type: 'ADVANCE_PARTNER' };
}

export function planWin(engine: SimEngine, opts: PlanOpts = {}): Command[] {
  const cmds: Command[] = [];
  for (let i = 0; i < (opts.maxSteps ?? 200); i++) {
    const c = nextCommand(engine.getState(), opts);
    if (!c) break;
    cmds.push(c);
    engine.dispatch(c);
  }
  return cmds;
}
