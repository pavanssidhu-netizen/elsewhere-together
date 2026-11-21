// Shared mutation helpers used by engine.ts, forks.ts and partner.ts. All functions mutate the (already cloned) state.
import type {
  ActorHistory, ActorId, ActorState, AnchorState, DomainEvent, JourneyStep, LogEntry, SimulationState, Site, VoiceCue,
} from './types';
import { TUNING } from './tuning';
import { lineageDistance } from './branches';
import { WARNINGS, FADE_TEXT } from '../content/dialogue';

export const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

export const actorOf = (s: SimulationState, who: ActorId): ActorState => (who === 'player' ? s.player : s.partner);
export const nodeOf = (s: SimulationState, who: ActorId) => s.nodes[actorOf(s, who).nodeId];
export const hasFlag = (s: SimulationState, who: ActorId, f: string) => nodeOf(s, who).flags.includes(f);
export const routeOpen = (s: SimulationState, who: ActorId) => {
  const n = nodeOf(s, who);
  return !n.flags.includes('BRIDGE_CLOSED') || n.world.water <= 1;
};
export const coastOpen = (s: SimulationState, who: ActorId) => {
  const n = nodeOf(s, who);
  return n.flags.includes('COAST_OPEN') && n.world.water <= 2;
};
export const anchorOf = (s: SimulationState, id: string): AnchorState => s.anchors.find(a => a.id === id)!;

export function addLog(s: SimulationState, text: string, kind: LogEntry['kind'], uncertain?: boolean): void {
  const e: LogEntry = { turn: s.turn, text, kind };
  if (uncertain) e.uncertain = true;
  s.log.push(e);
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

export function addStep(s: SimulationState, step: Omit<JourneyStep, 'seq' | 'tick'>): void {
  s.v2.journey.push({ seq: s.v2.journey.length + 1, tick: s.v2.tick, ...step });
}

export function addHistory(s: SimulationState, who: ActorId, site: Site, action: string, outcome?: string, evidence?: string): void {
  const h: ActorHistory = { turn: s.turn, actor: who, nodeId: actorOf(s, who).nodeId, site, action };
  if (outcome) h.outcome = outcome;
  if (evidence) h.evidence = evidence;
  s.history.push(h);
}

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
  addLog(s, text, 'partner');
}

// ---- hidden numbers ----
const KEY_FACTS: Array<(s: SimulationState, w: ActorId) => boolean> = [
  (s, w) => hasFlag(s, w, 'LANTERN_LIT'),
  (s, w) => routeOpen(s, w),
  (s, w) => coastOpen(s, w),
  (s, w) => hasFlag(s, w, 'GARDEN_GROWN'),
  (s, w) => hasFlag(s, w, 'BEACON_LIT'),
];

/** Drift = incompatibility of the two histories and world states. */
export function calculateDrift(s: SimulationState): number {
  const lin = TUNING.DRIFT_LINEAGE * Math.min(TUNING.DRIFT_LINEAGE_CAP, lineageDistance(s.nodes, s.player.nodeId, s.partner.nodeId));
  const mismatch = KEY_FACTS.filter(f => f(s, 'player') !== f(s, 'partner')).length * TUNING.DRIFT_MISMATCH;
  const water = Math.abs(nodeOf(s, 'player').world.water - nodeOf(s, 'partner').world.water) * TUNING.DRIFT_WATER;
  const aligned = s.anchors.filter(a => a.aligned).length * TUNING.DRIFT_ANCHOR;
  const fire = hasFlag(s, 'player', 'FIRE_SPREAD') ? TUNING.FIRE_DRIFT + (hasFlag(s, 'player', 'PROPAGATED') ? TUNING.PROPAGATE_DRIFT : 0) : 0;
  return clamp100(lin + mismatch + water + fire - aligned - (s.v2.calm ?? 0));
}

/**
 * The single shared objective: the clearing beacon in both worlds. Three conditions per side (amber = player, cyan = partner):
 *  player: [flame lit, radio contact, a technique understood by the partner]
 *  partner: [its flame lit, found its way across, back at its clearing beacon]
 * Stored on the existing anchors (LANTERN = flame, GREENHOUSE = connection/route, LIGHTHOUSE = coordination); sticky once earned.
 */
export function beaconProgress(s: Readonly<SimulationState>): { player: [boolean, boolean, boolean]; partner: [boolean, boolean, boolean] } {
  const ss = s as SimulationState;
  return {
    player: [hasFlag(ss, 'player', 'LANTERN_LIT'), !!s.v2.contact, !!s.partner.heard],
    partner: [hasFlag(ss, 'partner', 'LANTERN_LIT'), !!s.partner.crossed, !!s.partner.crossed && s.partner.site === 'CLEARING' && hasFlag(ss, 'partner', 'LANTERN_LIT')],
  };
}

export function refreshAnchors(s: SimulationState): void {
  const b = beaconProgress(s);
  s.anchors.forEach((a, i) => {
    if (i < 2) { a.playerReady ||= b.player[i]; a.partnerReady ||= b.partner[i]; }
    else { a.playerReady = b.player[2]; a.partnerReady = b.partner[2]; } // coordination is live: partner must be at its beacon now
    a.playerPhysical = a.playerReady; a.partnerPhysical = a.partnerReady;
    a.aligned = a.aligned || (a.playerReady && a.partnerReady && i < 2) || (i === 2 && a.playerReady && a.partnerReady);
    a.coordinated = a.aligned;
  });
}

export function recompute(s: SimulationState): void {
  s.bondStrain = clamp100(s.bondStrain);
  s.partner.stable = s.bondStrain < TUNING.PARTNER_REFUSE_STRAIN;
  refreshAnchors(s);
  s.realityDrift = calculateDrift(s);
}

export const inDanger = (s: SimulationState): boolean =>
  s.realityDrift >= TUNING.FRAY_DRIFT || s.bondStrain >= TUNING.FRAY_STRAIN
  || (s.realityDrift >= TUNING.COMBO_DRIFT && s.bondStrain >= TUNING.COMBO_STRAIN); // V5: idleness alone never frays the Thread

/** Safe sites the player could rest at (physical state only). */
export function safeSites(s: SimulationState): string[] {
  const out = ['anchor_LANTERN', 'anchor_GREENHOUSE', 'stones', 'thread_terminal'];
  if (hasFlag(s, 'player', 'GARDEN_GROWN')) out.push('greenhouse');
  return out;
}

/**
 * Fade state machine CONNECTED -> FRAYING -> LAST_SIGNAL -> FADED.
 * `kind`: 'action' for a meaningful action (effective forks, calls), 'tick' for any elapsed tick.
 * `recovery`: this action was the recovery action (does not count as ignoring).
 */
export function evalLink(s: SimulationState, out: DomainEvent[], kind: 'action' | 'tick', recovery = false): void {
  const v = s.v2;
  if (s.link === 'FADED' || s.won) return;
  recompute(s);
  const danger = inDanger(s);
  if (!danger) {
    if (s.link !== 'CONNECTED') {
      s.link = 'CONNECTED'; v.warningsIssued = 0;
      addLog(s, 'The Thread steadies. Their voice comes back.', 'system');
    }
    v.dangerActions = 0; v.dangerTicks = 0;
    return;
  }
  const warn = (lv: 1 | 2 | 3) => { v.warningsIssued = lv; out.push({ type: 'WARNING', level: lv, text: WARNINGS[lv] }); addLog(s, WARNINGS[lv], 'hint'); };
  if (s.link === 'CONNECTED') { s.link = 'FRAYING'; v.dangerActions = 0; v.dangerTicks = 0; warn(1); return; }
  if (kind === 'action' && !recovery) v.dangerActions++;
  if (kind === 'tick') v.dangerTicks++;
  const escalate = v.dangerActions >= TUNING.DANGER_ACTIONS || v.dangerTicks >= TUNING.DANGER_TICKS;
  if (!escalate) return;
  v.dangerActions = 0; v.dangerTicks = 0;
  if (s.link === 'FRAYING') { s.link = 'LAST_SIGNAL'; warn(2); return; }
  if (s.link === 'LAST_SIGNAL') {
    s.link = 'FADED'; warn(3);
    s.phase = 'FADE'; v.ending = 'FADE';
    addLog(s, FADE_TEXT, 'system');
    out.push({ type: 'FADE' });
  }
}
