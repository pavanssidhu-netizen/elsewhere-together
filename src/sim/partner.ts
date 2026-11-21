// Autonomous counterpart. Own node, location, flags, resources, knowledge. Never teleports to the player's node.
// It learns only from Thread messages (information), may refuse, and uses seeded tie-breaks.
import type { AnchorId, DomainEvent, Goal, PhysicalAction, SimulationState, Site, ThreadMessage } from './types';
import { TUNING } from './tuning';
import { hash32, mulberry32 } from './rng';
import { addHistory, addLog, addStep, anchorOf, coastOpen, hasFlag, nodeOf, recompute, routeOpen, voice } from './core';
import { runFork } from './forks';

const P = (s: SimulationState) => s.partner;

export function isEndangered(s: SimulationState): boolean {
  return s.bondStrain >= TUNING.PARTNER_REFUSE_STRAIN || nodeOf(s, 'partner').world.instability >= 40;
}

/** What the partner can honestly report about its own surroundings (observed facts, never numbers). */
export function partnerReport(s: SimulationState): string {
  const p = P(s);
  const n = nodeOf(s, 'partner');
  if (hasFlag(s, 'partner', 'BEACON_LIT')) return 'The beacon is burning on my side. I am waiting at the lookout.';
  if (!routeOpen(s, 'partner') && !(p.knowledge ?? []).includes('open_sluice')) return "The river rose again. I can't cross from this bank.";
  if (!hasFlag(s, 'partner', 'LANTERN_LIT') && p.inventory.fuel < 1) return 'The fire pit is cold here. I am looking for dry wood.';
  if (!hasFlag(s, 'partner', 'LANTERN_LIT')) return 'I have fuel, and I am trying to light the lantern.';
  if (n.world.water >= 3) return 'The stream is over its banks again on my side.';
  if (!routeOpen(s, 'partner')) return 'The sluice looks like it could be opened. I am going to try.';
  if (!p.crossed) return 'The water is down. I can cross now.';
  if (!coastOpen(s, 'partner')) return 'The sand path to the lookout is still under water here.';
  return 'The lantern is burning here, and the way is open.';
}

type Step = { action: PhysicalAction | 'TRAVEL' | 'MARK' | 'WAIT' | 'GATHER_WOOD' | 'GATHER_PLANK' | 'REST'; to?: Site; anchor?: AnchorId; why?: string };

function travelOk(s: SimulationState, from: Site, to: Site): boolean {
  if ((to === 'TOWER') !== (from === 'TOWER') && !routeOpen(s, 'partner')) return false;
  if (to === 'BEACON' && !coastOpen(s, 'partner')) return false;
  if (from === 'BEACON' && to !== 'BEACON') return coastOpen(s, 'partner');
  return true;
}

const SITE_OF_ANCHOR: Record<AnchorId, Site> = { LANTERN: 'CLEARING', GREENHOUSE: 'GARDEN', LIGHTHOUSE: 'BEACON' };

/** Next step toward one anchor, or null with a blocking reason. */
function planFor(s: SimulationState, id: AnchorId): Step | { blocked: string } {
  const p = P(s);
  const site = p.site!;
  const go = (to: Site, then: Step): Step => (site === to ? then : { action: 'TRAVEL', to });
  const knows = (k: string) => (p.knowledge ?? []).includes(k);
  const fuelStep = (): Step | null => {
    if (p.inventory.fuel >= 1) return null;
    if (p.taken.wood < TUNING.PILE) return go('CLEARING', { action: 'GATHER_WOOD' });
    if (!hasFlag(s, 'partner', 'GARDEN_WITHERED')) return go('GARDEN', { action: 'HARVEST' });
    return { action: 'WAIT', why: 'No fuel is left here.' };
  };
  if (id === 'LANTERN') {
    if (!hasFlag(s, 'partner', 'LANTERN_LIT')) return fuelStep() ?? go('CLEARING', { action: 'RELIGHT' });
    return go('CLEARING', { action: 'MARK', anchor: 'LANTERN' });
  }
  const crossing = (): Step | { blocked: string } | null => {
    if (routeOpen(s, 'partner')) return null;
    if (knows('open_sluice') && !hasFlag(s, 'partner', 'COAST_OPEN')) return go('CROSSING', { action: 'OPEN_SLUICE' });
    if (knows('open_sluice') && nodeOf(s, 'partner').world.water >= 3) return go('CROSSING', { action: 'OPEN_SLUICE' });
    if (p.inventory.plank >= 1) return go('CROSSING', { action: 'BRACE' });
    if (p.taken.plank < TUNING.PILE) return go('CROSSING', { action: 'GATHER_PLANK' });
    return { blocked: "The river is high and there are no planks on this bank. I can't cross from here." };
  };
  if (id === 'GREENHOUSE') {
    if (!p.crossed) {
      const c = crossing();
      if (c) return c;
      return { action: 'TRAVEL', to: 'TOWER' };
    }
    return go('GARDEN', { action: 'MARK', anchor: 'GREENHOUSE' });
  }
  // LIGHTHOUSE
  if (!coastOpen(s, 'partner')) {
    if (knows('open_sluice')) return go('CROSSING', { action: 'OPEN_SLUICE' });
    return { blocked: 'The sand path is under water. I do not know how to bring it down.' };
  }
  if (!hasFlag(s, 'partner', 'BEACON_LIT')) return fuelStep() ?? go('BEACON', { action: 'BEACON' });
  return go('BEACON', { action: 'MARK', anchor: 'LIGHTHOUSE' });
}

const stepFor = (s: SimulationState, id: AnchorId) => planFor(s, id);

function record(s: SimulationState, out: DomainEvent[], goal: Goal, action: string, text: string, trace?: { text: string; objectId?: string }, outcome?: string): void {
  const p = P(s);
  p.goal = goal;
  addHistory(s, 'partner', p.site!, action, outcome, text);
  addStep(s, { actor: 'partner', fromNodeId: p.nodeId, toNodeId: p.nodeId, action: action === 'TRAVEL' ? 'TRAVEL' : action === 'WAIT' ? 'WAIT' : action === 'REFUSE' ? 'REFUSE' : action === 'LEARN' ? 'LEARN' : action === 'REST' ? 'STABILISE' : 'ACT', cause: text });
  out.push({ type: 'PARTNER_ACTED', goal, text });
  addLog(s, text, 'partner');
  if (trace) out.push({ type: 'PARTNER_TRACE', text: trace.text, objectId: trace.objectId });
}

/** Handle new player messages: learn only if understood, refuse if endangered. Returns true if it used its action. */
function respond(s: SimulationState, out: DomainEvent[]): boolean {
  const p = P(s);
  const idx = p.lastSeenMsg ?? 0;
  let used = false;
  for (let i = idx; i < s.messages.length; i++) {
    const m: ThreadMessage = s.messages[i];
    p.lastSeenMsg = i + 1;
    if (m.from !== 'player') continue;
    used = true;
    const rng = mulberry32(hash32(s.seed, 'recv', i));
    if (isEndangered(s)) {
      p.refusals = (p.refusals ?? 0) + 1;
      voice(s, out, 'refusal', "I can't take that in right now. I need to steady myself first.", 0);
      record(s, out, 'SURVIVE', 'REFUSE', 'Turns away from the call to steady itself.');
      continue;
    }
    if (rng() > m.clarity + 0.3) {
      voice(s, out, 'distant', "You're breaking up. Say it again?", 0);
      record(s, out, 'RESPOND_TO_CALL', 'WAIT', 'Could not make out the call.');
      continue;
    }
    if (m.kind === 'TECHNIQUE' && m.technique) {
      if (!(p.knowledge ?? []).includes(m.technique)) p.knowledge!.push(m.technique);
      voice(s, out, 'help', `I understood. ${m.technique === 'open_sluice' ? 'You opened the sluice gate to lower the water. I can try that.' : 'I can try what you did.'}`, 0);
      record(s, out, 'RESPOND_TO_CALL', 'LEARN', `Learns from the call: ${m.technique.replace(/_/g, ' ')}.`);
    } else if (m.kind === 'LOCATION') {
      p.priority = m.site;
      voice(s, out, 'find', `I'll head toward the ${m.site.toLowerCase()} side of things.`, 0);
      record(s, out, 'RESPOND_TO_CALL', 'WAIT', `Notes that you are at the ${m.site.toLowerCase()}.`);
    } else if (m.kind === 'WARNING') {
      if (!(p.knowledge ?? []).includes('caution')) p.knowledge!.push('caution');
      voice(s, out, 'safe', 'I will go carefully.', 0);
      record(s, out, 'RESPOND_TO_CALL', 'WAIT', 'Takes the warning to heart.');
    } else {
      voice(s, out, 'clear', partnerReport(s), 0);
      record(s, out, 'RESPOND_TO_CALL', 'WAIT', 'Answers the call.');
    }
    s.messages.push({ from: 'partner', to: 'player', kind: 'LOCATION', site: p.site!, turn: s.turn, clarity: m.clarity });
    p.lastSeenMsg = s.messages.length;
  }
  return used;
}

/** One discrete partner action. Always appends to history. Returns true if something was done. */
export function partnerTurn(s: SimulationState, out: DomainEvent[], opts: { respondOnly?: boolean } = {}): void {
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE') return;
  const p = P(s);
  p.knowledge ??= [];
  const responded = respond(s, out);
  if (opts.respondOnly || responded) { recompute(s); return; }
  const rng = mulberry32(hash32(s.seed, 'agent', s.turn, s.v2.tick, s.history.length));
  const cautious = p.knowledge.includes('caution');

  // SURVIVE
  if (s.bondStrain >= TUNING.PARTNER_SAFE_STRAIN - (cautious ? 8 : 0)) {
    const safe = p.site === 'TOWER' || (p.site === 'GARDEN' && hasFlag(s, 'partner', 'GARDEN_GROWN'));
    if (safe) {
      s.bondStrain = Math.max(0, s.bondStrain - TUNING.PARTNER_REST_STRAIN);
      record(s, out, 'SURVIVE', 'REST', 'Rests by the stones until the Thread settles.', { text: 'Far away, a soft humming settles.' });
      recompute(s); return;
    }
    if (travelOk(s, p.site!, 'TOWER') && routeOpen(s, 'partner')) { p.site = 'TOWER'; p.crossed = true; record(s, out, 'SURVIVE', 'TRAVEL', 'Heads for the far bank to rest.'); recompute(s); return; }
    if (hasFlag(s, 'partner', 'GARDEN_GROWN')) { p.site = 'GARDEN'; record(s, out, 'SURVIVE', 'TRAVEL', 'Heads for the garden to rest.'); recompute(s); return; }
  }

  // REACH_NEXT_SITE / PREPARE_BEACON
  const order: AnchorId[] = ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'];
  const pending = order.filter(id => !anchorOf(s, id).partnerReady);
  let goal: Goal = 'REACH_NEXT_SITE';
  let queue = pending.length ? pending : (['LIGHTHOUSE'] as AnchorId[]);
  if (!pending.length) goal = 'PREPARE_BEACON';
  else if (pending.length === 1 && pending[0] === 'LIGHTHOUSE') goal = 'PREPARE_BEACON';
  if (p.priority) { const pri = queue.filter(id => SITE_OF_ANCHOR[id] === p.priority); queue = [...pri, ...queue.filter(id => !pri.includes(id))]; }
  // seeded tie-break between equally ordered sites: LANTERN and GREENHOUSE may go either way when the player gave no direction
  if (!p.priority && queue.length >= 2 && queue[0] === 'LANTERN' && queue[1] === 'GREENHOUSE' && rng() < 0.3 && anchorOf(s, 'LANTERN').partnerReady === false && p.inventory.fuel < 1 && p.taken.wood >= TUNING.PILE) queue = [queue[1], queue[0], ...queue.slice(2)];

  let blockedMsg = '';
  for (const id of queue) {
    const st = stepFor(s, id);
    if ('blocked' in st) { blockedMsg = blockedMsg || st.blocked; continue; }
    if (st.action === 'WAIT') { blockedMsg = blockedMsg || (st.why ?? ''); continue; }
    if (do_(s, out, goal, st)) { p.stuck = 0; recompute(s); return; }
  }
  // nothing possible: wait, and occasionally work something out by trial
  p.stuck = (p.stuck ?? 0) + 1;
  if (p.stuck >= 6 && !p.knowledge.includes('open_sluice') && rng() < TUNING.SELF_DISCOVER) {
    p.knowledge.push('open_sluice');
    record(s, out, 'REACH_NEXT_SITE', 'LEARN', 'Works out by trial that the sluice gate can be opened.');
  } else {
    const t = blockedMsg || 'Waits at the lookout for the other side to answer.';
    record(s, out, goal, 'WAIT', t);
  }
  recompute(s);
}

function do_(s: SimulationState, out: DomainEvent[], goal: Goal, st: Step): boolean {
  const p = P(s);
  switch (st.action) {
    case 'TRAVEL': {
      if (!st.to || !travelOk(s, p.site!, st.to)) return false;
      p.site = st.to;
      if (st.to === 'TOWER') p.crossed = true;
      record(s, out, goal, 'TRAVEL', `Walks to the ${st.to.toLowerCase()}.`);
      return true;
    }
    case 'GATHER_WOOD': p.taken.wood++; p.inventory.fuel++; record(s, out, goal, 'GATHER', 'Gathers dry wood.', { text: 'Far away, a faint chopping sound.', objectId: 'woodpile' }); return true;
    case 'GATHER_PLANK': p.taken.plank++; p.inventory.plank++; record(s, out, goal, 'GATHER', 'Carries a plank to the crossing.'); return true;
    case 'MARK': {
      const a = anchorOf(s, st.anchor!);
      const cond = st.anchor === 'LANTERN' ? hasFlag(s, 'partner', 'LANTERN_LIT')
        : st.anchor === 'GREENHOUSE' ? !!p.crossed : hasFlag(s, 'partner', 'BEACON_LIT');
      if (!cond) return false;
      if (!a.partnerReady) {
        a.partnerReady = true;
        record(s, out, goal, 'MARK', `Reaches the ${st.anchor!.toLowerCase()} marker on its side.`, { text: st.anchor === 'GREENHOUSE' ? 'A distant bell note, answered by another.' : 'A far-off note, like your own, but not yours.', objectId: 'anchor_' + st.anchor });
      } else record(s, out, goal, 'WAIT', 'Holds its place.');
      return true;
    }
    default: {
      const r = runFork(s, 'partner', st.action as PhysicalAction, out, true);
      if (!r.ok) return false;
      const o = r.record!;
      p.goal = goal;
      out.push({ type: 'PARTNER_ACTED', goal, text: o.localPhysicalEffect });
      addLog(s, o.localPhysicalEffect, 'partner');
      return true; // the beacon is marked on its next turn: it has to stand at the lookout
    }
  }
}
