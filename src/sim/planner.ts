// Observation-based planning for bots, the demo button and hints. Acts only through legal commands (MOVE / INTERACT / CALL / ADVANCE_PARTNER).
// objectiveHint() reads only what the player can see: own world, inventory, own anchor markers, partner voice lines. No hidden stats.
import type { Command, PhysicalAction, SimulationState, ThreadMessage } from './types';
import { SimEngine } from './engine';
import { getWalkability, pathTo } from '../world/topology';
import { TUNING } from './tuning';

export interface Hint {
  objectId: string;                 // object to walk to ('' when the step is a call or waiting)
  text: string;                     // physical language, no numbers
  action?: PhysicalAction | 'CALL' | 'WAIT';
  call?: { kind: ThreadMessage['kind']; technique?: string };
}

type S = Readonly<SimulationState>;
export const here = (s: S) => ({ tx: s.v2.gridX, ty: s.v2.gridY });

/** Walk toward an object, or interact once in range. null = unreachable right now. */
export function act(s: S, objectId: string, action?: PhysicalAction): Command | null {
  const n = s.nodes[s.player.nodeId];
  const p = pathTo(n.world, n.flags, here(s), objectId, s.v2.realm);
  if (!p) return null;
  if (p.length === 0) return action ? { type: 'INTERACT', objectId, action } : { type: 'INTERACT', objectId };
  return { type: 'MOVE', tx: p[0].tx, ty: p[0].ty };
}

/** Let time pass without moving. */
export const wait = (_s?: S): Command => ({ type: 'ADVANCE_PARTNER' });

/** Legal shuffle step (used by wanderers). */
export function shuffle(s: S): Command | null {
  const n = s.nodes[s.player.nodeId];
  const w = getWalkability(n.world, n.flags, s.v2.realm);
  const f = here(s);
  const cand = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ tx: f.tx + dx, ty: f.ty + dy })).filter(c => w[c.ty]?.[c.tx]);
  if (!cand.length) return null;
  const c = cand[s.v2.tick % cand.length];
  return { type: 'MOVE', tx: c.tx, ty: c.ty };
}

const has = (s: S, f: string) => s.nodes[s.player.nodeId].flags.includes(f);
const anchor = (s: S, id: string) => s.anchors.find(a => a.id === id)!;
const tried = (s: S, a: PhysicalAction) => (s.occurrences['player:' + a] ?? 0) > 0;

/** The last thing the partner said about itself, as the player heard it. */
export function lastPartnerLine(s: S): string {
  for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].kind === 'partner') return s.log[i].text;
  return '';
}

/** Safe place the player can rest at right now, if any. */
export function safePlace(s: S): string | null {
  if (has(s, 'GARDEN_GROWN')) return 'greenhouse';
  const n = s.nodes[s.player.nodeId];
  for (const id of ['anchor_LANTERN', 'stones', 'thread_terminal']) if (pathTo(n.world, n.flags, here(s), id, s.v2.realm)) return id;
  return null;
}

export function objectiveHint(s: S, opts: { skipCalls?: boolean } = {}): Hint {
  const callOk = !opts.skipCalls;
  const inv = s.player.inventory;
  const lit = has(s, 'LANTERN_LIT'), beacon = has(s, 'BEACON_LIT');
  const n = s.nodes[s.player.nodeId];
  const coast = has(s, 'COAST_OPEN') && n.world.water <= 2;
  const routeOpen = !has(s, 'BRIDGE_CLOSED') || n.world.water <= 1;
  const learned = s.v2.learned;

  // 0. Recover when the Thread is thin
  if (s.link !== 'CONNECTED' && (s.bondStrain > 10 || s.realityDrift >= 30)) {
    const sp = safePlace(s);
    if (sp) return { objectId: sp, action: 'REST', text: s.link === 'LAST_SIGNAL' ? 'Their voice is a single note. Rest at a safe place now.' : 'The colours dull. Rest at a safe place until the Thread settles.' };
  }
  // 1. fuel: one load each for the lantern and the beacon, one to call
  const need = (lit ? 0 : 1) + (beacon ? 0 : 1) + (callOk && learned.some(t => !s.v2.shared.includes(t)) ? 1 : 0);
  if (inv.fuel < need) {
    if (s.player.taken.wood < TUNING.PILE) return { objectId: 'woodpile', action: 'GATHER', text: 'The fire pit is cold. Dry wood by the trees could catch.' };
    if (!has(s, 'GARDEN_WITHERED') && (!lit || !beacon)) return { objectId: 'greenhouse', action: 'HARVEST', text: 'The wood is gone. Dry fibre in the garden could catch, but the beds would go bare.' };
    return { objectId: 'woodpile', action: 'WAIT', text: 'The pile is picked clean. The tide leaves more driftwood in time.' };
  }
  // 2. HEAR
  if (!lit && inv.fuel >= 1) return { objectId: 'lantern', action: s.v2.examined.includes('lantern') ? 'RELIGHT' : 'OBSERVE', text: 'You have fuel. The lantern could catch.' };
  if (lit && !anchor(s, 'LANTERN').playerReady) return { objectId: 'anchor_LANTERN', action: 'OBSERVE', text: 'The lantern burns. The marker stone by the road should answer.' };
  // 3. the water
  if (!coast) {
    return { objectId: 'tide', action: s.v2.examined.includes('tide') ? 'OPEN_SLUICE' : 'OBSERVE', text: 'The ford and the sand path lie under water. The sluice gate could lower the stream.' };
  }
  // 4. tell them what worked
  if (callOk && learned.includes('open_sluice') && !s.v2.shared.includes('open_sluice') && inv.fuel >= 1) {
    return { objectId: '', action: 'CALL', call: { kind: 'TECHNIQUE', technique: 'open_sluice' }, text: 'The water is down. Call across and tell them how the sluice opens.' };
  }
  // 5. FIND
  if (!s.v2.crossed && routeOpen) return { objectId: 'stones', action: 'OBSERVE', text: 'The ford is dry. Cross to the far bank.' };
  if (!routeOpen) return { objectId: 'bridge', action: 'BRACE', text: 'The way across is still closed.' };
  if (s.v2.crossed && !anchor(s, 'GREENHOUSE').playerReady) return { objectId: 'anchor_GREENHOUSE', action: 'OBSERVE', text: 'You have crossed. The garden marker holds the other half of the symbol.' };
  // 6. beacon
  if (!beacon) {
    if (inv.fuel >= 1) return { objectId: 'anchor_LIGHTHOUSE', action: 'BEACON', text: 'The sand path is open. The lookout beacon only needs a flame.' };
    return { objectId: 'woodpile', action: s.player.taken.wood < TUNING.PILE ? 'GATHER' : 'WAIT', text: 'The beacon bowl is empty. Dry wood would feed it.' };
  }
  // 7. wait for the other side, and answer what it says
  const line = lastPartnerLine(s);
  if (callOk && /cross|river|sand path/.test(line) && learned.includes('open_sluice') && inv.fuel >= 1) {
    return { objectId: '', action: 'CALL', call: { kind: 'TECHNIQUE', technique: 'open_sluice' }, text: 'They cannot cross. Call again and tell them how the sluice opens.' };
  }
  return { objectId: 'anchor_LIGHTHOUSE', action: 'WAIT', text: 'Your beacon burns. Wait at the lookout for the answering pulse.' };
}

export function hintToCommand(s: S, h: Hint): Command | null {
  if (h.action === 'CALL') return { type: 'CALL', kind: h.call?.kind, technique: h.call?.technique };
  if (h.action === 'WAIT') {
    const c = act(s, h.objectId, 'OBSERVE');
    return c && c.type === 'MOVE' ? c : wait(s);
  }
  if (!h.objectId) return null;
  return act(s, h.objectId, h.action);
}

/** Competent policy: follow the hint; one extra rule, call when the partner's reported blockage matches something you know. */
export function planStep(s: S): Command | null {
  if (s.won || s.phase === 'ENDING' || s.phase === 'FADE') return null;
  return hintToCommand(s, objectiveHint(s)) ?? wait(s);
}

/** Accepts a state or a SimEngine. Never mutates its argument. Returns legal commands that win from that state (as far as the planner gets). */
export function planWin(input: S | { getState(): S }, maxTicks = 700): Command[] {
  const state = 'getState' in input ? input.getState() : input;
  const e = new SimEngine(state.seed, state as SimulationState, true);
  const cmds: Command[] = [];
  let stall = 0;
  for (let i = 0; i < maxTicks * 3; i++) {
    const c = planStep(e.getState());
    if (!c) break;
    const before = e.getState().v2.tick + e.getState().turn;
    e.dispatch(c);
    cmds.push(c);
    if (e.getState().v2.tick + e.getState().turn === before) { if (++stall > 6) break; } else stall = 0;
    if (e.getState().v2.tick > maxTicks) break;
  }
  return cmds;
}
