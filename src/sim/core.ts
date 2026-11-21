// Shared mutation helpers used by engine.ts and agent.ts. All functions mutate the (already cloned) state.
import type {
  ActorId, Choice, DomainEvent, EventRecord, JourneyStep, LogEntry, SimulationState, VoiceCue, Stats,
} from './types';
import { TEMPLATE_BY_ID, adaptOutcome, applyDelta, mergeFlags } from './events';
import { calculateDrift } from './branches';
import { refreshAnchors } from './anchors';
import { eventId, nodeId } from './rng';

export const NODE_SOFT_CAP = 48;        // archive size target
export const PARTNER_EVENT_NODE_CAP = 30; // partner stops creating optional events beyond this
export const ECHO_QUEUE_CAP = 2;
export const REST_RECOVERY = 12;
export const OVERSTRAIN = 85;           // partner.stable = strain < OVERSTRAIN

export const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

export function addLog(s: SimulationState, text: string, kind: LogEntry['kind'], uncertain?: boolean): void {
  const e: LogEntry = { turn: s.turn, text, kind };
  if (uncertain) e.uncertain = true;
  s.log.push(e);
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

export function recompute(s: SimulationState): void {
  s.bondStrain = clamp100(s.bondStrain);
  s.partner.stable = s.bondStrain < OVERSTRAIN;
  refreshAnchors(s);
  s.realityDrift = calculateDrift(s);
}

export function pendingEchoes(s: SimulationState) { return s.echoCredits.filter(c => !c.consumed); }

function lastVoiceTurn(s: SimulationState, cue: VoiceCue): number | null {
  let last: number | null = null;
  const p = cue + '@';
  for (const id of s.seenDialogueIds) if (id.startsWith(p)) last = Number(id.slice(p.length));
  return last;
}

/** Emit a throttled voice cue (cooldown in turns; Infinity = once per run). */
export function voice(s: SimulationState, out: DomainEvent[], cue: VoiceCue, text: string, cooldown: number): void {
  const last = lastVoiceTurn(s, cue);
  if (last !== null && s.turn - last < cooldown) return;
  s.seenDialogueIds = s.seenDialogueIds.filter(i => !i.startsWith(cue + '@'));
  if (!s.seenDialogueIds.includes(cue)) s.seenDialogueIds.push(cue);
  s.seenDialogueIds.push(`${cue}@${s.turn}`);
  out.push({ type: 'VOICE', cue, text });
}

/** Create exactly two child nodes for `actor`, move the actor into the selected one, record the event. */
export function applyEvent(
  s: SimulationState, actor: ActorId, templateId: string, choice: Choice, selected: 'A' | 'B',
  info: { reason: string; paid: string; echoId?: string },
): EventRecord {
  const t = TEMPLATE_BY_ID[templateId];
  const actorState = actor === 'player' ? s.player : s.partner;
  const parent = s.nodes[actorState.nodeId];
  const evId = eventId(s.events.length + 1);
  const outs = (['A', 'B'] as const).map(id => adaptOutcome(t, id, parent.world));
  const ids: [string, string] = [nodeId(Object.keys(s.nodes).length), nodeId(Object.keys(s.nodes).length + 1)];
  (['A', 'B'] as const).forEach((id, i) => {
    const o = outs[i];
    const world: Stats = applyDelta(parent.world, o.delta);
    s.nodes[ids[i]] = {
      id: ids[i], parentId: parent.id, depth: parent.depth + 1, eventInstanceId: evId, outcomeId: id,
      world, flags: mergeFlags(parent.flags, o.flags), visitState: id === selected ? 'VISITED' : 'POTENTIAL',
      children: [], owner: actor,
    };
    parent.children.push(ids[i]);
  });
  if (actor === 'partner' && s.v2.partnerDrag) {
    for (const id of ids) s.nodes[id].world = applyDelta(s.nodes[id].world, s.v2.partnerDrag);
    delete s.v2.partnerDrag;
  }
  const active = ids[selected === 'A' ? 0 : 1];
  actorState.nodeId = active;
  s.occurrences[t.id] = (s.occurrences[t.id] ?? 0) + 1;
  const rec: EventRecord = {
    eventInstanceId: evId, templateId: t.id, actorId: actor, parentNodeId: parent.id, childNodeIds: ids,
    activeChildNodeId: active, selectedOutcome: selected, choice, effects: { ...outs[selected === 'A' ? 0 : 1].delta },
    reason: info.reason, paid: info.paid, driftAfter: 0, strainAfter: 0, turnNumber: s.turn,
  };
  if (info.echoId) rec.echoId = info.echoId;
  s.events.push(rec);
  addStep(s, {
    actor, fromNodeId: parent.id, toNodeId: active, action: choice === 'ECHO' ? 'ECHO' : 'FORK',
    eventInstanceId: evId, cause: info.reason, effect: info.paid,
  });
  return rec;
}

export function addStep(s: SimulationState, step: Omit<JourneyStep, 'seq' | 'tick'>): void {
  s.v2.journey.push({ seq: s.v2.journey.length + 1, tick: s.v2.tick, ...step });
}
