// Ambient causal events (ignition, propagation, rain). State-driven, seeded, recorded as real forks.
import type { DomainEvent, EventRecord, SimulationState } from './types';
import { TUNING } from './tuning';
import { eventId, eventRoll, nodeId } from './rng';
import { addHistory, addLog, addStep, hasFlag, nodeOf, recompute } from './core';

interface Side { text: string; flags?: string[]; remove?: string[]; instability?: number }
interface Ambient { template: string; object: string; action: string; pA: number; A: Side; B: Side; reason: (sel: 'A' | 'B') => string; trace?: string }

function ambient(s: SimulationState, out: DomainEvent[], o: Ambient): 'A' | 'B' {
  const parent = nodeOf(s, 'player');
  const key = 'world:' + o.template;
  const occ = s.occurrences[key] ?? 0;
  s.occurrences[key] = occ + 1;
  const roll = eventRoll(s.seed, parent.id, o.template + ':spark', occ);
  const sel: 'A' | 'B' = roll < o.pA ? 'A' : 'B';
  const evId = eventId(s.events.length + 1);
  const ids: [string, string] = [nodeId(Object.keys(s.nodes).length), nodeId(Object.keys(s.nodes).length + 1)];
  const sides = [o.A, o.B];
  (['A', 'B'] as const).forEach((id, i) => {
    const sd = sides[i];
    const flags = parent.flags.filter(x => !(sd.remove ?? []).includes(x));
    for (const fl of sd.flags ?? []) if (!flags.includes(fl)) flags.push(fl);
    s.nodes[ids[i]] = {
      id: ids[i], parentId: parent.id, depth: parent.depth + 1, eventInstanceId: evId, outcomeId: id,
      world: { ...parent.world, instability: parent.world.instability + (sd.instability ?? 0) }, flags,
      visitState: id === sel ? 'VISITED' : 'POTENTIAL', children: [], owner: 'player',
    };
    parent.children.push(ids[i]);
  });
  const chosen = sel === 'A' ? o.A : o.B;
  const from = s.player.nodeId;
  s.player.nodeId = ids[sel === 'A' ? 0 : 1];
  const rec: EventRecord = {
    eventInstanceId: evId, templateId: o.template, actorId: 'player', parentNodeId: parent.id, childNodeIds: ids,
    activeChildNodeId: s.player.nodeId, selectedOutcome: sel, choice: 'LET_GO', effects: chosen.instability ? { instability: chosen.instability } : {},
    reason: o.reason(sel), paid: 'No local material was spent.', driftAfter: 0, strainAfter: 0, turnNumber: s.turn,
    sourceObject: o.object, priorState: parent.flags.join(',') || 'no marks', playerAction: o.action, outcomeA: o.A.text, outcomeB: o.B.text,
    seededRoll: Math.round(roll * 1000) / 1000, chosenOutcome: sel, localPhysicalEffect: chosen.text, evidenceShown: chosen.text,
  };
  s.events.push(rec);
  addStep(s, { actor: 'player', fromNodeId: from, toNodeId: s.player.nodeId, action: 'FORK', eventInstanceId: evId, cause: rec.reason, effect: chosen.text });
  addHistory(s, 'player', 'CLEARING', o.action, sel, chosen.text);
  recompute(s);
  rec.driftAfter = s.realityDrift; rec.strainAfter = s.bondStrain;
  out.push({ type: 'WORLD_CHANGED', objectId: o.object, text: chosen.text });
  addLog(s, chosen.text, 'event');
  return sel;
}

/** After a successful RELIGHT: a dry undergrowth can carry the flame. Returns true if the map changed. */
export function ignition(s: SimulationState, out: DomainEvent[]): boolean {
  const dry = hasFlag(s, 'player', 'DRY');
  const sel = ambient(s, out, {
    template: 'ignition', object: 'lantern', action: 'IGNITION', pA: dry ? TUNING.SPREAD_DRY : TUNING.SPREAD_WET,
    A: { text: 'Sparks leap into the undergrowth. The fire spreads, and smoke rolls over the garden road.', flags: ['FIRE_SPREAD', 'SMOKE', 'RADIO_SMOKE'], instability: 8 },
    B: { text: 'The sparks die in the grass.' },
    reason: r => dry
      ? (r === 'A' ? 'Because the river was diverted, the undergrowth was dry; the signal fire caught.' : 'The undergrowth was dry, but the sparks fell on bare earth.')
      : (r === 'A' ? 'Even damp undergrowth smoulders; the sparks took.' : 'The undergrowth was damp, so the sparks died out.'),
  });
  return sel === 'A';
}

/** Weather and fire, on subsequent ticks. Returns true if the map changed (smoke / rain). */
export function worldTick(s: SimulationState, out: DomainEvent[]): boolean {
  if (!hasFlag(s, 'player', 'FIRE_SPREAD')) return false;
  const diverted = hasFlag(s, 'player', 'WATER_DIVERTED');
  const spread = hasFlag(s, 'player', 'PROPAGATED');
  const sel = ambient(s, out, {
    template: spread ? 'rain' : 'propagation', object: 'greenhouse', action: spread ? 'RAIN' : 'PROPAGATION',
    pA: diverted ? TUNING.RAIN_DIVERTED : TUNING.RAIN_FLOWING,
    A: { text: 'Rain sweeps in. The fire hisses out and the smoke thins. The radio can breathe again.', flags: ['RAINED'], remove: ['FIRE_SPREAD', 'SMOKE', 'RADIO_SMOKE', 'PROPAGATED', 'DRY'] },
    B: { text: 'The fire creeps through the dry grass toward the garden. The smoke thickens.', flags: ['PROPAGATED'], instability: 6 },
    reason: r => r === 'A'
      ? (diverted ? 'The river was diverted, so rain was unlikely, but it came and put the fire out.' : 'Because the river still ran, the air was damp; rain came and put the fire out.')
      : (diverted ? 'Because the river was diverted, the undergrowth stayed dry; the fire crept on.' : 'The fire found enough dry grass to creep on.'),
  });
  void sel;
  return true;
}
