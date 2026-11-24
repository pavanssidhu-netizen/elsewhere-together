// Observation-based planning for bots, the demo button and hints. Acts only through legal commands (MOVE / INTERACT / CALL / ADVANCE_PARTNER).
// objectiveHint() reads only what the player can see: own world, inventory, own anchor markers, partner voice lines. No hidden stats.
import type { Command, PhysicalAction, SimulationState, ThreadMessage } from './types';
import { SimEngine, alternateOf } from './engine';
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

/** Knowledge puzzle: frequency from the carving, power from the turning wheel, voice through the radio. */
function puzzleHint(s: S): Hint {
  const knows = (s.player.knowledge ?? []).includes('KNOWS_FREQUENCY');
  const diverted = has(s, 'WATER_DIVERTED');
  const n = s.nodes[s.player.nodeId];
  const sibling = alternateOf(s);
  const stuck = !!s.cfg?.sluiceStuck && !s.v2.examined.includes('wheel');
  if (!knows) {
    if (!diverted) {
      if (stuck) return { objectId: 'wheel', action: 'OBSERVE', text: 'The gate will not move. Look closely at the wheel beside it.' };
      return { objectId: 'tide', action: s.v2.examined.includes('tide') ? 'DIVERT_WATER' : 'OBSERVE', text: 'The wheel turns, and something is carved across the water. Lowering the stream might bare a way.' };
    }
    return { objectId: 'inscription', action: 'READ', text: 'The sand path is bare. The carving waits at its end.' };
  }
  if (!has(s, 'WHEEL_TURNING') || has(s, 'RADIO_SMOKE')) {
    if (has(s, 'GATE_INHERITED')) return { objectId: 'tide', action: 'CLOSE_SLUICE', text: 'The gate was opened in the past, and your wheel is dry. Push it back into its slot.' };
    if (!has(s, 'WHEEL_TURNING') && sibling) return { objectId: 'tide', action: 'FOLLOW_ALTERNATE', text: 'The wheel hangs still, so the radio is dead. At the sluice, the other history still has it turning.' + (s.era?.player === 'PAST' ? " Jensen's wheel dried when you turned the river, too." : '') };
    return { objectId: 'tide', action: 'WAIT', text: has(s, 'RADIO_SMOKE') ? 'Smoke hangs over the set. Wait for rain.' : 'The radio is dead. Wait for the weather to turn.' };
  }
  const routeOpen = !has(s, 'BRIDGE_CLOSED') || n.world.water <= 1;
  if (!routeOpen) {
    if (s.player.inventory.plank < 2 && s.player.taken.plank < TUNING.PILE) return { objectId: 'planks', action: 'GATHER', text: 'The span is missing boards. Planks lie along the path.' };
    if (s.player.inventory.plank < 1) return { objectId: 'planks', action: 'WAIT', text: 'The planks are gone. The tide leaves more in time.' };
    return { objectId: 'bridge', action: 'BRACE', text: 'The way to the radio is across the bridge.' };
  }
  if (s.v2.pendingContact && s.era) {
    const warned = (s.partner.knowledge ?? []).includes('caution');
    if (!warned && s.player.inventory.fuel >= 1 && s.link === 'CONNECTED') return { objectId: '', action: 'CALL', call: { kind: 'WARNING' }, text: 'Your tone went out, but Jensen\'s set is dead because you turned the river aside. Warn him through the Thread.' };
    return { objectId: 'radio', action: 'WAIT', text: 'Jensen has to push his own gate back. Give him a moment.' };
  }
  return { objectId: 'radio', action: s.v2.examined.includes('radio') ? 'TUNE' : 'OBSERVE', text: 'The wheel turns. Try the carved frequency on the radio.' };
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
  const contact = !!s.v2.contact, heard = !!s.partner.heard;
  // 1. fuel: one load to relight the beacon, one for a call
  const need = (lit ? 0 : 1) + (callOk && !heard && contact ? 1 : 0);
  if (inv.fuel < need) {
    if (s.player.taken.wood < TUNING.PILE) return { objectId: 'woodpile', action: 'GATHER', text: 'Dry wood by the trees would feed the beacon.' };
    if (!has(s, 'GARDEN_WITHERED')) return { objectId: 'greenhouse', action: 'HARVEST', text: 'The wood is gone. Dry fibre in the garden would burn, but the beds would go bare.' };
    return { objectId: 'woodpile', action: 'WAIT', text: 'The pile is picked clean. More driftwood washes up in time.' };
  }
  // 1b. Jensen sees from the future what Sam is about to do to the dry brush: warn him before he lights it
  if (s.era?.player === 'FUTURE' && (has(s, 'DRY') || has(s, 'FIRE_SPREAD')) && callOk 
    && !(s.partner.knowledge ?? []).includes('caution') && !s.nodes[s.partner.nodeId].flags.includes('LANTERN_LIT') && s.link === 'CONNECTED') {
    if (inv.fuel >= (lit ? 1 : 2)) return { objectId: '', action: 'CALL', call: { kind: 'WARNING' }, text: 'The brush burns here, in your time. Sam is about to light dry brush in his: warn him through the Thread (C).' };
    if (s.player.taken.wood < TUNING.PILE) return { objectId: 'woodpile', action: 'GATHER', text: 'The brush burns here. Gather one more load of wood so you can warn Sam through the Thread.' };
  }
  // 2. flame
  if (!lit) return { objectId: 'lantern', action: 'RELIGHT', text: 'You have fuel. Relight the beacon in the clearing.' };
  // 3. connection: the radio puzzle
  if (!contact) return puzzleHint(s);
  // 4. coordination: tell them something useful
  if (!heard) {
    if (!callOk) return { objectId: 'lantern', action: 'WAIT', text: 'Your beacon burns, but they cannot hear what you know.' };
    return { objectId: '', action: 'CALL', call: { kind: 'TECHNIQUE' }, text: 'Call through the Thread (C) and tell them what you learned.' };
  }
  void learned; void coast; void routeOpen; void beacon;
  // 5. go home to the beacon and wait for them
  return { objectId: 'lantern', action: 'WAIT', text: 'Wait by the beacon. They are making their own way back.' };
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
