// Partner utility policy (spec section 5). Autonomous, seeded, never networked.
import type { DomainEvent, EventTemplate, Goal, Intention, SimulationState } from './types';
import { TEMPLATES, defaultOutcomeFor, deltaText } from './events';
import { mulberry32, hash32 } from './rng';
import { isOnPath } from './branches';
import { TUNING } from './tuning';
import { ANCHOR_ORDER, ANCHOR_REQS, eligibleAnchor, playerMeets, unmetPartnerReqs, type Req } from './anchors';
import { ECHO_QUEUE_CAP, PARTNER_EVENT_NODE_CAP, addLog, addStep, applyEvent, clamp100, pendingEchoes, recompute, voice } from './core';
import { VOICE_LINES } from '../content/dialogue';

const INTENTION_GOAL: Record<Intention, Goal> = { FIND_ME: 'SEEK', STAY_SAFE: 'STABILISE', HELP_MY_WORLD: 'ASSIST' };
const BASE_BIAS = 10;      // standing intention bias
const REQUEST_BIAS = 20;   // bias right after an explicit request
const ECHO_BONUS = 15;     // assist bonus when a pending echo has a relevant target

function helps(t: EventTemplate, r: Req): boolean {
  const o = t.outcomes[t.selfPreferredOutcome === 'A' ? 0 : 1];
  if (r.flag) return !!o.flags?.includes(r.flag);
  const d = o.delta[r.stat!] ?? 0;
  return (r.min !== undefined && d > 0) || (r.max !== undefined && d < 0);
}

/** Template the partner could use to improve its own world toward an unmet anchor requirement. */
export function pickAssistTemplate(s: SimulationState): EventTemplate | null {
  const capped = Object.values(s.nodes).filter(n => n.owner === 'partner').length >= PARTNER_EVENT_NODE_CAP;
  const reqs = unmetPartnerReqs(s);
  const credits = pendingEchoes(s);
  const useful = (t: EventTemplate) => reqs.some(r => helps(t, r));
  const funded = TEMPLATES.find(t => useful(t) && credits.some(c => c.kind === t.echoKind));
  // out of own attempts: only an echo (a gift from the player) can still move them
  return funded ?? (capped ? null : TEMPLATES.find(useful) ?? null);
}

export function isDangerous(s: SimulationState): boolean {
  return s.bondStrain >= 70 || s.nodes[s.partner.nodeId].world.instability >= 40;
}

/** One discrete partner action. Always logs; always changes something visible (node, strain, link or anchor latch). */
export function partnerTurn(s: SimulationState, out: DomainEvent[], requested?: Intention): Goal {
  const partnerNode = s.nodes[s.partner.nodeId];
  const hazard = partnerNode.world.instability / 5;
  const firstOpen = ANCHOR_ORDER.find(id => !s.anchors.find(a => a.id === id)!.aligned);
  const playerBlocked = !!firstOpen && !playerMeets(s, firstOpen);
  const rng = mulberry32(hash32(s.seed, 'agent', s.turn));
  const noise = () => rng() * 3;
  const bias = (g: Goal) => INTENTION_GOAL[s.intention] === g ? (requested ? REQUEST_BIAS : BASE_BIAS) : 0;

  const assistT = pickAssistTemplate(s);
  const eligible = eligibleAnchor(s);
  const fundedAssist = !!assistT && pendingEchoes(s).some(c => c.kind === assistT.echoKind);
  // A full queue of echoes the partner cannot use would block all further giving: they let the oldest go.
  const staleOne = pendingEchoes(s).find(c => s.turn - c.createdTurn >= 3);
  if (!fundedAssist && pendingEchoes(s).length >= ECHO_QUEUE_CAP && staleOne) {
    const stale = staleOne;
    stale.consumed = true;
    addLog(s, `Partner has no use for your ${stale.kind} echo right now. It settles quietly and makes room.`, 'partner');
  }

  const scores: Array<[Goal, number]> = [];
  scores.push(['STABILISE', 25 + 0.75 * s.bondStrain + hazard + bias('STABILISE') + noise()]);
  // The partner never walks into the player's lineage: it can only climb its OWN ancestors back toward a shared one.
  const canSeek = !isOnPath(s.nodes, s.partner.nodeId, s.player.nodeId) && s.nodes[s.partner.nodeId].parentId !== null;
  if (canSeek) {
    scores.push(['SEEK', 45 + 0.45 * s.realityDrift - 0.2 * s.bondStrain + bias('SEEK') + noise()]);
  }
  if (assistT) {
    scores.push(['ASSIST', TUNING.ASSIST_BASE + 0.25 * s.realityDrift + (playerBlocked ? 25 : 0) + (fundedAssist ? ECHO_BONUS : 0) + bias('ASSIST') + noise()]);
  }
  if (eligible) scores.push(['ANCHOR', 110 + noise()]);

  let goal: Goal = scores.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  let refused = false;
  if (requested && requested !== 'STAY_SAFE' && isDangerous(s)) {
    goal = 'STABILISE';
    refused = true;
  }

  let text = '';
  if (goal === 'SEEK') {
    const from = s.partner.nodeId;
    const to = s.nodes[from].parentId!;
    s.partner.nodeId = to;
    s.nodes[to].visitState = 'VISITED';
    text = `Partner climbs back along their own path toward a place you once shared (now at ${to}).`;
    addStep(s, { actor: 'partner', fromNodeId: from, toNodeId: to, action: 'SEEK', cause: 'Drift pulled them back along their own lineage.', effect: 'The distance between your worlds shrinks; their last choice is left behind.' });
    voice(s, out, 'find', VOICE_LINES.find, 8);
  } else if (goal === 'ASSIST' && assistT) {
    const credit = pendingEchoes(s).find(c => c.kind === assistT.echoKind);
    const occ = s.occurrences[assistT.id] ?? 0;
    const owed = -((s.v2.partnerDrag as Record<string, number> | undefined)?.[assistT.echoKind] ?? 0);
    const roll = defaultOutcomeFor(s.seed, s.partner.nodeId, assistT, partnerNode.world, occ, false, TUNING.DRAG_PENALTY * owed);
    const selected = credit ? assistT.selfPreferredOutcome : roll;
    if (credit) {
      credit.consumed = true;
      const d = s.v2.partnerDrag as Record<string, number> | undefined;
      if (d && d[credit.kind]) d[credit.kind] = Math.min(0, d[credit.kind] + 1); // what you gave repays what you kept
    }
    else s.bondStrain = clamp100(s.bondStrain + TUNING.ASSIST_STRAIN);
    const rec = applyEvent(s, 'partner', assistT.id, 'LET_GO', selected, {
      reason: credit
        ? `Partner reached for the ${assistT.label} and spent your ${credit.kind} echo to take the better outcome.`
        : `Partner reached for the ${assistT.label}; chance decided.`,
      paid: credit ? `Your echo ${credit.id} was spent. Partner paid nothing.` : `Partner paid ${TUNING.ASSIST_STRAIN} strain on the Thread.`,
      echoId: credit?.id,
    });
    text = `Partner works the ${assistT.label}: ${deltaText(rec.effects)}${credit ? ' (echo spent)' : ''}.`;
    out.push({ type: 'PARTNER_TRACE', objectId: assistT.triggerObjectId, text: credit
      ? `Far away, the ${assistT.label.replace('The ', '').toLowerCase()} answers: something you gave up arrives.`
      : `Far away, something at the ${assistT.label.replace('The ', '').toLowerCase()} stirs.` });
    voice(s, out, 'help', VOICE_LINES.help, 8);
  } else if (goal === 'ANCHOR' && eligible) {
    s.anchors.find(a => a.id === eligible)!.partnerReady = true;
    addStep(s, { actor: 'partner', fromNodeId: s.partner.nodeId, toNodeId: s.partner.nodeId, action: 'ANCHOR', cause: `Their world met the ${eligible}.`, effect: 'They hold it open for you.' });
    out.push({ type: 'PARTNER_TRACE', text: `Somewhere, the ${eligible.toLowerCase()} answers in a world that is not yours.` });
    text = `Partner reaches the ${eligible} and holds it open for you.`;
    voice(s, out, 'anchor', VOICE_LINES.anchor, 4);
  } else {
    goal = 'STABILISE';
    s.bondStrain = clamp100(s.bondStrain - 4);
    addStep(s, { actor: 'partner', fromNodeId: s.partner.nodeId, toNodeId: s.partner.nodeId, action: 'STABILISE', cause: refused ? 'Your request was too dangerous.' : 'Nothing safe to try.', effect: 'Strain -4.' });
    text = refused
      ? 'Partner refuses: too dangerous. They steady the Thread instead (strain -4).'
      : assistT === null && Object.values(s.nodes).filter(n => n.owner === 'partner').length >= PARTNER_EVENT_NODE_CAP
        ? 'Partner has no safe event left to try. They steady the Thread (strain -4).'
        : 'Partner holds still while their world settles (strain -4).';
    voice(s, out, 'safe', VOICE_LINES.safe, 8);
  }
  s.partner.lastGoal = goal;
  recompute(s);
  addLog(s, text, 'partner');
  out.push({ type: 'PARTNER_ACTED', goal, text });
  return goal;
}

export { ANCHOR_REQS };
