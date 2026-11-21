import type {
  ActorState, AnchorId, AnchorKind, Choice, Command, DomainEvent, Intention, PhysicalAction, SimulationState, Site, Stats, ThreadMessage, V2State,
} from './types';
import {
  OBJECT_SITE, OBJECT_TILES, PLAYER_START_TILE, TILE, canWalk, getNearbyInteractables, getReachableObjects, getWalkability, type GridCell,
} from '../world/topology';
import { TUNING } from './tuning';
import { isValidRetrace } from './branches';
import { SPECS, TEMPLATES, runFork } from './forks';
import { partnerTurn, partnerReport } from './partner';
import {
  addHistory, addLog, addStep, anchorOf, clamp100, evalLink, hasFlag, inDanger, nodeOf, recompute, routeOpen, safeSites, voice,
} from './core';
import { ALIEN_TEXT, HINTS, INTRO, STONES_TEXT, TERMINAL_TEXT, TOO_FAR, VOICE_LINES } from '../content/dialogue';
import { objectiveHint, planWin } from './planner';

export { TEMPLATES, objectiveHint, planWin };

export const DEFAULT_SEED = 48219;
export const SAVE_VERSION = 2;
const RETRACE_COST = 8;
const FORK_OBJECTS = new Set(TEMPLATES.map(t => t.triggerObjectId));

const ANCHORS: Array<[AnchorId, AnchorKind]> = [['LANTERN', 'HEAR'], ['GREENHOUSE', 'FIND'], ['LIGHTHOUSE', 'MEET']];

export const DEFAULT_ACTION: Record<string, PhysicalAction> = {
  lantern: 'RELIGHT', bridge: 'BRACE', radio: 'TUNE', greenhouse: 'PROTECT', tide: 'OPEN_SLUICE', planks: 'GATHER', woodpile: 'GATHER',
  stones: 'REST', thread_terminal: 'REST', anchor_LANTERN: 'OBSERVE', anchor_GREENHOUSE: 'OBSERVE', anchor_LIGHTHOUSE: 'BEACON',
};
const ALLOWED: Record<string, PhysicalAction[]> = {
  lantern: ['RELIGHT', 'OBSERVE'], bridge: ['BRACE', 'OBSERVE'], radio: ['TUNE', 'HOLD_SIGNAL', 'OBSERVE'],
  greenhouse: ['PROTECT', 'HARVEST', 'REST', 'OBSERVE'], tide: ['OPEN_SLUICE', 'OBSERVE'], planks: ['GATHER', 'OBSERVE'],
  woodpile: ['GATHER', 'OBSERVE'], stones: ['REST', 'OBSERVE', 'TUNE', 'HOLD_SIGNAL'], thread_terminal: ['REST', 'OBSERVE'],
  anchor_LANTERN: ['OBSERVE', 'REST'], anchor_GREENHOUSE: ['OBSERVE', 'REST'], anchor_LIGHTHOUSE: ['BEACON', 'OBSERVE'],
};
const LABEL: Record<PhysicalAction, string> = {
  RELIGHT: 'Relight', BRACE: 'Brace the bridge', OPEN_SLUICE: 'Open the sluice', PROTECT: 'Protect the seedlings', HARVEST: 'Harvest dry fibre',
  TUNE: 'Tune', HOLD_SIGNAL: 'Hold the signal', OBSERVE: 'Look closely', BEACON: 'Light the beacon', GATHER: 'Gather', REST: 'Rest here',
};

/** Deprecated V2 alias: INTERACT.choice -> PhysicalAction. LET_GO = the object's default, SELF = the "take" verb, ECHO = hold the signal. */
export function mapLegacyChoice(obj: string, c: Choice): PhysicalAction {
  if (c === 'SELF' && obj === 'greenhouse') return 'HARVEST';
  if (c === 'ECHO' && obj === 'radio') return 'HOLD_SIGNAL';
  return DEFAULT_ACTION[obj] ?? 'OBSERVE';
}

export function createInitialState(seed: number): SimulationState {
  const base: Stats = { light: 0, water: 2, structure: 0, signal: 0, growth: 1, instability: 0 };
  const actor = (id: 'player' | 'partner', nodeId: string): ActorState => ({
    id, nodeId, x: 0, y: 96, stable: true, inventory: { fuel: 0, plank: 0 }, taken: { wood: 0, plank: 0 },
  });
  const s: SimulationState = {
    version: 2, seed, turn: 0,
    nodes: {
      root: { id: 'root', parentId: null, depth: 0, eventInstanceId: null, outcomeId: null, world: { ...base, water: 1 }, flags: [], visitState: 'VISITED', children: ['N0001', 'N0002'], owner: 'player' },
      // The opening event (a tree falls between them) splits the two histories.
      N0001: { id: 'N0001', parentId: 'root', depth: 1, eventInstanceId: 'E0001', outcomeId: 'A', world: { ...base }, flags: ['BRIDGE_CLOSED'], visitState: 'VISITED', children: [], owner: 'player' },
      N0002: { id: 'N0002', parentId: 'root', depth: 1, eventInstanceId: 'E0001', outcomeId: 'B', world: { ...base }, flags: ['BRIDGE_CLOSED', 'PLANKS_LOST'], visitState: 'VISITED', children: [], owner: 'partner' },
    },
    events: [{
      eventInstanceId: 'E0001', templateId: 'opening', actorId: 'player', parentNodeId: 'root', childNodeIds: ['N0001', 'N0002'],
      activeChildNodeId: 'N0001', selectedOutcome: 'A', choice: 'LET_GO', effects: {},
      reason: 'A tree fell between the two of them. The pink flash split their histories: you wake in one forest, they in another.',
      paid: 'Nothing yet.', driftAfter: 0, strainAfter: 0, turnNumber: 0,
      sourceObject: 'old_tree', priorState: 'together', playerAction: 'WITNESS', outcomeA: 'You wake alone.', outcomeB: 'They wake alone.',
      seededRoll: 0, chosenOutcome: 'A', localPhysicalEffect: 'Two independent forests.', evidenceShown: 'The edge of the world flashes pink.',
    }],
    player: actor('player', 'N0001'), partner: actor('partner', 'N0002'),
    bondStrain: 0, realityDrift: 0, link: 'CONNECTED', messages: [], history: [],
    anchors: ANCHORS.map(([id, kind]) => ({ id, kind, playerReady: false, partnerReady: false, aligned: false, playerPhysical: false, partnerPhysical: false, coordinated: false })),
    intention: 'FIND_ME', phase: 'BOOT', seenDialogueIds: [], log: [], occurrences: {},
    freeRetraceAvailable: false, pendingFork: null, retraceCount: 0, won: false,
    v2: {
      tick: 0, journey: [], warningsIssued: 0, playerIdentity: 'amber', examined: [], realm: 'TOWN', ending: null,
      gridX: PLAYER_START_TILE.tx, gridY: PLAYER_START_TILE.ty, crossed: false, dangerActions: 0, dangerTicks: 0, idleTicks: 0,
      ineffective: 0, sig: '', tuneMotif: [], secretFound: false, learned: [], shared: [], lastRecoveryTick: -99,
    },
  };
  s.partner.site = 'CLEARING'; s.partner.goal = 'REACH_NEXT_SITE'; s.partner.knowledge = ['relight', 'brace_bridge', 'protect_garden'];
  s.partner.stuck = 0; s.partner.crossed = false; s.partner.priority = null; s.partner.lastSeenMsg = 0; s.partner.refusals = 0;
  s.partner.taken.plank = TUNING.PILE; // planks washed away in the partner's forest
  s.player.x = PLAYER_START_TILE.tx * TILE + TILE / 2; s.player.y = PLAYER_START_TILE.ty * TILE + TILE / 2;
  s.partner.x = 256; s.partner.y = 96;
  s.v2.journey.push({ seq: 1, tick: 0, actor: 'player', fromNodeId: 'root', toNodeId: 'N0001', action: 'FORK', eventInstanceId: 'E0001', cause: s.events[0].reason, effect: 'You wake alone in your own forest.' });
  s.v2.journey.push({ seq: 2, tick: 0, actor: 'partner', fromNodeId: 'root', toNodeId: 'N0002', action: 'FORK', eventInstanceId: 'E0001', cause: s.events[0].reason, effect: 'They wake alone in theirs.' });
  addLog(s, 'Two forests, one Thread. Find each other.', 'system');
  recompute(s);
  return s;
}

type Listener = (s: Readonly<SimulationState>, ev: DomainEvent[]) => void;

export class SimEngine {
  private state: SimulationState;
  private listeners = new Set<Listener>();

  /** inPlace: skip the per-dispatch defensive clone (bots/planner only). */
  constructor(seed: number = DEFAULT_SEED, saved?: SimulationState, private inPlace = false) {
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
      if (v.realm !== 'TOWN' && v.realm !== 'ALIEN') return null;
      if (!Number.isInteger(v.gridX) || !Number.isInteger(v.gridY)) return null;
      if (!Array.isArray(s.events) || !Array.isArray(s.anchors) || s.anchors.length !== 3) return null;
      if (!Array.isArray(s.messages) || !Array.isArray(s.history) || !Array.isArray(s.log) || !s.player.inventory) return null;
      for (const n of Object.values(s.nodes)) if (n.parentId !== null && !s.nodes[n.parentId]) return null;
      return s;
    } catch { return null; }
  }

  dispatch(cmd: Command): DomainEvent[] {
    const next = this.inPlace ? this.state : clone(this.state);
    const out: DomainEvent[] = [];
    const before = next.anchors.map(a => a.aligned);
    const ok = reduce(next, cmd, out);
    if (!ok) {
      const rej = out.find(e => e.type === 'REJECTED');
      if (rej && rej.type === 'REJECTED') addLog(next, rej.reason, 'hint');
    } else {
      const al: DomainEvent[] = [];
      next.anchors.forEach((a, i) => {
        if (a.aligned && !before[i]) {
          al.push({ type: 'ANCHOR_ALIGNED', anchorId: a.id });
          if (a.id === 'LANTERN') voice(next, out, 'clear', 'I can hear you now. There is a lantern burning on my side too.', Infinity);
          else if (a.id === 'GREENHOUSE') voice(next, out, 'anchor', 'I found the marker by the garden. It matches yours.', Infinity);
        }
      });
      const wi = out.findIndex(e => e.type === 'WIN');
      if (wi >= 0) out.splice(wi, 0, ...al); else out.push(...al);
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

/** A refused/ineffective interaction. Factual clue; after 3 in a row, escalate with the next physical step. */
function clueReject(s: SimulationState, out: DomainEvent[], clue: string): false {
  s.v2.ineffective++;
  // a wasted attempt still costs a moment: nothing can stall forever on refused actions
  s.v2.tick++; s.v2.idleTicks++;
  evalLink(s, out, 'tick');
  out.push({ type: 'WORLD_CHANGED', objectId: '', text: clue });
  if (s.v2.ineffective >= 3) {
    s.v2.ineffective = 0;
    const h = objectiveHint(s);
    if (h.text) out.push({ type: 'WORLD_CHANGED', objectId: h.objectId, text: h.text });
  }
  return reject(out, clue);
}

export function siteOfPlayer(s: Readonly<SimulationState>): Site {
  let best: Site = 'CLEARING', bd = 99;
  for (const [id, t] of Object.entries(OBJECT_TILES)) {
    const d = Math.max(Math.abs(t.tx - s.v2.gridX), Math.abs(t.ty - s.v2.gridY));
    if (d < bd && OBJECT_SITE[id]) { bd = d; best = OBJECT_SITE[id]; }
  }
  return best;
}

function reduce(s: SimulationState, cmd: Command, out: DomainEvent[]): boolean {
  if (cmd.type === 'RESTART') { Object.assign(s, createInitialState(cmd.seed)); return true; }
  if (cmd.type === 'SET_POSITION') {
    if (Number.isFinite(cmd.x) && Number.isFinite(cmd.y)) { s.player.x = cmd.x; s.player.y = cmd.y; }
    return true;
  }
  if (cmd.type === 'MARK_SEEN') { if (!s.seenDialogueIds.includes(cmd.dialogueId)) s.seenDialogueIds.push(cmd.dialogueId); return true; }
  if (cmd.type === 'SET_IDENTITY') {
    if (cmd.identity !== 'amber' && cmd.identity !== 'cyan') return reject(out, 'Choose amber or cyan.');
    s.v2.playerIdentity = cmd.identity; return true;
  }
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE') {
    if (cmd.type === 'SET_PHASE') { s.phase = cmd.phase === 'ARCHIVE' || cmd.phase === s.phase ? cmd.phase : s.phase; return true; }
    return reject(out, HINTS.DONE);
  }
  switch (cmd.type) {
    case 'MOVE': return doMove(s, cmd.tx, cmd.ty, out);
    case 'INTERACT': return doInteract(s, cmd.objectId, cmd.action ?? (cmd.choice ? mapLegacyChoice(cmd.objectId, cmd.choice) : undefined), out);
    case 'CALL': return doCall(s, out, cmd.kind, cmd.technique);
    case 'REQUEST_PARTNER': return doCall(s, out, cmd.intention === 'FIND_ME' ? 'LOCATION' : undefined);
    case 'ADVANCE_PARTNER': {
      if (s.phase === 'ARCHIVE') return reject(out, 'Close the archive first.');
      startPlay(s, out);
      s.turn++; partnerTurn(s, out);
      return afterAction(s, out, false, true);
    }
    case 'SET_PHASE': {
      if (cmd.phase === 'ENDING') return reject(out, 'The ending only comes from the lookout.');
      if (cmd.phase === 'FORK') return reject(out, 'Walk to an object and interact with it.');
      if (s.phase === 'BOOT' && cmd.phase === 'EXPLORING') voice(s, out, 'boot', VOICE_LINES.boot, Infinity);
      s.phase = cmd.phase; return true;
    }
    case 'BEGIN_FORK': case 'RESOLVE_FORK': return reject(out, 'Walk to an object and choose what to do with it.');
    case 'CANCEL_FORK': return true;
    case 'REST_AT_TERMINAL': return doInteract(s, 'thread_terminal', 'REST', out);
    case 'ACTIVATE_ANCHOR': return doInteract(s, 'anchor_' + cmd.anchorId, undefined, out);
    case 'RETRACE': return doRetrace(s, cmd.targetNodeId, out);
  }
  return reject(out, 'Nothing happens.');
}

function startPlay(s: SimulationState, out: DomainEvent[]): void {
  if (s.phase === 'BOOT') { s.phase = 'EXPLORING'; voice(s, out, 'boot', VOICE_LINES.boot, Infinity); }
}

function snapPlayer(s: SimulationState, out: DomainEvent[]): void {
  const n = nodeOf(s, 'player');
  const here: GridCell = { tx: s.v2.gridX, ty: s.v2.gridY };
  const w = getWalkability(n.world, n.flags, s.v2.realm);
  const okTile = w[here.ty]?.[here.tx];
  const reach = getReachableObjects(n.world, n.flags, PLAYER_START_TILE, s.v2.realm);
  const home = getReachableObjects(n.world, n.flags, here, s.v2.realm);
  if (okTile && home.length && reach.some(o => home.includes(o)) && home.includes('woodpile') === reach.includes('woodpile')) return;
  // trapped (tile now blocked, or cut off from the starting bank): the Thread pulls you back to the clearing
  s.v2.gridX = PLAYER_START_TILE.tx; s.v2.gridY = PLAYER_START_TILE.ty;
  s.player.x = PLAYER_START_TILE.tx * TILE + TILE / 2; s.player.y = PLAYER_START_TILE.ty * TILE + TILE / 2;
  out.push({ type: 'WORLD_CHANGED', objectId: '', text: 'The Thread tugs you back to the clearing.' });
}

function doMove(s: SimulationState, tx: number, ty: number, out: DomainEvent[]): boolean {
  if (s.phase === 'ARCHIVE') return reject(out, 'Close the archive first.');
  const v = s.v2;
  const node = nodeOf(s, 'player');
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || !canWalk(node.world, node.flags, { tx: v.gridX, ty: v.gridY }, { tx, ty }, v.realm)) {
    return reject(out, 'The way is blocked. Look for a bridge, a ford or a drier path.');
  }
  startPlay(s, out);
  v.gridX = tx; v.gridY = ty;
  s.player.x = tx * TILE + TILE / 2; s.player.y = ty * TILE + TILE / 2;
  if (tx <= 4) v.crossed = true; // physically stood on the far bank
  return afterAction(s, out, false, true);
}

function markExamined(s: SimulationState, obj: string): void {
  if (!s.v2.examined.includes(obj)) s.v2.examined.push(obj);
}

export interface ActionOption { action: PhysicalAction; label: string; enabled: boolean; clue?: string }
/** Contextual verbs for an object (UI), with the factual clue when currently blocked. */
export function availableActions(s: Readonly<SimulationState>, obj: string): ActionOption[] {
  const list = ALLOWED[obj] ?? [];
  const sc = s as SimulationState;
  return list.filter(a => a !== 'OBSERVE').map(a => {
    const clue = blockedClue(sc, obj, a);
    return { action: a, label: LABEL[a], enabled: !clue, ...(clue ? { clue } : {}) };
  });
}

function blockedClue(s: SimulationState, obj: string, a: PhysicalAction): string | null {
  const spec = SPECS[a];
  if (a === 'GATHER') {
    const t = s.player.taken;
    return (obj === 'woodpile' ? t.wood : t.plank) >= TUNING.PILE ? 'The pile is picked clean.' : null;
  }
  if (a === 'REST') {
    if (obj === 'greenhouse' && !hasFlag(s, 'player', 'GARDEN_GROWN')) return 'The seedlings are too young to shelter anyone.';
    return null;
  }
  if (a === 'OBSERVE') return null;
  if (!spec) return null;
  return spec.blocked({ s, who: 'player', prepared: false });
}

function describe(s: SimulationState, obj: string): string {
  const win = hasFlag;
  switch (obj) {
    case 'lantern': return win(s, 'player', 'LANTERN_LIT') ? 'The lantern burns. Its light reaches the road.' : s.player.inventory.fuel < 1 ? 'The fire pit is cold. Dry wood by the trees, or dry fibre from the garden, could catch.' : 'The glass is whole. With fuel in hand, it could catch.';
    case 'bridge': return !win(s, 'player', 'BRIDGE_CLOSED') ? 'The bridge spans the stream.' : s.player.inventory.plank < 1 ? 'The span is missing boards. A pile of planks lies along the path.' : 'The supports look loose, but the planks you carry would fit.';
    case 'tide': return nodeOf(s, 'player').world.water <= 1 ? 'The sluice runs open. The water is low.' : 'The gate holds the stream back. The ford and the sand path are underwater.';
    case 'greenhouse': return win(s, 'player', 'GARDEN_WITHERED') ? 'The beds are bare.' : win(s, 'player', 'GARDEN_GROWN') ? 'The seedlings stand tall. It is a safe place to rest.' : 'Seedlings, and dry fibre among the stalks.';
    case 'radio': return win(s, 'player', 'RADIO_CLEAR') ? 'The set holds one steady tone.' : 'The set crackles. The tone slides in and out.';
    case 'stones': return 'The stones hum faintly. They remember both of you.';
    case 'woodpile': return s.player.taken.wood >= TUNING.PILE ? 'The pile is picked clean.' : 'Dry wood, stacked under the trees.';
    case 'planks': return s.player.taken.plank >= TUNING.PILE ? 'The pile is picked clean.' : 'Weathered planks, still sound.';
    default: return INTRO[obj] ?? 'Nothing more to see.';
  }
}

function doInteract(s: SimulationState, obj: string, requested: PhysicalAction | undefined, out: DomainEvent[]): boolean {
  const v = s.v2;
  if (s.phase === 'ARCHIVE') return reject(out, 'Close the archive first.');
  if (!OBJECT_TILES[obj]) return reject(out, 'Nothing here responds.');
  const node = nodeOf(s, 'player');
  if (!getNearbyInteractables(node.world, node.flags, { tx: v.gridX, ty: v.gridY }, v.realm).includes(obj)) return reject(out, TOO_FAR);
  const action = requested ?? DEFAULT_ACTION[obj] ?? 'OBSERVE';
  if (!(ALLOWED[obj] ?? ['OBSERVE']).includes(action)) return clueReject(s, out, `You can't ${LABEL[action].toLowerCase()} here.`);
  startPlay(s, out);
  const first = !v.examined.includes(obj);
  if (first && INTRO[obj]) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: INTRO[obj] });
  let effective = true;

  if (action === 'OBSERVE') {
    effective = first;
    if (obj === 'stones' && v.tuneMotif.length >= 2 && v.tuneMotif[v.tuneMotif.length - 1] === v.tuneMotif[v.tuneMotif.length - 2] && v.examined.includes('stones') && v.realm === 'TOWN') {
      return enterAlien(s, out);
    }
    if (obj === 'stones' && v.realm === 'ALIEN') return leaveAlien(s, out);
    if (obj.startsWith('anchor_')) return markAnchor(s, obj.slice(7) as AnchorId, out);
    if (!first) out.push({ type: 'WORLD_CHANGED', objectId: obj, text: describe(s, obj) });
    markExamined(s, obj);
    if (!effective) { v.ineffective++; if (v.ineffective >= 3) { v.ineffective = 0; const h = objectiveHint(s); if (h.text) out.push({ type: 'WORLD_CHANGED', objectId: h.objectId, text: h.text }); } }
    else v.ineffective = 0;
    return afterAction(s, out, effective, true);
  }
  if (obj === 'anchor_LIGHTHOUSE' && action === 'BEACON') {
    const r = runFork(s, 'player', 'BEACON', out, v.examined.includes(obj));
    if (!r.ok) { markExamined(s, obj); return markAnchor(s, 'LIGHTHOUSE', out, r.clue); }
    markExamined(s, obj);
    s.turn++; partnerTurn(s, out);
    markAnchor(s, 'LIGHTHOUSE', out, undefined, true);
    return true;
  }
  if (action === 'GATHER') {
    const t = s.player.taken;
    if ((obj === 'woodpile' ? t.wood : t.plank) >= TUNING.PILE) return clueReject(s, out, 'The pile is picked clean.');
    if (obj === 'woodpile') { t.wood++; s.player.inventory.fuel++; } else { t.plank++; s.player.inventory.plank++; }
    const txt = obj === 'woodpile' ? 'You gather dry wood.' : 'You carry a plank.';
    out.push({ type: 'WORLD_CHANGED', objectId: obj, text: txt });
    addHistory(s, 'player', OBJECT_SITE[obj], 'GATHER', undefined, txt);
    markExamined(s, obj);
    s.turn++; partnerTurn(s, out);
    return afterAction(s, out, true, true);
  }
  if (action === 'REST') return doRest(s, obj, out);
  // forks
  const prepared = v.examined.includes(obj);
  const r = runFork(s, 'player', action, out, prepared);
  if (!r.ok) { markExamined(s, obj); return clueReject(s, out, r.clue ?? 'Nothing happens.'); }
  markExamined(s, obj);
  v.ineffective = 0;
  if (obj === 'radio' && (action === 'TUNE' || action === 'HOLD_SIGNAL')) {
    v.tuneMotif.push(r.outcome!); if (v.tuneMotif.length > 3) v.tuneMotif.shift();
    const m = v.tuneMotif;
    if (m.length >= 2 && m[m.length - 1] === m[m.length - 2] && v.examined.includes('stones')) out.push({ type: 'WORLD_CHANGED', objectId: 'stones', text: 'The same tone again, and the stones hum back the same three notes.' });
  }
  if (action === 'HOLD_SIGNAL') sendMessage(s, out, undefined, undefined, r.outcome === 'A' ? 0.92 : 0.25);
  s.turn++;
  partnerTurn(s, out);
  return afterAction(s, out, true, true);
}

function doRest(s: SimulationState, obj: string, out: DomainEvent[]): boolean {
  const v = s.v2;
  if (obj === 'greenhouse' && !hasFlag(s, 'player', 'GARDEN_GROWN')) return clueReject(s, out, 'The seedlings are too young to shelter anyone.');
  if (s.bondStrain <= 10 && !inDanger(s) && s.realityDrift < 30) return clueReject(s, out, 'You are already steady here.');
  const before = s.bondStrain;
  s.bondStrain = clamp100(s.bondStrain - TUNING.REST_STRAIN);
  v.calm = Math.min(TUNING.CALM_MAX, (v.calm ?? 0) + TUNING.REST_CALM);
  v.lastRecoveryTick = v.tick;
  addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: s.player.nodeId, action: 'STABILISE', cause: `You rested at the ${obj === 'greenhouse' ? 'garden' : 'thread stone'}.`, effect: 'The Thread loosens.' });
  addHistory(s, 'player', OBJECT_SITE[obj], 'REST', undefined, 'Rested.');
  if (s.bondStrain < before) out.push({ type: 'STRAIN_RECOVERED' });
  out.push({ type: 'WORLD_CHANGED', objectId: obj, text: obj === 'stones' ? STONES_TEXT : TERMINAL_TEXT });
  markExamined(s, obj);
  recompute(s);
  s.turn++; partnerTurn(s, out);
  return afterAction(s, out, true, true, true);
}

function enterAlien(s: SimulationState, out: DomainEvent[]): boolean {
  const v = s.v2;
  v.realm = 'ALIEN'; v.secretFound = true; v.tuneMotif = [];
  out.push({ type: 'REALM', realm: 'ALIEN' });
  out.push({ type: 'WORLD_CHANGED', objectId: 'stones', text: ALIEN_TEXT });
  addLog(s, ALIEN_TEXT, 'system');
  return afterAction(s, out, true, true);
}
function leaveAlien(s: SimulationState, out: DomainEvent[]): boolean {
  s.v2.realm = 'TOWN';
  out.push({ type: 'REALM', realm: 'TOWN' });
  out.push({ type: 'WORLD_CHANGED', objectId: 'stones', text: STONES_TEXT });
  snapPlayer(s, out);
  return afterAction(s, out, true, true);
}

/** Anchors: player physical evidence at the site. Each side's readiness is earned independently. */
function markAnchor(s: SimulationState, id: AnchorId, out: DomainEvent[], blocked?: string, justLit = false): boolean {
  const v = s.v2;
  const a = anchorOf(s, id);
  markExamined(s, 'anchor_' + id);
  let clue = blocked ?? '';
  const wasReady = a.playerReady;
  if (!a.playerReady) {
    if (id === 'LANTERN') {
      if (hasFlag(s, 'player', 'LANTERN_LIT')) { a.playerReady = true; clue = 'The marker rings a low note as the lantern burns beside it.'; }
      else clue = 'The marker stone is silent. The lantern in the clearing is cold; dry fibre or wood could catch.';
    } else if (id === 'GREENHOUSE') {
      if (v.crossed && routeOpen(s, 'player')) { a.playerReady = true; clue = 'You press your palm to the half-carved symbol. It matches the one on the far bank.'; }
      else if (!v.crossed) clue = routeOpen(s, 'player') ? 'The symbol is half-carved. Its other half lies across the river.' : 'The symbol is half-carved. The river is high, and the bridge is broken.';
      else clue = 'The symbol is half-carved. The crossing behind you has closed.';
    } else {
      if (hasFlag(s, 'player', 'BEACON_LIT')) a.playerReady = true;
      else if (!clue && !justLit) clue = 'The beacon bowl is cold. Dry wood would feed it.';
    }
  }
  if (a.playerReady && !a.aligned) {
    const other = id === 'LANTERN' ? 'Far off, nothing answers your note yet.' : id === 'GREENHOUSE' ? 'The other half of the symbol is still blank.' : 'Your beacon burns alone. Nothing answers from the other shore.';
    clue = (justLit ? 'The bowl catches. ' : '') + other;
  }
  recompute(s);
  if (a.aligned && id !== 'LIGHTHOUSE') clue = 'The marker rings twice: yours, and answering.';
  if (id === 'LIGHTHOUSE' && a.playerReady) {
    const missing = s.anchors.filter(x => x.id !== 'LIGHTHOUSE' && !x.aligned).map(x => (x.id === 'LANTERN' ? 'the clearing lantern' : 'the garden marker'));
    if (a.aligned && missing.length) clue = `The beacon pulses twice, but ${missing.join(' and ')} has not answered both sides.`;
  }
  if (clue) out.push({ type: 'WORLD_CHANGED', objectId: 'anchor_' + id, text: clue });
  const win = checkWin(s, out);
  const effective = (!wasReady && a.playerReady) || justLit;
  if (!effective) v.ineffective++; else v.ineffective = 0;
  if (!win && !effective && v.ineffective >= 3) { v.ineffective = 0; const h = objectiveHint(s); if (h.text) out.push({ type: 'WORLD_CHANGED', objectId: h.objectId, text: h.text }); }
  if (win) return true;
  return afterAction(s, out, effective, true);
}

/** Win: all three aligned, both at lit beacons, Thread viable. Never inferred from equal node ids. */
function checkWin(s: SimulationState, out: DomainEvent[]): boolean {
  if (s.won) return true;
  if (!s.anchors.every(a => a.aligned)) return false;
  if (s.link !== 'CONNECTED' && s.link !== 'FRAYING') return false;
  if (!hasFlag(s, 'player', 'BEACON_LIT') || !hasFlag(s, 'partner', 'BEACON_LIT')) return false;
  if (s.partner.site !== 'BEACON') return false;
  const t = OBJECT_TILES.anchor_LIGHTHOUSE;
  if (Math.max(Math.abs(t.tx - s.v2.gridX), Math.abs(t.ty - s.v2.gridY)) > 1) return false;
  if (s.bondStrain > TUNING.WIN_STRAIN_MAX) return false;
  addStep(s, { actor: 'partner', fromNodeId: s.partner.nodeId, toNodeId: s.partner.nodeId, action: 'REUNION', cause: 'Both beacons burned at once and the Thread carried the overlap.', effect: 'For one moment, the two forests are the same forest.' });
  addHistory(s, 'partner', 'BEACON', 'REUNION', undefined, 'Both beacons burn at once.');
  s.won = true; s.phase = 'ENDING'; s.v2.ending = 'WIN';
  voice(s, out, 'final', VOICE_LINES.final, Infinity);
  addLog(s, 'There you are.', 'partner');
  out.push({ type: 'WIN' });
  return true;
}

// ---------- Thread messages (information only) ----------
function clarityNow(s: SimulationState): number {
  const c = 0.35 + (hasFlag(s, 'player', 'LANTERN_LIT') ? 0.25 : 0) + (hasFlag(s, 'player', 'RADIO_CLEAR') ? 0.25 : 0) - 0.004 * Math.max(0, s.realityDrift - 30);
  return Math.max(0.1, Math.min(0.95, c));
}

function sendMessage(s: SimulationState, out: DomainEvent[], kind?: ThreadMessage['kind'], technique?: string, clarity?: number): void {
  let k = kind ?? 'CALL';
  let tech = technique;
  if (!tech && (kind === undefined || kind === 'TECHNIQUE') && s.v2.learned.length) {
    tech = s.v2.learned.find(t => !s.v2.shared.includes(t)) ?? s.v2.learned[s.v2.learned.length - 1];
    k = 'TECHNIQUE';
  }
  if (tech) { k = 'TECHNIQUE'; if (!s.v2.shared.includes(tech)) s.v2.shared.push(tech); }
  const m: ThreadMessage = { from: 'player', to: 'partner', kind: k, site: siteOfPlayer(s), turn: s.turn, clarity: clarity ?? clarityNow(s) };
  if (tech) m.technique = tech;
  s.messages.push(m);
  void out;
}

function doCall(s: SimulationState, out: DomainEvent[], kind?: ThreadMessage['kind'], technique?: string): boolean {
  if (s.phase === 'ARCHIVE') return reject(out, 'Close the archive first.');
  if (s.link === 'FADED') return reject(out, 'The Thread is silent.');
  if (s.player.inventory.fuel < 1) return clueReject(s, out, 'Your lantern has no fuel to carry a call. Dry wood by the trees, or dry fibre from the garden, would feed it.');
  startPlay(s, out);
  s.player.inventory.fuel--;
  s.bondStrain += TUNING.CALL_STRAIN;
  sendMessage(s, out, kind, technique);
  const m = s.messages[s.messages.length - 1];
  const prev = s.messages.slice(0, -1).reverse().find(x => x.from === 'player');
  const novel = !prev || prev.kind !== m.kind || prev.technique !== m.technique || prev.site !== m.site;
  addHistory(s, 'player', siteOfPlayer(s), 'CALL', m.kind, m.technique ?? 'You call across the Thread.');
  out.push({ type: 'WORLD_CHANGED', objectId: '', text: m.clarity >= 0.6 ? 'Your voice carries across the Thread. The lantern burns lower.' : 'Your voice frays on its way. The lantern burns lower.' });
  s.v2.ineffective = 0;
  s.turn++;
  recompute(s);
  partnerTurn(s, out);
  return afterAction(s, out, novel, false);
}

function doRetrace(s: SimulationState, target: string, out: DomainEvent[]): boolean {
  const v = s.v2;
  const near = getNearbyInteractables(nodeOf(s, 'player').world, nodeOf(s, 'player').flags, { tx: v.gridX, ty: v.gridY }, v.realm);
  const ev = s.events.find(e => e.eventInstanceId === nodeOf(s, 'player').eventInstanceId);
  const src = ev?.sourceObject;
  if (!(near.includes('stones') || near.includes('thread_terminal') || (src && near.includes(src)))) {
    return reject(out, 'To retrace, return to the place where it happened, or to a thread stone.');
  }
  if (!isValidRetrace(s.nodes, s.player.nodeId, target)) return reject(out, 'You can only retrace to an earlier moment on your own path.');
  s.turn++;
  addStep(s, { actor: 'player', fromNodeId: s.player.nodeId, toNodeId: target, action: 'RETRACE', cause: 'You walked your own path back.', effect: 'History is kept.' });
  s.player.nodeId = target;
  s.nodes[target].visitState = 'VISITED';
  s.retraceCount++;
  s.bondStrain += RETRACE_COST;
  addLog(s, 'You retrace your steps. The Thread strains with the effort. History is kept.', 'system');
  out.push({ type: 'RETRACED', nodeId: target });
  snapPlayer(s, out);
  recompute(s);
  partnerTurn(s, out);
  return afterAction(s, out, true, true);
}

/**
 * Shared bookkeeping after every accepted command: tick, natural strain relief, partner cadence on walking, win check, fade machine.
 * `effective`: it changed the world, inventory, or Thread. `tick`: advance the sim clock.
 */
function afterAction(s: SimulationState, out: DomainEvent[], effective: boolean, tick: boolean, recovery = false): boolean {
  const v = s.v2;
  if (tick) {
    v.tick++;
    if (v.calm && v.tick % TUNING.CALM_DECAY_EVERY === 0) v.calm = Math.max(0, v.calm - 1);
    if (v.tick % TUNING.WOOD_RESTOCK_EVERY === 0) { s.player.taken.wood = Math.max(0, s.player.taken.wood - 1); s.partner.taken.wood = Math.max(0, s.partner.taken.wood - 1); }
    if (v.tick % TUNING.STRAIN_DECAY_EVERY === 0) s.bondStrain = Math.max(0, s.bondStrain - 1);
    if (!effective && v.tick % TUNING.PARTNER_PERIOD === 0 && !s.won) { s.turn++; partnerTurn(s, out); }
  }
  // idle = no real progress (a fork resolved by either side, an anchor earned, a technique learned, the far bank reached)
  const sig = `${s.events.length}|${s.anchors.filter(a => a.playerReady).length}${s.anchors.filter(a => a.partnerReady).length}|${v.learned.length}|${v.crossed ? 1 : 0}`;
  if (sig !== v.sig) { v.sig = sig; v.idleTicks = 0; } else v.idleTicks++;
  recompute(s);
  if (s.realityDrift >= 60) voice(s, out, 'divergence', VOICE_LINES.divergence, 14);
  if (s.bondStrain >= 70) voice(s, out, 'overstrain', VOICE_LINES.overstrain, 12);
  if (checkWin(s, out)) return true;
  evalLink(s, out, effective ? 'action' : 'tick', recovery);
  if (!tick) { /* calls still advance time */ v.tick++; }
  return true;
}

export { partnerReport };
export function cheapestWinPath(): Command[] { return planWin(createInitialState(DEFAULT_SEED)); }
export type { Intention };
void addLog; void snapPlayer;
