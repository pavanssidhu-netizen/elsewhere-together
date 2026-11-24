// Local physical actions with real two-outcome seeded forks. Used by BOTH the player and the partner.
import type {
  ActorId, Delta, DomainEvent, EventOutcome, EventRecord, EventTemplate, PhysicalAction, SimulationState, Site, Stats,
} from './types';
import { TUNING } from './tuning';
import { eventId, eventRoll, nodeId } from './rng';
import { actorOf, addHistory, addLog, addStep, hasFlag, nodeOf, recompute } from './core';

export const TEMPLATES: EventTemplate[] = [
  { id: 'lantern', label: 'The Fire', triggerObjectId: 'lantern', outcomes: [
    { id: 'A', text: 'The flame catches and holds.', delta: { light: 2, signal: 1 }, flags: ['LANTERN_LIT'], remove: ['LANTERN_BROKEN'] },
    { id: 'B', text: 'The glass cracks and the flame gutters out.', delta: { instability: 8 }, flags: ['LANTERN_BROKEN'] } ] },
  { id: 'bridge', label: 'The Bridge', triggerObjectId: 'bridge', outcomes: [
    { id: 'A', text: 'The boards take your weight. The far bank is reachable without draining the river.', delta: { structure: 1 }, flags: ['BRIDGE_OPEN'], remove: ['BRIDGE_CLOSED', 'BRIDGE_COLLAPSED'] },
    { id: 'B', text: 'The supports shift and the span falls into the water.', delta: { instability: 6 }, flags: ['BRIDGE_COLLAPSED'] } ] },
  { id: 'radio', label: 'The Radio', triggerObjectId: 'radio', outcomes: [
    { id: 'A', text: 'The static clears into one steady tone.', delta: { signal: 1 }, flags: ['RADIO_CLEAR'], remove: ['RADIO_STATIC'] },
    { id: 'B', text: 'Only static. The tone slides away.', delta: { instability: 4 }, flags: ['RADIO_STATIC'], remove: ['RADIO_CLEAR'] } ] },
  { id: 'greenhouse', label: 'The Garden', triggerObjectId: 'greenhouse', outcomes: [
    { id: 'A', text: 'The seedlings straighten and open.', delta: { growth: 2 }, flags: ['GARDEN_GROWN'] },
    { id: 'B', text: 'The seedlings droop in the damp.', delta: {}, flags: ['GARDEN_STUNTED'] } ] },
  { id: 'tide', label: 'The Sluice', triggerObjectId: 'tide', outcomes: [
    { id: 'A', text: 'The gate grinds open. The water drops.', delta: {}, set: { water: 1 }, flags: ['COAST_OPEN', 'WATER_DIVERTED', 'WHEEL_STOPPED', 'DRY'], remove: ['COAST_CLOSED', 'WHEEL_TURNING'] },
    { id: 'B', text: 'The gate jams. The stream rises over its banks.', delta: {}, set: { water: 3 }, flags: ['COAST_CLOSED', 'WHEEL_TURNING'], remove: ['WATER_DIVERTED', 'WHEEL_STOPPED', 'DRY'] } ] },
];
export const TEMPLATE_BY_ID: Record<string, EventTemplate> = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Ctx { s: SimulationState; who: ActorId; prepared: boolean }
interface Spec {
  action: PhysicalAction; template: string; object: string; site: Site;
  blocked(c: Ctx): string | null;                     // factual clue when it cannot be done right now
  pA(c: Ctx): number;                                 // biased, never guaranteed
  A: Partial<EventOutcome>; B: Partial<EventOutcome>; // per-action text/effect overrides
  signal: [string, string];
  technique?: string;                                 // learned by the actor on outcome A
}

const w = (c: Ctx) => nodeOf(c.s, c.who).world;
const f = (c: Ctx, flag: string) => hasFlag(c.s, c.who, flag);
const inv = (c: Ctx) => actorOf(c.s, c.who).inventory;
const you = (c: Ctx) => (c.who === 'player' ? 'your' : 'its');

/** Director's Cut: some gates are pinned until the wheel beside them has been looked at (the player's gate only). */
const stuckClue = (c: Ctx): string | null =>
  c.who === 'player' && c.s.cfg?.sluiceStuck && !c.s.v2.examined.includes('wheel') ? 'The gate will not move. Something is holding it from the wheel side.' : null;

const radioBlock = (c: Ctx): string | null => {
  if (c.who !== 'player') return null;
  if (!f(c, 'WHEEL_TURNING')) return 'The radio is dead. The waterwheel that feeds it has stopped.';
  if (f(c, 'RADIO_SMOKE')) return 'Smoke hangs over the set. Only a hiss comes through.';
  if (!(c.s.player.knowledge ?? []).includes('KNOWS_FREQUENCY')) return "Static on every band. You'd need the right frequency.";
  return null;
};

export const SPECS: Partial<Record<PhysicalAction, Spec>> = {
  RELIGHT: {
    action: 'RELIGHT', template: 'lantern', object: 'lantern', site: 'CLEARING',
    blocked: c => f(c, 'LANTERN_LIT') ? 'The lantern already burns.'
      : inv(c).fuel < 1 ? 'The fire pit is cold. Dry wood by the trees, or dry fibre from the garden, could catch.' : null,
    pA: c => clamp(0.5 + (w(c).water <= 1 ? 0.2 : w(c).water >= 3 ? -0.15 : 0) + (c.prepared ? 0.15 : 0) + (inv(c).fuel >= 2 ? 0.1 : 0) - (f(c, 'LANTERN_BROKEN') ? 0.1 : 0), 0.15, 0.9),
    A: { text: 'The beacon catches and holds. Your half of it burns amber.' },
    B: { text: 'The flame gutters out and the bowl cracks. Try again with more fuel.' },
    signal: ['a warm, steady note', 'a short broken note'], technique: 'relight',
  },
  BEACON: {
    action: 'BEACON', template: 'lantern', object: 'anchor_LIGHTHOUSE', site: 'BEACON',
    blocked: c => f(c, 'BEACON_LIT') ? 'The beacon already burns.'
      : inv(c).fuel < 1 ? 'The beacon bowl is empty. Dry wood would feed it.' : null,
    pA: c => clamp(0.5 + (inv(c).fuel >= 2 ? 0.15 : 0) + (f(c, 'LANTERN_LIT') ? 0.1 : 0) + (c.prepared ? 0.1 : 0) + (w(c).water <= 1 ? 0.1 : 0), 0.15, 0.9),
    A: { text: 'The bowl catches. The beacon burns steady against the dark.', delta: { light: 1 }, flags: ['BEACON_LIT'], remove: ['BEACON_FLICKER'] },
    B: { text: 'The flame gutters in the sea wind and dies. The bowl smokes.', delta: { instability: 6 }, flags: ['BEACON_FLICKER'], remove: [] },
    signal: ['a pulse of light on the horizon', 'a flicker that fades'],
  },
  BRACE: {
    action: 'BRACE', template: 'bridge', object: 'bridge', site: 'CROSSING',
    blocked: c => !f(c, 'BRIDGE_CLOSED') ? 'The bridge already spans the stream.'
      : inv(c).plank < 1 ? (c.who === 'player' ? 'The span is missing boards. A pile of planks lies along the path.' : 'The span is missing boards and there are no planks on this bank.') : null,
    pA: c => clamp(0.4 + (w(c).water <= 1 ? 0.25 : w(c).water >= 3 ? -0.2 : 0) + (c.prepared ? 0.15 : 0) + (inv(c).plank >= 2 ? 0.2 : 0), 0.15, 0.9),
    A: {}, B: {}, signal: ['two bell notes from the crossing', 'a dull crack from the crossing'], technique: 'brace_bridge',
  },
  OPEN_SLUICE: {
    action: 'OPEN_SLUICE', template: 'tide', object: 'tide', site: 'CROSSING',
    blocked: c => f(c, 'COAST_OPEN') && w(c).water <= 1 ? 'The sluice already runs open.' : stuckClue(c),
    pA: c => clamp(0.5 + (c.prepared ? 0.15 : 0) + (f(c, 'LANTERN_LIT') ? 0.1 : 0), 0.15, 0.9),
    A: { text: 'The gate grinds open. The water drops; the ford and the sand path surface.' },
    B: { text: 'The gate jams. The stream rises over its banks and the ford vanishes.' },
    signal: ['water running far off', 'a heavy grinding that stops'], technique: 'open_sluice',
  },
  PROTECT: {
    action: 'PROTECT', template: 'greenhouse', object: 'greenhouse', site: 'GARDEN',
    blocked: c => f(c, 'GARDEN_WITHERED') ? 'The beds are bare. There is nothing left to protect.'
      : f(c, 'GARDEN_GROWN') ? 'The seedlings already stand tall. It is a safe place to rest.' : null,
    pA: c => clamp(0.45 + (w(c).water <= 1 ? 0.2 : 0) + (c.prepared ? 0.15 : 0) + (f(c, 'LANTERN_LIT') ? 0.1 : 0), 0.15, 0.9),
    A: { text: 'The seedlings straighten and open. The garden is a safe place to rest.', set: { growth: 3 } },
    B: { text: 'The seedlings droop in the damp. They need drier ground.' },
    signal: ['green growth rustling', 'a faint wilting hush'], technique: 'protect_garden',
  },
  HARVEST: {
    action: 'HARVEST', template: 'greenhouse', object: 'greenhouse', site: 'GARDEN',
    blocked: c => f(c, 'GARDEN_WITHERED') ? 'The beds are already stripped.' : null,
    pA: c => clamp(0.5 + (w(c).water <= 1 ? 0.2 : 0) + (c.prepared ? 0.1 : 0), 0.15, 0.9),
    A: { text: 'You cut dry fibre, plenty to feed a fire. The beds go bare.', delta: {}, set: { growth: 0 }, flags: ['GARDEN_WITHERED'], remove: ['GARDEN_GROWN', 'GARDEN_STUNTED'] },
    B: { text: 'The fibre is damp; you only get a little. The beds go bare.', delta: {}, set: { growth: 0 }, flags: ['GARDEN_WITHERED'], remove: ['GARDEN_GROWN', 'GARDEN_STUNTED'] },
    signal: ['a dry rasp of cutting', 'a damp tearing sound'],
  },
  TUNE: {
    action: 'TUNE', template: 'radio', object: 'radio', site: 'TOWER',
    blocked: radioBlock,
    pA: c => clamp(0.4 + (c.who === 'player' ? 0.25 : 0) + (f(c, 'LANTERN_LIT') ? 0.2 : 0) + (c.prepared ? 0.15 : 0) - 0.003 * Math.max(0, c.s.realityDrift - 30), 0.1, 0.9),
    A: {}, B: {}, signal: ['one steady tone', 'a smear of static'],
  },
  HOLD_SIGNAL: {
    action: 'HOLD_SIGNAL', template: 'radio', object: 'radio', site: 'TOWER',
    blocked: c => radioBlock(c) ?? (inv(c).fuel < 1 ? 'The set needs warmth to hold a signal. There is no fuel left to feed the lantern.' : null),
    pA: c => clamp(0.35 + (f(c, 'RADIO_CLEAR') ? 0.3 : 0) + (f(c, 'LANTERN_LIT') ? 0.1 : 0) + (c.prepared ? 0.1 : 0) - 0.003 * Math.max(0, c.s.realityDrift - 30), 0.1, 0.9),
    A: { text: 'The tone holds, and your voice carries clear.' },
    B: { text: 'The tone wavers. Your voice breaks into pieces.' },
    signal: ['a clear voice', 'a broken voice'],
  },
};
SPECS.DIVERT_WATER = {
  ...SPECS.OPEN_SLUICE!, action: 'DIVERT_WATER',
  blocked: c => f(c, 'WATER_DIVERTED') && w(c).water <= 1 ? 'The water is already diverted.' : stuckClue(c),
  A: { text: 'The gate grinds across. The crossing is exposed and the sand path surfaces. But the waterwheel has stopped: the radio may be without power.' },
  B: { text: 'The gate jams. The stream rises over its banks and the waterwheel keeps turning.' },
};
void you;

export function applyOutcome(world: Stats, o: Partial<EventOutcome>): { world: Stats; effects: Delta } {
  const nw = { ...world } as Stats;
  const eff: Delta = {};
  for (const k of Object.keys(o.delta ?? {}) as Array<keyof Stats>) { nw[k] += o.delta![k]!; eff[k] = o.delta![k]; }
  for (const k of Object.keys(o.set ?? {}) as Array<keyof Stats>) { eff[k] = o.set![k]! - nw[k]; nw[k] = o.set![k]!; }
  return { world: nw, effects: eff };
}

export function priorStateText(s: SimulationState, who: ActorId): string {
  const n = nodeOf(s, who);
  const a = actorOf(s, who);
  return `${n.world.water >= 2 ? 'water high' : 'water low'}; ${n.flags.join(',') || 'no marks'}; fuel ${a.inventory.fuel}, planks ${a.inventory.plank}`;
}

export interface ForkResult { ok: boolean; clue?: string; record?: EventRecord; outcome?: 'A' | 'B' }

/** Resolve one local fork for `who`. Costs are paid, the actor moves into the chosen child node, both children are recorded. */
export function runFork(s: SimulationState, who: ActorId, action: PhysicalAction, out: DomainEvent[], prepared: boolean, objectOverride?: string): ForkResult {
  const spec = SPECS[action];
  if (!spec) return { ok: false, clue: 'Nothing happens.' };
  const ctx: Ctx = { s, who, prepared };
  const clue = spec.blocked(ctx);
  if (clue) return { ok: false, clue };
  const a = actorOf(s, who);
  const parent = s.nodes[a.nodeId];
  const t = TEMPLATE_BY_ID[spec.template];
  const key = `${who}:${action}`;
  const occ = s.occurrences[key] ?? 0;
  const retry = occ > 0 && s.occurrences[key + ':lastB'] === 1;
  // pay local costs first (the prior state is recorded before)
  const prior = priorStateText(s, who);
  const paidParts: string[] = [];
  if (action === 'RELIGHT' || action === 'BEACON' || action === 'HOLD_SIGNAL') { a.inventory.fuel--; paidParts.push('one load of fuel burned'); }
  if (action === 'BRACE') { const n = Math.min(2, a.inventory.plank); a.inventory.plank -= n; paidParts.push(`${n === 2 ? 'two planks' : 'a plank'} used`); }
  if (who === 'player' && retry) { s.bondStrain += TUNING.RETRY_STRAIN; paidParts.push('the effort of trying again strains the Thread'); }
  if (action === 'HOLD_SIGNAL') { s.bondStrain += TUNING.HOLD_STRAIN; paidParts.push('holding the call strains the Thread'); }

  const pA = spec.pA(ctx);
  const roll = eventRoll(s.seed, parent.id, t.id + ':' + action, occ);
  const sel: 'A' | 'B' = roll < pA ? 'A' : 'B';
  s.occurrences[key] = occ + 1;
  s.occurrences[key + ':lastB'] = sel === 'B' ? 1 : 0;

  const outs: [EventOutcome, EventOutcome] = (['A', 'B'] as const).map((id, i) => {
    const base = t.outcomes[i];
    const o = spec[id];
    return { ...base, ...o, id, delta: { ...(o.delta ?? base.delta) }, flags: o.flags ?? base.flags, remove: o.remove ?? base.remove, set: o.set ?? base.set } as EventOutcome;
  }) as [EventOutcome, EventOutcome];
  const evId = eventId(s.events.length + 1);
  const ids: [string, string] = [nodeId(Object.keys(s.nodes).length), nodeId(Object.keys(s.nodes).length + 1)];
  const effects: Delta[] = [];
  (['A', 'B'] as const).forEach((id, i) => {
    const r = applyOutcome(parent.world, outs[i]);
    effects.push(r.effects);
    const flags = parent.flags.filter(x => !(outs[i].remove ?? []).includes(x));
    for (const fl of outs[i].flags ?? []) if (!flags.includes(fl)) flags.push(fl);
    s.nodes[ids[i]] = {
      id: ids[i], parentId: parent.id, depth: parent.depth + 1, eventInstanceId: evId, outcomeId: id,
      world: r.world, flags, visitState: id === sel ? 'VISITED' : 'POTENTIAL', children: [], owner: who,
    };
    parent.children.push(ids[i]);
  });
  const active = ids[sel === 'A' ? 0 : 1];
  a.nodeId = active;
  const chosen = outs[sel === 'A' ? 0 : 1];
  if (action === 'HARVEST') { const g = sel === 'A' ? 2 : 1; a.inventory.fuel += g; paidParts.push(`the garden gave ${g === 2 ? 'plenty of' : 'a little'} dry fibre`); }
  if (sel === 'A' && spec.technique && who === 'player' && !s.v2.learned.includes(spec.technique)) s.v2.learned.push(spec.technique);

  const object = objectOverride ?? spec.object;
  const rec: EventRecord = {
    eventInstanceId: evId, templateId: t.id, actorId: who, parentNodeId: parent.id, childNodeIds: ids,
    activeChildNodeId: active, selectedOutcome: sel, choice: 'LET_GO', effects: { ...effects[sel === 'A' ? 0 : 1] },
    reason: `${because(s, who, action)}${who === 'player' ? 'You' : 'Your partner'} tried to ${action.toLowerCase().replace(/_/g, ' ')} at the ${object.replace('anchor_', '').toLowerCase()}${c(prepared)}. ${chosen.text}`,
    paid: paidParts.length ? paidParts.join('; ') + '.' : 'No local material was spent.',
    driftAfter: 0, strainAfter: 0, turnNumber: s.turn,
    sourceObject: object, priorState: prior, playerAction: action, outcomeA: outs[0].text, outcomeB: outs[1].text,
    seededRoll: Math.round(roll * 1000) / 1000, chosenOutcome: sel, localPhysicalEffect: chosen.text,
    evidenceShown: chosen.text, threadSignal: spec.signal[sel === 'A' ? 0 : 1],
  };
  s.events.push(rec);
  addStep(s, { actor: who, fromNodeId: parent.id, toNodeId: active, action: 'FORK', eventInstanceId: evId, cause: rec.reason, effect: rec.paid });
  addHistory(s, who, spec.site, action, sel, chosen.text);
  recompute(s);
  rec.driftAfter = s.realityDrift; rec.strainAfter = s.bondStrain;
  if (who === 'player') {
    out.push({ type: 'FORK_RESOLVED', record: rec });
    out.push({ type: 'WORLD_CHANGED', objectId: object, text: chosen.text });
    addLog(s, chosen.text, 'event');
  } else {
    out.push({ type: 'PARTNER_TRACE', objectId: object, text: `Far away: ${spec.signal[sel === 'A' ? 0 : 1]}.` });
  }
  return { ok: true, record: rec, outcome: sel };
}
const c = (prepared: boolean) => (prepared ? ', having looked it over first' : '');

/** Names the prior condition that shaped this attempt (causal record). */
function because(s: SimulationState, who: ActorId, action: PhysicalAction): string {
  if (action === 'RELIGHT' && hasFlag(s, who, 'DRY')) return 'Because the river was diverted, the undergrowth was dry. ';
  if (action === 'RELIGHT') return 'The undergrowth was damp. ';
  if (action === 'TUNE' || action === 'HOLD_SIGNAL') return who === 'player' && (s.player.knowledge ?? []).includes('KNOWS_FREQUENCY') ? 'Because the waterwheel was turning and you knew the frequency, ' : '';
  if (action === 'DIVERT_WATER' || action === 'OPEN_SLUICE') return 'The sluice was worked while the stream ran high. ';
  return '';
}
