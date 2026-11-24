// The time split. Sam lives in the PAST, Jensen in the FUTURE. Only FLAGS of persistent world state travel forward in time,
// never inventory or objects, and never backward: the future cannot change the past, it can only warn it through the Thread.
// Every inherited change is appended once to the journey as a 'TEMPORAL' step (cause = what the past did, effect = what the future finds).
import type {
  ActorId, DomainEvent, Era, SimulationState, Stats, TemporalChange, TemporalKey, TemporalState, WorldStart,
} from './types';
import { TUNING } from './tuning';
import { actorOf, addLog, addStep, nodeOf } from './core';
import { startWorld } from './puzzle';

export const eraOf = (s: Readonly<SimulationState>, who: ActorId): Era | null => (s.era ? s.era[who] : null);
export const actorInEra = (s: Readonly<SimulationState>, era: Era): ActorId => (s.era && s.era.player === era ? 'player' : 'partner');
const nameOf = (era: Era) => (era === 'PAST' ? 'Sam' : 'Jensen');

export function initTemporal(s: SimulationState): TemporalState {
  const past = nodeOf(s, actorInEra(s, 'PAST'));
  const t: TemporalState = { ledger: [], seen: {}, woodSeen: 0, plankSeen: 0, applied: [] };
  snapshot(past.flags).forEach(k => { t.seen[k] = true; });
  t.woodSeen = actorOf(s, actorInEra(s, 'PAST')).taken.wood;
  t.plankSeen = actorOf(s, actorInEra(s, 'PAST')).taken.plank;
  return t;
}

/** Persistent facts held in a node's flags. */
function snapshot(flags: readonly string[]): string[] {
  const out: string[] = [];
  if (!flags.includes('BRIDGE_CLOSED')) out.push('bridge');
  if (flags.includes('WATER_DIVERTED')) out.push('water');
  if (flags.includes('GARDEN_GROWN')) out.push('garden:grown');
  if (flags.includes('GARDEN_WITHERED')) out.push('garden:withered');
  if (flags.includes('FIRE_SPREAD')) out.push('fire');
  return out;
}

const LANDMARK: Record<TemporalKey, string> = { bridge: 'bridge', water: 'tide', garden: 'greenhouse', fire: 'lantern', wood: 'woodpile', plank: 'planks' };

/** Child node of `who`'s current node (a temporal transition, not a fork: the depth stays so the lineage drift is not inflated). */
export function spawnNode(s: SimulationState, who: ActorId, mutate: (n: { flags: string[]; world: Stats }) => void): void {
  const a = actorOf(s, who);
  const parent = s.nodes[a.nodeId];
  const id = 'T' + String(Object.keys(s.nodes).length).padStart(4, '0');
  const n = { flags: [...parent.flags], world: { ...parent.world } };
  mutate(n);
  s.nodes[id] = { id, parentId: parent.id, depth: parent.depth, eventInstanceId: null, outcomeId: null, world: n.world, flags: n.flags, visitState: 'VISITED', children: [], owner: who };
  parent.children.push(id);
  a.nodeId = id;
}

const add = (f: string[], ...x: string[]) => { for (const k of x) if (!f.includes(k)) f.push(k); };
const del = (f: string[], ...x: string[]) => { for (const k of x) { const i = f.indexOf(k); if (i >= 0) f.splice(i, 1); } };

interface Effect { text: string; echo: string; differs(flags: string[]): boolean; apply(n: { flags: string[]; world: Stats }): void }

function effectFor(key: string, past: Era, fromName = nameOf(past)): Effect | null {
  switch (key) {
    case 'bridge': return {
      text: `${fromName} mended the bridge.`, echo: `A cyan echo flickers at the crossing: ${fromName} mended the bridge. Yours stands now.`,
      differs: f => f.includes('BRIDGE_CLOSED'), apply: n => { del(n.flags, 'BRIDGE_CLOSED', 'BRIDGE_COLLAPSED'); add(n.flags, 'BRIDGE_OPEN'); },
    };
    case 'water': return {
      text: `${fromName} turned the river aside.`, echo: `A cyan echo ripples at the sluice: ${fromName} turned the river aside. Your channel runs low and your wheel has stopped.`,
      differs: f => !f.includes('WATER_DIVERTED'),
      apply: n => { n.world.water = 1; add(n.flags, 'WATER_DIVERTED', 'COAST_OPEN', 'DRY', 'WHEEL_STOPPED', 'GATE_INHERITED'); del(n.flags, 'WHEEL_TURNING', 'COAST_CLOSED'); },
    };
    case 'garden:grown': return {
      text: `${fromName}'s seedlings grew.`, echo: `A cyan echo glows over the garden: ${fromName}'s seedlings took. Yours stand tall.`,
      differs: f => !f.includes('GARDEN_GROWN') && !f.includes('GARDEN_WITHERED'), apply: n => { add(n.flags, 'GARDEN_GROWN'); n.world.growth = 3; },
    };
    case 'garden:withered': return {
      text: `${fromName} stripped the garden.`, echo: `A cyan echo drifts over the garden: ${fromName} stripped the beds. Yours are bare.`,
      differs: f => !f.includes('GARDEN_WITHERED'), apply: n => { add(n.flags, 'GARDEN_WITHERED'); del(n.flags, 'GARDEN_GROWN', 'GARDEN_STUNTED'); n.world.growth = 0; },
    };
    case 'fire': return {
      text: `${fromName}'s signal fire caught the brush.`, echo: `A cyan echo flares in the clearing: ${fromName}'s fire caught the brush. Smoke has settled over your road and your set.`,
      differs: f => !f.includes('FIRE_SPREAD'), apply: n => { add(n.flags, 'FIRE_SPREAD', 'SMOKE', 'RADIO_SMOKE', 'DRY'); },
    };
  }
  return null;
}

function inherit(s: SimulationState, out: DomainEvent[], key: string, announce: boolean): boolean {
  const pastWho = actorInEra(s, 'PAST'), futWho = actorInEra(s, 'FUTURE');
  const eff = effectFor(key, 'PAST');
  if (!eff || !eff.differs(nodeOf(s, futWho).flags)) return false;
  const from = actorOf(s, futWho).nodeId;
  spawnNode(s, futWho, eff.apply);
  if (announce) {
    s.temporal!.applied.push(key);
    const k = (key.split(':')[0]) as TemporalKey;
    const change: TemporalChange = { key: k, from: pastWho, to: futWho, tick: s.v2.tick, text: eff.text, echo: eff.echo };
    s.temporal!.ledger.push(change);
    addStep(s, { actor: futWho, fromNodeId: from, toNodeId: actorOf(s, futWho).nodeId, action: 'TEMPORAL', cause: eff.text, effect: eff.echo });
    addLog(s, eff.echo, 'event');
    out.push({ type: 'TEMPORAL', change, toActor: futWho, text: eff.echo, objectId: LANDMARK[k] });
  }
  return true;
}

/** Call after every accepted command: propagates whatever the PAST actor changed since the last call. No-op without a time split. */
export function syncTemporal(s: SimulationState, out: DomainEvent[]): void {
  if (!s.era || !s.temporal) return;
  const t = s.temporal;
  const pastWho = actorInEra(s, 'PAST');
  const now = snapshot(nodeOf(s, pastWho).flags);
  for (const key of now) {
    if (t.seen[key]) continue;
    t.seen[key] = true;
    inherit(s, out, key, true);
  }
  // reversals made by retracing (the past walking back to a fork) are not propagated: what happened stays happened
  for (const key of Object.keys(t.seen)) if (!now.includes(key)) delete t.seen[key];
  const pa = actorOf(s, pastWho), fu = actorOf(s, actorInEra(s, 'FUTURE'));
  for (const k of ['wood', 'plank'] as const) {
    const cur = pa.taken[k], seen = k === 'wood' ? t.woodSeen : t.plankSeen;
    if (cur > seen) {
      const before = fu.taken[k];
      fu.taken[k] = Math.min(TUNING.PILE, fu.taken[k] + (cur - seen));
      if (fu.taken[k] > before) {
        const change: TemporalChange = {
          key: k, from: pastWho, to: actorInEra(s, 'FUTURE'), tick: s.v2.tick,
          text: `${nameOf('PAST')} took ${k === 'wood' ? 'wood' : 'a plank'}.`,
          echo: `A cyan echo by the ${k === 'wood' ? 'woodpile' : 'plank stack'}: ${nameOf('PAST')} took ${k === 'wood' ? 'wood' : 'a plank'} long ago. Your pile is that much thinner.`,
        };
        t.ledger.push(change);
        addStep(s, { actor: actorInEra(s, 'FUTURE'), fromNodeId: fu.nodeId, toNodeId: fu.nodeId, action: 'TEMPORAL', cause: change.text, effect: change.echo });
        out.push({ type: 'TEMPORAL', change, toActor: actorInEra(s, 'FUTURE'), text: change.echo, objectId: LANDMARK[k] });
      }
    }
    if (k === 'wood') t.woodSeen = cur; else t.plankSeen = cur;
  }
}

/** After the FUTURE actor retraced to an earlier node: put every earlier inheritance back (silently: it was already recorded). */
export function reapplyLedger(s: SimulationState, out: DomainEvent[]): void {
  if (!s.era || !s.temporal) return;
  for (const k of s.temporal.applied) inherit(s, out, k, false);
}

/** Starting nodes for both worlds. */
export function eraWorlds(s: SimulationState, st: { past: WorldStart; future: WorldStart }, layout: 'A' | 'B' | 'C' | 'D') {
  void s;
  return { past: startWorld(st.past, layout), future: startWorld(st.future, layout) };
}

/** Pushing an inherited (open) gate back: the river returns to its old bed and the wheel turns. */
export function closeGate(n: { flags: string[]; world: Stats }): void {
  n.world.water = 2;
  del(n.flags, 'WATER_DIVERTED', 'COAST_OPEN', 'DRY', 'WHEEL_STOPPED', 'GATE_INHERITED');
  add(n.flags, 'WHEEL_TURNING', 'COAST_CLOSED');
}
export const brotherName = (s: Readonly<SimulationState>, who: ActorId): string => (s.era ? nameOf(s.era[who]) : 'They');
