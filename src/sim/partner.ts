// Autonomous counterpart. Own node, location, flags, resources, knowledge. Never teleports to the player's node.
// It learns only from Thread messages (information), may refuse, and uses seeded tie-breaks.
import type { AnchorId, DomainEvent, Goal, PhysicalAction, SimulationState, Site, ThreadMessage } from './types';
import { TUNING } from './tuning';
import { hash32, mulberry32 } from './rng';
import { addHistory, addLog, addStep, anchorOf, coastOpen, hasFlag, nodeOf, recompute, routeOpen, voice } from './core';
import { runFork } from './forks';
import { ignition } from './world';
import { brotherName, closeGate, spawnNode } from './temporal';

const P = (s: SimulationState) => s.partner;
const LANDMARK: Record<Site, string> = { CLEARING: 'lantern', CROSSING: 'bridge', GARDEN: 'greenhouse', TOWER: 'radio', BEACON: 'anchor_LIGHTHOUSE' };
const SITE_NAME: Record<Site, string> = { CLEARING: 'clearing', CROSSING: 'crossing', GARDEN: 'garden', TOWER: 'far bank', BEACON: 'lookout' };
/** First-person line for a partner action that shows nothing physical by itself. */
function defaultTrace(s: SimulationState, action: string, text: string): { text: string; objectId: string } {
  const site = P(s).site!;
  const objectId = LANDMARK[site];
  const n = SITE_NAME[site];
  if (action === 'TRAVEL') return { objectId, text: site === 'CROSSING' && !routeOpen(s, 'partner') ? "I've reached the crossing. Mine is still flooded." : `I've reached the ${n}.` };
  if (action === 'REFUSE') return { objectId, text: "I can't take that in right now. I'm steadying myself." };
  if (action === 'LEARN') return { objectId: 'tide', text: 'A cyan echo flickers at the sluice. They are trying what you told them.' };
  if (action === 'REST') return { objectId, text: `I'm resting at the ${n} until the Thread settles.` };
  if (action === 'GATHER') return { objectId, text: 'I have wood, or planks, in hand now.' };
  if (action === 'WAIT') return { objectId, text: `I'm at the ${n}, waiting. ${text.replace(/\.$/, '')}.` };
  return { objectId, text: `At the ${n}: ${text.charAt(0).toLowerCase()}${text.slice(1)}` };
}

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
  // V5: one shared objective, its own clearing beacon. 1) light it  2) find a way across (needs a crossing)  3) come back to it.
  const smoky = !!s.era && hasFlag(s, 'partner', 'SMOKE') && hasFlag(s, 'partner', 'FIRE_SPREAD');
  const SMOKE_WAIT = { blocked: "Smoke hangs over the clearing and I can't tend a flame in it. I'll wait for rain." };
  if (id === 'LANTERN') {
    if (!hasFlag(s, 'partner', 'LANTERN_LIT')) return smoky ? SMOKE_WAIT : (fuelStep() ?? go('CLEARING', { action: 'RELIGHT' }));
    return { action: 'WAIT', why: '' };
  }
  const crossing = (): Step | { blocked: string } | null => {
    if (routeOpen(s, 'partner')) return null;
    if (knows('open_sluice')) return go('CROSSING', { action: 'OPEN_SLUICE' });
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
    return { action: 'WAIT', why: '' };
  }
  // LIGHTHOUSE = back home at its clearing beacon
  if (!hasFlag(s, 'partner', 'LANTERN_LIT')) return smoky ? SMOKE_WAIT : (fuelStep() ?? go('CLEARING', { action: 'RELIGHT' }));
  if (site !== 'CLEARING') { if (!travelOk(s, site, 'CLEARING')) { const c = crossing(); if (c) return c; } return { action: 'TRAVEL', to: 'CLEARING' }; }
  return { action: 'WAIT', why: 'Our beacon is lit. I am back beside it, waiting for yours.' };
}

const stepFor = (s: SimulationState, id: AnchorId) => planFor(s, id);

function record(s: SimulationState, out: DomainEvent[], goal: Goal, action: string, text: string, trace?: { text: string; objectId?: string }, outcome?: string): void {
  const p = P(s);
  p.goal = goal;
  addHistory(s, 'partner', p.site!, action, outcome, text);
  addStep(s, { actor: 'partner', fromNodeId: p.nodeId, toNodeId: p.nodeId, action: action === 'TRAVEL' ? 'TRAVEL' : action === 'WAIT' ? 'WAIT' : action === 'REFUSE' ? 'REFUSE' : action === 'LEARN' ? 'LEARN' : action === 'REST' ? 'STABILISE' : 'ACT', cause: text });
  out.push({ type: 'PARTNER_ACTED', goal, text });
  addLog(s, text, 'partner');
  const tr = trace ?? defaultTrace(s, action, text);
  if (action === 'WAIT') { if (p.lastWait === tr.text) return; p.lastWait = tr.text; } else p.lastWait = undefined;
  out.push({ type: 'PARTNER_TRACE', text: tr.text, objectId: tr.objectId });
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
      p.heard = true;
      voice(s, out, 'help', m.technique === 'open_sluice' ? "I think I understand. There's a sluice on my side too." : 'I heard you. I know you are there now.', 0);
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
      record(s, out, 'RESPOND_TO_CALL', 'WAIT', 'Answers the call, but there is nothing new to tell it.');
    }
    s.messages.push({ from: 'partner', to: 'player', kind: 'LOCATION', site: p.site!, turn: s.turn, clarity: m.clarity });
    p.lastSeenMsg = s.messages.length;
  }
  return used;
}

/** One discrete partner action. Always appends to history. Returns true if something was done. */
export function partnerTurn(s: SimulationState, out: DomainEvent[], opts: { respondOnly?: boolean } = {}): void {
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE' || s.partnerFrozen) return;
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

  // The set that has to hear the player is dead because the past opened this brother's gate: push it back (quickly when warned).
  if (s.era && s.v2.pendingContact && !s.v2.contact && hasFlag(s, 'partner', 'GATE_INHERITED') && !hasFlag(s, 'partner', 'WHEEL_TURNING')) {
    p.gateWait = (p.gateWait ?? 0) + 1;
    if (p.crossed && (p.knowledge.includes('caution') || p.gateWait >= 3)) {
      const nm = brotherName(s, 'partner');
      if (p.site !== 'CROSSING' && travelOk(s, p.site!, 'CROSSING')) {
        p.site = 'CROSSING'; record(s, out, 'RESPOND_TO_CALL', 'TRAVEL', 'Heads for the sluice: the set is dead.', { text: `A cyan echo moves toward the sluice. ${nm} has noticed his set is dead.`, objectId: 'tide' });
        recompute(s); return;
      }
      if (p.site === 'CROSSING') {
        const from = p.nodeId;
        spawnNode(s, 'partner', closeGate);
        addStep(s, { actor: 'partner', fromNodeId: from, toNodeId: p.nodeId, action: 'ACT', cause: 'The gate was opened in the past; closing it in his own time.', effect: 'The wheel turns again.' });
        record(s, out, 'RESPOND_TO_CALL', 'ACT', 'Pushes the gate back so the wheel can turn.', { text: `A cyan echo at the sluice: ${nm} pushes his gate back. His wheel turns again and his set wakes.`, objectId: 'tide' });
        recompute(s); return;
      }
    }
  }

  // REACH_NEXT_SITE / PREPARE_BEACON
  const order: AnchorId[] = ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'];
  const pending = order.filter(id => (id === 'LANTERN' ? !hasFlag(s, 'partner', 'LANTERN_LIT') : id === 'GREENHOUSE' ? !p.crossed : !(p.site === 'CLEARING' && hasFlag(s, 'partner', 'LANTERN_LIT'))));
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
    if (do_(s, out, goal, st)) { p.stuck = 0; notePlan(s, out, id, blockedMsg); recompute(s); return; }
  }
  // nothing possible: wait, and occasionally work something out by trial
  p.stuck = (p.stuck ?? 0) + 1;
  if (p.stuck >= 6 && !p.knowledge.includes('open_sluice') && rng() < TUNING.SELF_DISCOVER) {
    p.knowledge.push('open_sluice');
    record(s, out, 'REACH_NEXT_SITE', 'LEARN', 'Works out by trial that the sluice gate can be opened.');
  } else {
    const t = blockedMsg || 'Waits at the lookout for the other side to answer.';
    notePlan(s, out, 'WAIT', blockedMsg);
    record(s, out, goal, 'WAIT', t);
  }
  recompute(s);
}

/** A visible change of plan: the partner struggles, says so, and tries something else. */
function notePlan(s: SimulationState, out: DomainEvent[], plan: string, blocked: string): void {
  const p = P(s);
  const prev = p.plan;
  p.plan = plan;
  if (!prev || prev === plan) return;
  const objectId = /river|cross|plank/.test(blocked) ? 'bridge' : /sand|sluice/.test(blocked) ? 'tide' : LANDMARK[p.site!];
  const text = plan === 'WAIT'
    ? `That way is shut to me${blocked ? ': ' + blocked.charAt(0).toLowerCase() + blocked.slice(1) : '.'} I'll wait and look for another way.`
    : `I couldn't get through${blocked ? ' (' + blocked.replace(/\.$/, '').toLowerCase() + ')' : ''}. I'm changing plan and heading for the ${plan.toLowerCase()} instead.`;
  out.push({ type: 'PARTNER_TRACE', text, objectId });
  addLog(s, text, 'partner');
}

function do_(s: SimulationState, out: DomainEvent[], goal: Goal, st: Step): boolean {
  const p = P(s);
  switch (st.action) {
    case 'TRAVEL': {
      if (!st.to || !travelOk(s, p.site!, st.to)) return false;
      const first = st.to === 'TOWER' && !p.crossed;
      p.site = st.to;
      if (st.to === 'TOWER') p.crossed = true;
      const inh = s.temporal?.ledger.find(c => c.to === 'partner' && (c.key === 'bridge' || c.key === 'water'));
      const nm = brotherName(s, 'partner');
      record(s, out, goal, 'TRAVEL', `Walks to the ${st.to.toLowerCase()}.`,
        first && inh ? { text: `A cyan echo flickers at the crossing: ${nm} ${inh.key === 'bridge' ? 'finds the span already mended and walks across' : 'finds the ford bare and wades across'}.`, objectId: 'bridge' }
          : first ? { text: "A cyan echo flickers by the crossing. They've found a way through.", objectId: 'bridge' }
          : st.to === 'CLEARING' && p.crossed ? { text: 'A cyan echo moves toward the clearing. They are going back to their beacon.', objectId: 'lantern' } : undefined);
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
      if (st.action === 'RELIGHT' && s.era && hasFlag(s, 'partner', 'DRY') && !(p.knowledge ?? []).includes('caution') && (p.hesitate ?? 0) < 2) {
        p.hesitate = (p.hesitate ?? 0) + 1;
        record(s, out, goal, 'WAIT', 'Eyes the dry brush around the fire pit before lighting it.', { text: `A cyan echo hovers at the fire pit: ${brotherName(s, 'partner')} eyes the dry brush and hesitates.`, objectId: 'lantern' });
        return true;
      }
      const r = runFork(s, 'partner', st.action as PhysicalAction, out, true);
      if (!r.ok) return false;
      const o = r.record!;
      p.goal = goal;
      if (st.action === 'OPEN_SLUICE' && r.outcome === 'A') voice(s, out, 'help', 'I opened it. The water is finally falling.', 0);
      if (st.action === 'RELIGHT' && r.outcome === 'A') { voice(s, out, 'clear', 'My beacon is burning again. Can you see it?', Infinity); if (s.era) ignition(s, out, 'partner'); }
      out.push({ type: 'PARTNER_ACTED', goal, text: o.localPhysicalEffect });
      addLog(s, o.localPhysicalEffect, 'partner');
      return true; // the beacon is marked on its next turn: it has to stand at the lookout
    }
  }
}
