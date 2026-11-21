import type {
  ActorState, AnchorId, Choice, Command, DomainEvent, Intention, SimulationState, Stats, V2State,
} from './types';
import { OBJECT_TILES, PLAYER_START_TILE, TILE, canWalk, getNearbyInteractables } from '../world/topology';
import { TUNING, PREP } from './tuning';
import { TEMPLATES, TEMPLATE_BY_ID, adaptOutcome, defaultOutcomeFor, deltaText, opposite, previewFork } from './events';
import { isValidRetrace } from './branches';
import { ANCHOR_ORDER, checkAnchor } from './anchors';
import { partnerTurn } from './agent';
import {
  ECHO_QUEUE_CAP, addLog, addStep, applyEvent, clamp100, pendingEchoes, recompute, voice,
} from './core';
import { echoId } from './rng';
import { ALIEN_TEXT, FADE_TEXT, HINTS, INTRO, STONES_TEXT, TERMINAL_TEXT, TOO_FAR, VOICE_LINES, WARNINGS } from '../content/dialogue';
import { planWin } from './plan';

export { TEMPLATES, previewFork };

export const DEFAULT_SEED = 48219;
export const SAVE_VERSION = 1;
const RETRACE_COST = 4;
const FORK_OBJECTS = new Set(TEMPLATES.map(t => t.triggerObjectId));
export const FADE_AT = 100;

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
    v2: {
      tick: 0, journey: [], coherenceDebt: 0, warningsIssued: 0, playerIdentity: 'amber', examined: [],
      realm: 'TOWN', ending: null, gridX: PLAYER_START_TILE.tx, gridY: PLAYER_START_TILE.ty,
    },
  };
  s.player.x = PLAYER_START_TILE.tx * TILE + TILE / 2; s.player.y = PLAYER_START_TILE.ty * TILE + TILE / 2;
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
      const v = s.v2 as V2State | undefined;
      if (!v || typeof v.tick !== 'number' || !Array.isArray(v.journey) || !Array.isArray(v.examined)) return null;
      if (typeof v.coherenceDebt !== 'number' || typeof v.warningsIssued !== 'number') return null;
      if (v.realm !== 'TOWN' && v.realm !== 'ALIEN') return null;
      if (v.playerIdentity !== 'amber' && v.playerIdentity !== 'cyan') return null;
      if (!Number.isInteger(v.gridX) || !Number.isInteger(v.gridY)) return null;
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
  if (cmd.type === 'SET_IDENTITY') {
    if (cmd.identity !== 'amber' && cmd.identity !== 'cyan') return reject(out, 'CHOOSE AMBER OR CYAN');
    s.v2.playerIdentity = cmd.identity;
    return true;
  }
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE') return reject(out, HINTS.DONE);
  if (cmd.type === 'MOVE') return doMove(s, cmd.tx, cmd.ty, out);
  if (cmd.type === 'INTERACT') return doInteract(s, cmd.objectId, cmd.choice, out);

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
      s.bondStrain = clamp100(s.bondStrain - TUNING.REST_STRAIN);
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
      addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: cmd.targetNodeId, action: 'RETRACE', cause: 'You walked your own path back.', effect: 'History is kept.' });
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
  const ok = performFork(s, s.pendingFork.templateId, choice, out);
  if (ok) { s.pendingFork = null; s.phase = 'EXPLORING'; }
  return ok;
}

const VERB: Record<Choice, string> = { SELF: 'keep it', ECHO: 'send it across', LET_GO: 'let it be' };

/** Shared by RESOLVE_FORK (legacy) and INTERACT (V2). Does not touch phase/pendingFork. */
function performFork(s: SimulationState, templateId: string, choice: Choice, out: DomainEvent[]): boolean {
  if (choice === 'ECHO' && pendingEchoes(s).length >= ECHO_QUEUE_CAP) return reject(out, HINTS.ECHO_FULL);
  const t = TEMPLATE_BY_ID[templateId];
  const parent = s.nodes[s.player.nodeId];
  const occ = s.occurrences[t.id] ?? 0;
  const prepObj = PREP[t.id];
  const prepared = !!prepObj && s.v2.examined.includes(prepObj);
  const defaultOut = defaultOutcomeFor(s.seed, parent.id, t, parent.world, occ, prepared);
  const selected = choice === 'SELF' ? t.selfPreferredOutcome : choice === 'ECHO' ? opposite(t.selfPreferredOutcome) : defaultOut;

  s.turn++;
  let credit: ReturnType<typeof makeCredit> | undefined;
  let reason: string;
  let paid: string;
  const fav = t.selfPreferredOutcome;
  if (choice === 'SELF') {
    s.bondStrain = clamp100(s.bondStrain + TUNING.SELF_STRAIN);
    const drag = TUNING.SELF_DRAG[t.id];
    if (drag) {
      const d = { ...(s.v2.partnerDrag ?? {}) } as Record<string, number>;
      for (const k of Object.keys(drag)) d[k] = (d[k] ?? 0) + drag[k];
      s.v2.partnerDrag = d;
      out.push({ type: 'PARTNER_TRACE', objectId: t.triggerObjectId, text: `You kept the ${t.label.replace('The ', '').toLowerCase()} for yourself. Far away, something of theirs dims.` });
    }
    reason = `You kept the ${t.label} for yourself (${fav}).${drag ? ' What you took, your partner will miss.' : ''}`;
    paid = drag
      ? `You paid ${TUNING.SELF_STRAIN} strain; your partner's next step will be poorer for it.`
      : `You paid ${TUNING.SELF_STRAIN} strain. No echo was given.`;
  } else if (choice === 'ECHO') {
    s.bondStrain = clamp100(s.bondStrain + TUNING.ECHO_STRAIN);
    credit = makeCredit(s, t.echoKind);
    s.echoCredits.push(credit);
    reason = `You sent the ${t.label} across, taking the worse outcome (${selected}) so your partner can borrow its ${t.echoKind}.`;
    paid = `You paid ${TUNING.ECHO_STRAIN} strain and kept the worse world; partner gains one ${t.echoKind} echo.`;
  } else {
    reason = prepared
      ? `You let the ${t.label} be, having looked at the ${prepObj} first. The roll gave outcome ${selected}.`
      : `You let the ${t.label} be. The seeded roll gave outcome ${selected}.`;
    paid = 'Nothing was paid. Chance decided.';
  }
  const rec = applyEvent(s, 'player', t.id, choice, selected, { reason, paid, echoId: credit?.id });
  out.push({ type: 'FORK_RESOLVED', record: rec });
  const text = adaptOutcome(t, selected, parent.world).text;
  addLog(s, `${text} [${deltaText(rec.effects)}]`, 'event');
  addLog(s, paid, 'event');
  out.push({ type: 'WORLD_CHANGED', objectId: t.triggerObjectId, text });
  if (choice === 'ECHO') voice(s, out, 'echo_received', VOICE_LINES.echo_received, 4);
  recompute(s);
  partnerTurn(s, out);
  finishTurn(s, out);
  rec.driftAfter = s.realityDrift;
  rec.strainAfter = s.bondStrain;
  return true;
}

// ---------- V2: grid movement, proximity-validated interaction, coherence ----------
function startPlay(s: SimulationState, out: DomainEvent[]): void {
  if (s.phase === 'BOOT') { s.phase = 'EXPLORING'; voice(s, out, 'boot', VOICE_LINES.boot, Infinity); }
}

function doMove(s: SimulationState, tx: number, ty: number, out: DomainEvent[]): boolean {
  if (s.phase === 'FORK' || s.phase === 'ARCHIVE') return reject(out, 'FINISH WHAT YOU ARE DOING FIRST');
  const v = s.v2;
  const node = s.nodes[s.player.nodeId];
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || !canWalk(node.world, node.flags, { tx: v.gridX, ty: v.gridY }, { tx, ty }, v.realm)) {
    return reject(out, 'THE WAY IS BLOCKED. LOOK FOR A BRIDGE, A FORD OR A DRIER PATH');
  }
  startPlay(s, out);
  v.gridX = tx; v.gridY = ty;
  s.player.x = tx * TILE + TILE / 2; s.player.y = ty * TILE + TILE / 2;
  tickV2(s, out, true);
  return true;
}

function doInteract(s: SimulationState, obj: string, choice: Choice | undefined, out: DomainEvent[]): boolean {
  const v = s.v2;
  if (s.phase === 'FORK' || s.phase === 'ARCHIVE') return reject(out, 'FINISH WHAT YOU ARE DOING FIRST');
  if (!OBJECT_TILES[obj]) return reject(out, 'NOTHING HERE RESPONDS');
  const node = s.nodes[s.player.nodeId];
  if (!getNearbyInteractables(node.world, node.flags, { tx: v.gridX, ty: v.gridY }, v.realm).includes(obj)) return reject(out, TOO_FAR);
  const c: Choice = choice ?? 'LET_GO';
  if (c !== 'LET_GO' && c !== 'SELF' && c !== 'ECHO') return reject(out, 'CHOOSE KEEP IT, SEND IT ACROSS OR LET IT BE');
  const stonesSeen = v.examined.includes('stones');
  let fork = false;

  if (obj === 'radio' && v.realm === 'TOWN' && stonesSeen && node.world.light === 0 && node.world.signal <= 0) {
    startPlay(s, out);
    v.realm = 'ALIEN';
    out.push({ type: 'REALM', realm: 'ALIEN' });
    out.push({ type: 'WORLD_CHANGED', objectId: obj, text: ALIEN_TEXT });
    addLog(s, ALIEN_TEXT, 'system');
  } else if (FORK_OBJECTS.has(obj)) {
    const t = TEMPLATES.find(x => x.triggerObjectId === obj)!;
    if (c === 'ECHO' && pendingEchoes(s).length >= ECHO_QUEUE_CAP) return reject(out, HINTS.ECHO_FULL);
    startPlay(s, out);
    if (!v.examined.includes(obj)) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: INTRO[obj] });
    fork = performFork(s, t.id, c, out);
  } else if (obj.startsWith('anchor_')) {
    startPlay(s, out);
    if (!v.examined.includes(obj)) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: INTRO[obj] });
    if (!activateAnchor(s, obj.slice(7) as AnchorId, 'player', out)) { markExamined(s, obj); return false; }
  } else if (obj === 'thread_terminal') {
    startPlay(s, out);
    if (!v.examined.includes(obj)) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: INTRO[obj] });
    const before = s.bondStrain;
    s.bondStrain = clamp100(s.bondStrain - TUNING.REST_STRAIN);
    v.coherenceDebt = Math.max(0, v.coherenceDebt - TUNING.TERMINAL_RELIEF);
    addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: s.player.nodeId, action: 'STABILISE', cause: 'You rested at the terminal.', effect: `Strain ${before} -> ${s.bondStrain}.` });
    if (s.bondStrain < before) out.push({ type: 'STRAIN_RECOVERED' });
    out.push({ type: 'WORLD_CHANGED', objectId: obj, text: TERMINAL_TEXT });
    addLog(s, `You rest at the thread terminal (strain ${before} -> ${s.bondStrain}).`, 'system');
    recompute(s);
  } else if (obj === 'stones') {
    startPlay(s, out);
    if (!v.examined.includes(obj)) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: INTRO[obj] });
    v.coherenceDebt = Math.max(0, v.coherenceDebt - TUNING.STONES_RELIEF);
    v.calm = Math.min(TUNING.CALM_MAX, (v.calm ?? 0) + TUNING.STONES_CALM);
    recompute(s);
    addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: s.player.nodeId, action: 'STABILISE', cause: 'You touched the old echo stones.', effect: 'The thread loosens.' });
    out.push({ type: 'WORLD_CHANGED', objectId: obj, text: STONES_TEXT });
    if (v.realm === 'ALIEN') {
      v.realm = 'TOWN';
      out.push({ type: 'REALM', realm: 'TOWN' });
    }
  } else {
    return reject(out, 'NOTHING HERE RESPONDS');
  }
  markExamined(s, obj);
  tickV2(s, out, !fork); // a fork already ran its own partner turn
  return true;
}

function markExamined(s: SimulationState, obj: string): void {
  if (!s.v2.examined.includes(obj)) s.v2.examined.push(obj);
}

/** One world tick: partner cadence, coherence debt, FADE. Called after every accepted MOVE/INTERACT. */
function tickV2(s: SimulationState, out: DomainEvent[], cadence: boolean): void {
  const v = s.v2;
  v.tick++;
  if (v.calm && v.tick % TUNING.CALM_DECAY_EVERY === 0) v.calm = Math.max(0, v.calm - 1);
  if (cadence && v.tick % TUNING.PARTNER_PERIOD === 0 && !s.won) {
    s.turn++;
    partnerTurn(s, out);
    finishTurn(s, out);
  }
  recompute(s);
  if (s.won) return;
  const critical = s.realityDrift >= 80 || s.bondStrain >= 85;
  v.coherenceDebt = critical ? v.coherenceDebt + TUNING.COHERENCE_RISE : Math.max(0, v.coherenceDebt - TUNING.COHERENCE_DECAY);
  // fairness: at most one warning level per tick, and debt cannot pass the next unissued warning in one go.
  if (v.warningsIssued < 3) v.coherenceDebt = Math.min(v.coherenceDebt, TUNING.WARN_AT[v.warningsIssued]);
  v.coherenceDebt = Math.min(100, v.coherenceDebt);
  const level = TUNING.WARN_AT.filter(t => v.coherenceDebt >= t).length;
  if (level > v.warningsIssued) {
    v.warningsIssued++;
    const lv = v.warningsIssued as 1 | 2 | 3;
    out.push({ type: 'WARNING', level: lv, text: WARNINGS[lv] });
    addLog(s, WARNINGS[lv], 'hint');
  } else if (level < v.warningsIssued) v.warningsIssued = level;
  if (v.coherenceDebt >= FADE_AT) {
    s.phase = 'FADE'; v.ending = 'FADE';
    addLog(s, FADE_TEXT, 'system');
    out.push({ type: 'FADE' });
  }
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
  addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: s.player.nodeId, action: 'ANCHOR', cause: `Both worlds met the ${id}.`, effect: 'The anchor holds.' });
  out.push({ type: 'ANCHOR_ALIGNED', anchorId: id });
  addLog(s, `The ${id} aligns in both worlds.`, 'system');
  if (id === 'LIGHTHOUSE') {
    const from = s.partner.nodeId;
    s.partner.nodeId = s.player.nodeId; s.nodes[s.player.nodeId].visitState = 'VISITED';
    addStep(s, { actor: 'partner', fromNodeId: from, toNodeId: s.player.nodeId, action: 'REUNION', cause: 'All three anchors held.', effect: 'Two lineages converge.' });
    s.won = true; s.phase = 'ENDING'; s.partner.stable = true; s.v2.ending = 'WIN';
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
  return planWin(createInitialState(DEFAULT_SEED));
}
export { planWin };

export type { Intention };
