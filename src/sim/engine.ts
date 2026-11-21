import type {
  ActorState, AnchorId, Choice, Command, DomainEvent, Intention, SimulationState, Stats,
} from './types';
import { TEMPLATES, TEMPLATE_BY_ID, adaptOutcome, defaultOutcomeFor, deltaText, opposite, previewFork } from './events';
import { isValidRetrace } from './branches';
import { ANCHOR_ORDER, checkAnchor } from './anchors';
import { partnerTurn } from './agent';
import {
  ECHO_QUEUE_CAP, REST_RECOVERY, addLog, applyEvent, clamp100, pendingEchoes, recompute, voice,
} from './core';
import { echoId } from './rng';
import { HINTS, VOICE_LINES } from '../content/dialogue';
import { planWin } from './planner';

export { TEMPLATES, previewFork };

export const DEFAULT_SEED = 48219;
export const SAVE_VERSION = 1;
export const TUTORIAL_ORDER = ['lantern', 'greenhouse', 'radio'];
const RETRACE_COST = 4;

export function createInitialState(seed: number): SimulationState {
  const world: Stats = { light: 1, water: 1, structure: 1, signal: 1, growth: 1, instability: 0 };
  const actor = (id: 'player' | 'partner', x: number): ActorState => ({ id, nodeId: 'root', x, y: 96, stable: true });
  const s: SimulationState = {
    version: 1, seed, turn: 0,
    nodes: {
      root: {
        id: 'root', parentId: null, depth: 0, eventInstanceId: null, outcomeId: null, world, flags: [],
        visitState: 'VISITED', children: [], owner: 'player',
      },
    },
    events: [], player: actor('player', 64), partner: actor('partner', 256),
    bondStrain: 0, realityDrift: 0, echoCredits: [],
    anchors: ANCHOR_ORDER.map(id => ({ id, playerReady: false, partnerReady: false, aligned: false })),
    intention: 'FIND_ME', phase: 'BOOT', seenDialogueIds: [], log: [], occurrences: {},
    freeRetraceAvailable: false, pendingFork: null, retraceCount: 0, won: false,
  };
  addLog(s, 'Two worlds, one thread. Find each other.', 'system');
  recompute(s);
  return s;
}

type Listener = (s: Readonly<SimulationState>, ev: DomainEvent[]) => void;

export class SimEngine {
  private state: SimulationState;
  private listeners = new Set<Listener>();

  constructor(seed: number = DEFAULT_SEED, saved?: SimulationState) {
    this.state = saved ? clone(saved) : createInitialState(seed);
  }

  getState(): Readonly<SimulationState> { return this.state; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  static serialize(s: SimulationState | Readonly<SimulationState>): string { return JSON.stringify(s); }

  static restore(json: string): SimulationState | null {
    try {
      const s = JSON.parse(json) as SimulationState;
      if (!s || s.version !== SAVE_VERSION || typeof s.seed !== 'number' || typeof s.turn !== 'number') return null;
      if (!s.nodes || !s.nodes.root || !s.nodes[s.player?.nodeId] || !s.nodes[s.partner?.nodeId]) return null;
      if (!Array.isArray(s.events) || !Array.isArray(s.anchors) || s.anchors.length !== 3) return null;
      if (!Array.isArray(s.echoCredits) || !Array.isArray(s.log) || !Array.isArray(s.seenDialogueIds)) return null;
      if (typeof s.bondStrain !== 'number' || typeof s.realityDrift !== 'number' || !s.occurrences) return null;
      for (const n of Object.values(s.nodes)) {
        if (n.parentId !== null && !s.nodes[n.parentId]) return null;
      }
      return s;
    } catch { return null; }
  }

  dispatch(cmd: Command): DomainEvent[] {
    const next = clone(this.state);
    const out: DomainEvent[] = [];
    const ok = reduce(next, cmd, out);
    if (!ok) {
      const rej = out.find(e => e.type === 'REJECTED');
      if (rej && rej.type === 'REJECTED') addLog(next, rej.reason, 'hint');
    }
    this.state = next;
    if (cmd.type !== 'SET_POSITION') for (const l of [...this.listeners]) l(this.state, out);
    return out;
  }
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function reject(out: DomainEvent[], reason: string): false {
  out.push({ type: 'REJECTED', reason });
  return false;
}

function tutorialTemplate(s: SimulationState): string | null {
  const n = s.events.filter(e => e.actorId === 'player').length;
  return n < TUTORIAL_ORDER.length ? TUTORIAL_ORDER[n] : null;
}

function reduce(s: SimulationState, cmd: Command, out: DomainEvent[]): boolean {
  if (cmd.type === 'RESTART') {
    Object.assign(s, createInitialState(cmd.seed));
    return true;
  }
  if (cmd.type === 'SET_POSITION') {
    if (Number.isFinite(cmd.x) && Number.isFinite(cmd.y)) { s.player.x = cmd.x; s.player.y = cmd.y; }
    return true;
  }
  if (cmd.type === 'MARK_SEEN') {
    if (!s.seenDialogueIds.includes(cmd.dialogueId)) s.seenDialogueIds.push(cmd.dialogueId);
    return true;
  }
  if (s.won || s.phase === 'ENDING') return reject(out, HINTS.DONE);

  switch (cmd.type) {
    case 'SET_PHASE': {
      if (cmd.phase === 'ENDING') return reject(out, 'THE ENDING ONLY COMES FROM THE LIGHTHOUSE');
      if (cmd.phase === 'FORK' && !s.pendingFork) return reject(out, 'WALK TO AN OBJECT AND INTERACT TO OPEN A FORK');
      if (s.phase === 'FORK' && cmd.phase !== 'FORK') s.pendingFork = null;
      if (s.phase === 'BOOT' && cmd.phase === 'EXPLORING') voice(s, out, 'boot', VOICE_LINES.boot, Infinity);
      s.phase = cmd.phase;
      return true;
    }
    case 'BEGIN_FORK': {
      const t = TEMPLATE_BY_ID[cmd.templateId];
      if (!t) return reject(out, 'NOTHING HERE RESPONDS');
      if (s.phase === 'ARCHIVE') return reject(out, 'CLOSE THE ARCHIVE FIRST');
      const need = tutorialTemplate(s);
      if (need && need !== t.id) return reject(out, HINTS.TUTORIAL(need));
      s.pendingFork = { eventInstanceId: 'E' + String(s.events.length + 1).padStart(4, '0'), templateId: t.id };
      s.phase = 'FORK';
      return true;
    }
    case 'CANCEL_FORK': {
      s.pendingFork = null;
      if (s.phase === 'FORK') s.phase = 'EXPLORING';
      return true;
    }
    case 'RESOLVE_FORK': return resolveFork(s, cmd.eventInstanceId, cmd.choice, out);
    case 'REQUEST_PARTNER': {
      if (s.phase === 'FORK') return reject(out, 'FINISH THE FORK FIRST');
      s.intention = cmd.intention;
      s.turn++;
      addLog(s, `You ask your partner: ${cmd.intention.replace(/_/g, ' ')}.`, 'system');
      partnerTurn(s, out, cmd.intention);
      finishTurn(s, out);
      return true;
    }
    case 'ADVANCE_PARTNER': {
      if (s.phase === 'FORK') return reject(out, 'FINISH THE FORK FIRST');
      s.turn++;
      partnerTurn(s, out);
      finishTurn(s, out);
      return true;
    }
    case 'REST_AT_TERMINAL': {
      if (s.phase === 'FORK') return reject(out, 'FINISH THE FORK FIRST');
      s.turn++;
      const before = s.bondStrain;
      s.bondStrain = clamp100(s.bondStrain - REST_RECOVERY);
      addLog(s, `You rest at the thread terminal (strain ${before} -> ${s.bondStrain}).`, 'system');
      if (s.bondStrain < before) out.push({ type: 'STRAIN_RECOVERED' });
      recompute(s);
      partnerTurn(s, out);
      finishTurn(s, out);
      return true;
    }
    case 'RETRACE': {
      if (s.phase === 'FORK') return reject(out, 'FINISH THE FORK FIRST');
      if (!isValidRetrace(s.nodes, s.player.nodeId, cmd.targetNodeId)) {
        return reject(out, 'YOU CAN ONLY RETRACE TO AN ANCESTOR OR AN UNCHOSEN BRANCH ON YOUR OWN PATH');
      }
      s.turn++;
      s.player.nodeId = cmd.targetNodeId;
      s.nodes[cmd.targetNodeId].visitState = 'VISITED';
      s.retraceCount++;
      if (s.freeRetraceAvailable) {
        s.freeRetraceAvailable = false;
        addLog(s, `You retrace to ${cmd.targetNodeId}. The first anchor made it free.`, 'system');
      } else {
        s.bondStrain = clamp100(s.bondStrain + RETRACE_COST);
        addLog(s, `You retrace to ${cmd.targetNodeId} (strain +${RETRACE_COST}). History is kept.`, 'system');
      }
      recompute(s);
      out.push({ type: 'RETRACED', nodeId: cmd.targetNodeId });
      partnerTurn(s, out);
      finishTurn(s, out);
      return true;
    }
    case 'ACTIVATE_ANCHOR': return activateAnchor(s, cmd.anchorId, cmd.actor, out);
  }
  return reject(out, 'UNKNOWN COMMAND');
}

function finishTurn(s: SimulationState, out: DomainEvent[]): void {
  recompute(s);
  if (s.realityDrift >= 60) voice(s, out, 'divergence', VOICE_LINES.divergence, 12);
  if (s.bondStrain >= 70) voice(s, out, 'overstrain', VOICE_LINES.overstrain, 10);
}

function resolveFork(s: SimulationState, evId: string, choice: Choice, out: DomainEvent[]): boolean {
  if (s.phase !== 'FORK' || !s.pendingFork) return reject(out, 'NO FORK IS OPEN: INTERACT WITH AN OBJECT FIRST');
  if (s.pendingFork.eventInstanceId !== evId) return reject(out, 'THAT FORK IS STALE: INTERACT WITH THE OBJECT AGAIN');
  if (choice !== 'LET_GO' && choice !== 'SELF' && choice !== 'ECHO') return reject(out, 'CHOOSE LET GO, SELF OR ECHO');
  if (choice === 'ECHO' && pendingEchoes(s).length >= ECHO_QUEUE_CAP) return reject(out, HINTS.ECHO_FULL);

  const t = TEMPLATE_BY_ID[s.pendingFork.templateId];
  const parent = s.nodes[s.player.nodeId];
  const occ = s.occurrences[t.id] ?? 0;
  const defaultOut = defaultOutcomeFor(s.seed, parent.id, t, parent.world, occ);
  const selected = choice === 'SELF' ? t.selfPreferredOutcome : choice === 'ECHO' ? opposite(t.selfPreferredOutcome) : defaultOut;

  s.turn++;
  let credit: ReturnType<typeof makeCredit> | undefined;
  let reason: string;
  let paid: string;
  const fav = t.selfPreferredOutcome;
  if (choice === 'SELF') {
    s.bondStrain = clamp100(s.bondStrain + 2);
    reason = `You pushed the ${t.label} toward the better outcome (${fav}). Your partner's world was not touched.`;
    paid = 'You paid 2 strain on the Thread. No echo was given.';
  } else if (choice === 'ECHO') {
    s.bondStrain = clamp100(s.bondStrain + 12);
    credit = makeCredit(s, t.echoKind);
    s.echoCredits.push(credit);
    reason = `You accepted the worse outcome (${selected}) of the ${t.label} so your partner can borrow its ${t.echoKind}.`;
    paid = `You paid 12 strain and kept the worse world; partner gains one ${t.echoKind} echo.`;
  } else {
    reason = `You let the ${t.label} resolve. The seeded roll gave outcome ${selected}.`;
    paid = 'Nothing was paid. Chance decided.';
  }
  const rec = applyEvent(s, 'player', t.id, choice, selected, { reason, paid, echoId: credit?.id });
  s.pendingFork = null;
  s.phase = 'EXPLORING';
  out.push({ type: 'FORK_RESOLVED', record: rec });
  addLog(s, `${adaptOutcome(t, selected, parent.world).text} [${deltaText(rec.effects)}]`, 'event');
  addLog(s, paid, 'event');
  if (choice === 'ECHO') voice(s, out, 'echo_received', VOICE_LINES.echo_received, 4);
  recompute(s);
  partnerTurn(s, out);
  finishTurn(s, out);
  rec.driftAfter = s.realityDrift;
  rec.strainAfter = s.bondStrain;
  return true;
}

function makeCredit(s: SimulationState, kind: 'signal' | 'structure' | 'water' | 'growth') {
  return {
    id: echoId(s.echoCredits.length + 1), from: 'player' as const, to: 'partner' as const, kind,
    strength: 1 as const, createdTurn: s.turn, consumed: false,
  };
}

function activateAnchor(s: SimulationState, id: AnchorId, actor: 'player' | 'partner', out: DomainEvent[]): boolean {
  if (s.phase === 'FORK') return reject(out, 'FINISH THE FORK FIRST');
  if (actor !== 'player') return reject(out, 'YOUR PARTNER ACTS ON THEIR OWN: REST OR ASK THEM TO FIND YOU');
  const a = s.anchors.find(x => x.id === id);
  if (!a) return reject(out, 'NO SUCH ANCHOR');
  recompute(s);
  const chk = checkAnchor(s, id);
  if (!chk.ok) return reject(out, chk.hint);
  a.aligned = true; a.playerReady = true; a.partnerReady = true;
  if (s.anchors.filter(x => x.aligned).length === 1) {
    s.freeRetraceAvailable = true;
    addLog(s, 'The first anchor holds. Your next retrace is free.', 'system');
  }
  recompute(s);
  out.push({ type: 'ANCHOR_ALIGNED', anchorId: id });
  addLog(s, `The ${id} aligns in both worlds.`, 'system');
  if (id === 'LIGHTHOUSE') {
    s.won = true; s.phase = 'ENDING'; s.partner.stable = true;
    voice(s, out, 'final', VOICE_LINES.final, Infinity);
    addLog(s, 'There you are.', 'partner');
    out.push({ type: 'WIN' });
  } else {
    voice(s, out, 'anchor', VOICE_LINES.anchor, 4);
  }
  return true;
}

/** Deterministic scripted winning path from the demo seed (ECHO at the lantern first, as in the spec demo). */
export function cheapestWinPath(): Command[] {
  return planWin(new SimEngine(DEFAULT_SEED), { echoFirst: true });
}

export type { Intention };
