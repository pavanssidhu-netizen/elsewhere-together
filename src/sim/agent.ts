// Partner utility policy (spec section 5). Autonomous, seeded, never networked.
import type { DomainEvent, EventTemplate, Goal, Intention, SimulationState } from './types';
import { TEMPLATES, defaultOutcomeFor, deltaText } from './events';
import { mulberry32, hash32 } from './rng';
import { stepToward } from './branches';
import { ANCHOR_ORDER, ANCHOR_REQS, eligibleAnchor, playerMeets, unmetPartnerReqs, type Req } from './anchors';
import { PARTNER_EVENT_NODE_CAP, addLog, applyEvent, clamp100, pendingEchoes, recompute, voice } from './core';
import { VOICE_LINES } from '../content/dialogue';

const INTENTION_GOAL: Record<Intention, Goal> = { FIND_ME: 'SEEK', STAY_SAFE: 'STABILISE', HELP_MY_WORLD: 'ASSIST' };
const BASE_BIAS = 10;      // standing intention bias
const REQUEST_BIAS = 20;   // bias right after an explicit request
const ECHO_BONUS = 15;     // assist bonus when a pending echo has a relevant target
const ASSIST_STRAIN = 3;   // un-funded assist costs the partner something

function helps(t: EventTemplate, r: Req): boolean {
  const o = t.outcomes[t.selfPreferredOutcome === 'A' ? 0 : 1];
  if (r.flag) return !!o.flags?.includes(r.flag);
  const d = o.delta[r.stat!] ?? 0;
  return (r.min !== undefined && d > 0) || (r.max !== undefined && d < 0);
}

/** Template the partner could use to improve its own world toward an unmet anchor requirement. */
export function pickAssistTemplate(s: SimulationState): EventTemplate | null {
  if (Object.keys(s.nodes).length >= PARTNER_EVENT_NODE_CAP) return null;
  const reqs = unmetPartnerReqs(s);
  const credits = pendingEchoes(s);
  const useful = (t: EventTemplate) => reqs.some(r => helps(t, r));
  const funded = TEMPLATES.find(t => useful(t) && credits.some(c => c.kind === t.echoKind));
  return funded ?? TEMPLATES.find(useful) ?? null;
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

  const scores: Array<[Goal, number]> = [];
  scores.push(['STABILISE', 25 + 0.75 * s.bondStrain + hazard + bias('STABILISE') + noise()]);
  if (s.partner.nodeId !== s.player.nodeId) {
    scores.push(['SEEK', 45 + 0.45 * s.realityDrift - 0.2 * s.bondStrain + bias('SEEK') + noise()]);
  }
  if (assistT) {
    scores.push(['ASSIST', 20 + 0.25 * s.realityDrift + (playerBlocked ? 25 : 0) + (fundedAssist ? ECHO_BONUS : 0) + bias('ASSIST') + noise()]);
  }
  if (eligible) scores.push(['ANCHOR', 25 + 45 + noise()]);

  let goal: Goal = scores.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  let refused = false;
  if (requested && requested !== 'STAY_SAFE' && isDangerous(s)) {
    goal = 'STABILISE';
    refused = true;
  }

  let text = '';
  if (goal === 'SEEK') {
    const to = stepToward(s.nodes, s.partner.nodeId, s.player.nodeId);
    s.partner.nodeId = to;
    s.nodes[to].visitState = 'VISITED';
    text = `Partner follows the strongest trace toward you (now at ${to}).`;
    voice(s, out, 'find', VOICE_LINES.find, 8);
  } else if (goal === 'ASSIST' && assistT) {
    const credit = pendingEchoes(s).find(c => c.kind === assistT.echoKind);
    const occ = s.occurrences[assistT.id] ?? 0;
    const roll = defaultOutcomeFor(s.seed, s.partner.nodeId, assistT, partnerNode.world, occ);
    const selected = credit ? assistT.selfPreferredOutcome : roll;
    if (credit) credit.consumed = true;
    else s.bondStrain = clamp100(s.bondStrain + ASSIST_STRAIN);
    const rec = applyEvent(s, 'partner', assistT.id, 'LET_GO', selected, {
      reason: credit
        ? `Partner reached for the ${assistT.label} and spent your ${credit.kind} echo to take the better outcome.`
        : `Partner reached for the ${assistT.label}; chance decided.`,
      paid: credit ? `Your echo ${credit.id} was spent. Partner paid nothing.` : `Partner paid ${ASSIST_STRAIN} strain on the Thread.`,
      echoId: credit?.id,
    });
    text = `Partner works the ${assistT.label}: ${deltaText(rec.effects)}${credit ? ' (echo spent)' : ''}.`;
    voice(s, out, 'help', VOICE_LINES.help, 8);
  } else if (goal === 'ANCHOR' && eligible) {
    s.anchors.find(a => a.id === eligible)!.partnerReady = true;
    text = `Partner reaches the ${eligible} and holds it open for you.`;
    voice(s, out, 'anchor', VOICE_LINES.anchor, 4);
  } else {
    goal = 'STABILISE';
    s.bondStrain = clamp100(s.bondStrain - 4);
    text = refused
      ? 'Partner refuses: too dangerous. They steady the Thread instead (strain -4).'
      : assistT === null && Object.keys(s.nodes).length >= PARTNER_EVENT_NODE_CAP
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
