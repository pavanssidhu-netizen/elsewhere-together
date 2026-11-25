// Forest2 "Time-Lock Rooms" pure simulation. No Phaser/DOM/Math.random/Date.
// Decisions beyond the spec text (see also the report):
//  * A/B with nothing to do, blocked pushes, turning into walls: cost 0 and are never recorded as beats
//    (a blocked MOVE only turns the shroom to face that way, free). Probing is never punished.
//  * Crate push (A): the crate moves one tile, the shroom stays. A crate pushed onto a RIFT is swallowed
//    (both orders, so a crate can never dead-end a room); only FUTURE_FIRST sends Sap to the Past.
//  * Pin (B, FUTURE_FIRST only, max 3): targets the GAP tile you face (a "bridge promise", shown as BARK
//    during your loop) else the FLOOR/BARK tile you stand on. In PAST_FIRST B on the Future is a free NOTHING.
//  * Ghost clock vs beats: the ghost advances with beats SPENT; a sync refund lowers beats used but never
//    rewinds the ghost (view.ghost.beatIndex = clock, view.beat = beats used).
//  * FUTURE_FIRST: the real future = weather(Sam's FINAL Past), so the ghost is verified when the loop
//    resolves (ignition attempt, budget out, END_LOOP). A paradox then fails the attempt.
//  * A strained move needs 2 beats; with 1 beat left it is BLOCKED (cost 0).
import type {
  ActorView, Carry, Dir, FailReason, Input, Layer, Order, Pt, RoomId, Stage, StageOptions, StageStatus,
  StageView, TileKind, TileView, ViewEvent,
} from './api';
import { buildRoom, roomVariant, type RoomDef } from './rooms';

export type TileViewExt = TileView & { sap?: boolean };       // sap: Mineral Sap waiting on the Past RIFT tile
export type ViewEventExt = ViewEvent & { ghost?: boolean };   // produced by the replaying ghost

export const STANDARD_BUDGET = 20;
export const RELAXED_BUDGET = 26;

const DV: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const DIRS: Dir[] = ['N', 'E', 'S', 'W'];

/** Past -> Future weathering of a single tile kind. */
export function weather(k: TileKind): TileKind {
  switch (k) {
    case 'VINE': return 'DUST';
    case 'ROOTED': case 'SOIL': case 'ROOT_PLATE': case 'CONDUIT_P': case 'RIFT': return 'FLOOR';
    default: return k; // GAP, BARK, ROCK, BEACON, FLOOR, SAP_WELL keep their kind
  }
}

interface World {
  layer: Layer; w: number; h: number;
  kind: TileKind[][]; crate: boolean[][]; pin: boolean[][]; lit: boolean[][];
  well: number[][]; ruinUsed: boolean[][]; sapTaken: boolean; pinCount: number;
}
interface Actor { x: number; y: number; facing: Dir; carry: Carry }
type Op = { o: 'turn' | 'move'; dir: Dir } | { o: 'A' } | { o: 'B' } | { o: 'END' };
interface Rec { op: Op; cost: number }
interface StepFx { root?: boolean; charge?: boolean; rift?: Pt; sapTaken?: boolean; pinned?: Pt }
interface StepRes { events: ViewEventExt[]; cost: 0 | 1; op: Op | null; fx: StepFx; text?: string }

const grid = <T,>(w: number, h: number, f: () => T): T[][] => Array.from({ length: h }, () => Array.from({ length: w }, f));
const inb = (wd: World, x: number, y: number) => x >= 0 && y >= 0 && x < wd.w && y < wd.h;

function cloneWorld(s: World): World {
  return {
    ...s, kind: s.kind.map((r) => r.slice()), crate: s.crate.map((r) => r.slice()), pin: s.pin.map((r) => r.slice()),
    lit: s.lit.map((r) => r.slice()), well: s.well.map((r) => r.slice()), ruinUsed: s.ruinUsed.map((r) => r.slice()),
  };
}

function kindWalk(k: TileKind, layer: Layer): boolean {
  switch (k) {
    case 'FLOOR': case 'CONDUIT_P': case 'CONDUIT_F': case 'SOIL': case 'ROOTED': case 'VINE': case 'BARK':
    case 'ROOT_PLATE': case 'CONDUIT_PLATE': return true;
    case 'RIFT': return layer === 'FUTURE';
    default: return false;
  }
}
const walkable = (wd: World, x: number, y: number) => inb(wd, x, y) && !wd.crate[y][x] && kindWalk(wd.kind[y][x], wd.layer);

function newWorld(layer: Layer, room: RoomDef, kind: TileKind[][], crates: boolean[][]): World {
  return {
    layer, w: room.w, h: room.h, kind, crate: crates, pin: grid(room.w, room.h, () => false),
    lit: grid(room.w, room.h, () => false), well: grid(room.w, room.h, () => 0),
    ruinUsed: grid(room.w, room.h, () => false), sapTaken: false, pinCount: 0,
  };
}

/** Future map derived from a Past map plus the room's future overlay. */
export function buildFuture(room: RoomDef, past: TileKind[][]): { kind: TileKind[][]; crate: boolean[][] } {
  const kind: TileKind[][] = [], crate = grid(room.w, room.h, () => false);
  for (let y = 0; y < room.h; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < room.w; x++) {
      const pk = past[y][x];
      let k = weather(pk);
      if (k === 'FLOOR') {
        switch (room.futureOv[y][x]) {
          case '#': k = 'ROCK'; break; case 'f': k = 'CONDUIT_F'; break; case 'u': k = 'RUIN'; break;
          case 'c': k = 'CONDUIT_PLATE'; break; case 'r': k = 'RIFT'; break; case 'x': k = 'DUST'; break;
          case 'C': crate[y][x] = true; break;
        }
      }
      row.push(k);
    }
    kind.push(row);
  }
  return { kind, crate };
}

const clonePast = (room: RoomDef) => room.past.map((r) => r.slice());
const pastWorld = (room: RoomDef) => newWorld('PAST', room, clonePast(room), grid(room.w, room.h, () => false));
function futureWorld(room: RoomDef, past: TileKind[][]): World {
  const f = buildFuture(room, past);
  return newWorld('FUTURE', room, f.kind, f.crate);
}

interface StepCtx { pinsAllowed: boolean; sapReady: boolean }

function step(wd: World, a: Actor, inp: Input, ctx: StepCtx): StepRes {
  const ev: ViewEventExt[] = [];
  const res = (cost: 0 | 1, op: Op | null, fx: StepFx = {}, text?: string): StepRes => ({ events: ev, cost, op, fx, text });
  const here = { x: a.x, y: a.y };
  const [fdx, fdy] = DV[a.facing];
  const fx_ = a.x + fdx, fy_ = a.y + fdy;
  const e = (kind: ViewEvent['kind'], at: Pt | undefined, sfx?: ViewEvent['sfx'], text?: string) =>
    ev.push({ kind, at, beat: 0, sfx, text });
  if (inp.t === 'END_LOOP') return res(0, { o: 'END' });
  if (inp.t === 'MOVE') {
    const [dx, dy] = DV[inp.dir];
    const nx = a.x + dx, ny = a.y + dy;
    if (walkable(wd, nx, ny)) {
      a.x = nx; a.y = ny; a.facing = inp.dir;
      e('MOVED', { x: nx, y: ny }, 'step');
      return res(1, { o: 'move', dir: inp.dir });
    }
    const turned = a.facing !== inp.dir;
    a.facing = inp.dir;
    e('BLOCKED', { x: nx, y: ny });
    return res(0, turned ? { o: 'turn', dir: inp.dir } : null);
  }
  const nothing = () => { e('NOTHING', here); return res(0, null); };
  const curK = wd.kind[a.y][a.x];
  const facingIn = inb(wd, fx_, fy_);
  const fk: TileKind | null = facingIn ? wd.kind[fy_][fx_] : null;
  const fpt = { x: fx_, y: fy_ };
  if (wd.layer === 'PAST') {
    if (inp.t === 'A') {
      if (curK === 'VINE' && a.carry === 'SAP') {
        wd.kind[a.y][a.x] = 'BARK'; a.carry = 'NONE'; e('COATED', here, 'coat'); return res(1, { o: 'A' });
      }
      if (curK === 'SOIL') { wd.kind[a.y][a.x] = 'ROOTED'; e('PLANTED', here, 'plant'); return res(1, { o: 'A' }); }
      if (curK === 'ROOT_PLATE' && !wd.lit[a.y][a.x]) {
        wd.lit[a.y][a.x] = true; e('ROOT_LIT', here, 'root'); return res(1, { o: 'A' }, { root: true });
      }
      if (fk === 'SAP_WELL' && a.carry === 'NONE' && wd.well[fy_][fx_] < 2) {
        wd.well[fy_][fx_]++; a.carry = 'SAP'; e('SAP_TAKEN', fpt, 'sap'); return res(1, { o: 'A' });
      }
      if (fk === 'RIFT' && a.carry === 'NONE' && ctx.sapReady && !wd.sapTaken) {
        wd.sapTaken = true; a.carry = 'SAP'; e('SAP_TAKEN', fpt, 'sap', 'Sap from the future'); return res(1, { o: 'A' }, { sapTaken: true });
      }
      return nothing();
    }
    // B
    if (curK === 'ROOTED') {
      const grown: Pt[] = [];
      for (const d of DIRS) {
        const gx = a.x + DV[d][0], gy = a.y + DV[d][1];
        if (inb(wd, gx, gy) && wd.kind[gy][gx] === 'GAP') { wd.kind[gy][gx] = 'VINE'; grown.push({ x: gx, y: gy }); }
      }
      if (grown.length) {
        e('PULSED', here, 'pulse');
        for (const g of grown) e('VINE_GREW', g, 'pulse');
        return res(1, { o: 'B' });
      }
    }
    return nothing();
  }
  // FUTURE
  if (inp.t === 'A') {
    if (curK === 'CONDUIT_PLATE' && a.carry === 'CHARGE' && !wd.lit[a.y][a.x]) {
      wd.lit[a.y][a.x] = true; a.carry = 'NONE'; e('CHARGE_LIT', here, 'discharge'); return res(1, { o: 'A' }, { charge: true });
    }
    if (facingIn && wd.crate[fy_][fx_]) {
      const bx = fx_ + fdx, by = fy_ + fdy;
      if (inb(wd, bx, by) && !wd.crate[by][bx] && (wd.kind[by][bx] === 'FLOOR' || wd.kind[by][bx] === 'BARK' || wd.kind[by][bx] === 'RIFT')) {
        wd.crate[fy_][fx_] = false;
        if (wd.kind[by][bx] === 'RIFT') {
          e('RIFT_SENT', { x: bx, y: by }, 'rift'); return res(1, { o: 'A' }, { rift: { x: bx, y: by } });
        }
        wd.crate[by][bx] = true; e('CRATE_PUSHED', { x: bx, y: by }, 'push'); return res(1, { o: 'A' });
      }
      e('BLOCKED', fpt, undefined, 'The crate will not budge'); return res(0, null);
    }
    if (fk === 'RUIN' && a.carry === 'NONE' && !wd.ruinUsed[fy_][fx_]) {
      wd.ruinUsed[fy_][fx_] = true; a.carry = 'CHARGE'; e('CHARGE_TAKEN', fpt, 'charge'); return res(1, { o: 'A' });
    }
    return nothing();
  }
  // B on the Future: Blueprint Pin (promises only matter in FUTURE_FIRST)
  if (ctx.pinsAllowed && wd.pinCount < 3) {
    if (facingIn && fk === 'GAP' && !wd.pin[fy_][fx_]) {
      wd.pin[fy_][fx_] = true; wd.pinCount++; wd.kind[fy_][fx_] = 'BARK';
      e('PIN_DROPPED', fpt, 'pin'); return res(1, { o: 'B' }, { pinned: fpt });
    }
    if ((curK === 'FLOOR' || curK === 'BARK') && !wd.pin[a.y][a.x]) {
      wd.pin[a.y][a.x] = true; wd.pinCount++;
      e('PIN_DROPPED', here, 'pin'); return res(1, { o: 'B' }, { pinned: here });
    }
  }
  return nothing();
}

const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

interface TraceEnt { x: number; y: number; facing: Dir; carry: Carry }
interface Phase1Out {
  trace: TraceEnt[]; pins: Pt[]; rootBeat: number | null; chargeBeat: number | null; riftBeat: number | null;
  riftBeats: ViewEventExt[][]; // events per beat (index = beat, 1-based; [0] unused)
  pastKinds: TileKind[][];     // final Past (PAST_FIRST only)
}
interface Loop {
  world: World; actor: Actor; used: number; clock: number; recs: Rec[];
  ownRoot: boolean; ownCharge: boolean; syncUsed: boolean; mult: number; sym: number; strained: boolean;
  sapAnnounced: boolean; lastEvents: ViewEventExt[];
}

/** `lean` (tests/bots only): skip hints and the Peek overlay in views; outcomes are identical. */
export function createStage(roomId: RoomId, order: Order, seed: number, opts: StageOptions & { lean?: boolean }): Stage {
  const room = buildRoom(roomId, roomVariant(seed));
  const budget = opts.relaxed ? RELAXED_BUDGET : STANDARD_BUDGET;
  const p1Layer: Layer = order === 'PAST_FIRST' ? 'PAST' : 'FUTURE';
  const p2Layer: Layer = p1Layer === 'PAST' ? 'FUTURE' : 'PAST';
  const roomInfo = { id: room.id, w: room.w, h: room.h, name: room.name };

  let status: StageStatus = 'PLAYING';
  let failReason: FailReason | undefined; let failText: string | undefined;
  let phase: 1 | 2 = 1;
  let p1: Loop, p2: Loop | null = null;
  let p1out: Phase1Out | null = null;
  let paradoxBeat: number | null = null;
  let finalScore = { base: 0, efficiency: 0 };
  let lastPhase1Recs: Rec[] = [];

  const startActor = (layer: Layer): Actor => {
    const s = layer === 'PAST' ? room.startPast : room.startFuture;
    return { x: s.x, y: s.y, facing: room.startFacing, carry: 'NONE' };
  };
  const newLoop = (world: World, layer: Layer): Loop => ({
    world, actor: startActor(layer), used: 0, clock: 0, recs: [], ownRoot: false, ownCharge: false,
    syncUsed: false, mult: 1, sym: 0, strained: false, sapAnnounced: false, lastEvents: [],
  });
  const initPhase1 = () => {
    p1 = newLoop(p1Layer === 'PAST' ? pastWorld(room) : futureWorld(room, clonePast(room)), p1Layer);
    p1trace = [{ ...startTrace(p1.actor) }];
    p1riftBeat = null; p1root = null; p1charge = null; p1evs = [[]];
    status = 'PLAYING'; failReason = undefined; failText = undefined; phase = 1; p2 = null; p1out = null; paradoxBeat = null;
  };
  let p1trace: TraceEnt[] = [];
  let p1riftBeat: number | null = null, p1root: number | null = null, p1charge: number | null = null;
  let p1evs: ViewEventExt[][] = [[]];
  const startTrace = (a: Actor): TraceEnt => ({ x: a.x, y: a.y, facing: a.facing, carry: a.carry });

  const ghostIdx = () => (p1out ? Math.min(p2 ? p2.clock : 0, p1out.trace.length - 1) : 0);
  const ghostAt = (clock: number): TraceEnt => {
    const t = p1out!.trace;
    let i = Math.min(clock, t.length - 1);
    if (paradoxBeat !== null) i = Math.min(i, paradoxBeat - 1);
    return t[i];
  };
  const ghostLit = (clock: number) => {
    if (!p1out) return { root: false, charge: false };
    return {
      root: order === 'PAST_FIRST' && p1out.rootBeat !== null && clock >= p1out.rootBeat,
      charge: order === 'FUTURE_FIRST' && p1out.chargeBeat !== null && clock >= p1out.chargeBeat,
    };
  };
  const sapReady = (lp: Loop) =>
    order === 'FUTURE_FIRST' && phase === 2 && !!p1out && p1out.riftBeat !== null && !lp.world.sapTaken && lp.clock + 1 >= p1out.riftBeat;

  const conduitOK = (lp: Loop, layer: Layer) => {
    const c = layer === 'PAST' ? room.conduitP : room.conduitF;
    return lp.actor.x === c.x && lp.actor.y === c.y;
  };
  const sockets = () => {
    if (phase === 1 || !p2) return { root: p1root !== null && p1Layer === 'PAST' ? true : false, charge: p1charge !== null && p1Layer === 'FUTURE', ignition: false };
    const g = ghostLit(p2.clock);
    return { root: g.root || p2.ownRoot, charge: g.charge || p2.ownCharge, ignition: status === 'CLEARED' };
  };
  const ignitionCandidate = (lp: Loop) => {
    const s = sockets();
    if (!s.root || !s.charge) return false;
    if (!conduitOK(lp, p2Layer)) return false;
    const g = ghostAt(lp.clock);
    const gc = p1Layer === 'PAST' ? room.conduitP : room.conduitF;
    return g.x === gc.x && g.y === gc.y;
  };

  // ---- ghost verification on the REAL future (FUTURE_FIRST) ----
  function verifyGhost(pastKinds: TileKind[][]): { beat: number; text: string } | null {
    const wd = futureWorld(room, pastKinds);
    const a = startActor('FUTURE');
    let beat = 0;
    for (const r of p1.recs) {
      const op = r.op;
      if (op.o === 'END' || op.o === 'B') { if (op.o === 'B') beat += 1; continue; }
      if (op.o === 'turn') { a.facing = op.dir; continue; }
      beat += 1;
      if (op.o === 'move') {
        const nx = a.x + DV[op.dir][0], ny = a.y + DV[op.dir][1];
        if (!walkable(wd, nx, ny)) {
          const k = inb(wd, nx, ny) ? wd.kind[ny][nx] : 'ROCK';
          const text = k === 'DUST'
            ? `Paradox: the vine at (${nx},${ny}) turned to dust before Jensen crossed it (beat ${beat}).`
            : k === 'GAP'
              ? `Paradox: the gap at (${nx},${ny}) was never bridged, but Jensen crossed it at beat ${beat}.`
              : wd.crate[ny]?.[nx]
                ? `Paradox: a crate stood at (${nx},${ny}) when Jensen stepped there at beat ${beat}.`
                : `Paradox: Jensen could not step onto (${nx},${ny}) at beat ${beat}.`;
          return { beat, text };
        }
        a.x = nx; a.y = ny; a.facing = op.dir;
      } else {
        const r2 = step(wd, a, { t: 'A' }, { pinsAllowed: false, sapReady: false });
        if (r2.cost === 0) {
          const fx = a.x + DV[a.facing][0], fy = a.y + DV[a.facing][1];
          return { beat, text: `Paradox: Jensen's action at (${a.x},${a.y}) facing (${fx},${fy}) on beat ${beat} had nothing to act on in the real future.` };
        }
      }
    }
    return null;
  }

  // ---- phase transitions ----
  const finishPhase1 = (ev: ViewEventExt[], budgetOut: boolean) => {
    status = 'PHASE1_DONE';
    if (budgetOut) ev.push({ kind: 'BUDGET_OUT', beat: p1.used, text: 'Phase 1 budget spent' });
    ev.push({ kind: 'PHASE_DONE', beat: p1.used, sfx: 'lock', text: 'Time Lock' });
    lastPhase1Recs = p1.recs;
    p1out = {
      trace: p1trace, pins: pinList(p1.world), rootBeat: p1root, chargeBeat: p1charge, riftBeat: p1riftBeat,
      riftBeats: p1evs, pastKinds: p1Layer === 'PAST' ? p1.world.kind.map((r) => r.slice()) : clonePast(room),
    };
  };
  const pinList = (wd: World): Pt[] => {
    const out: Pt[] = [];
    for (let y = 0; y < wd.h; y++) for (let x = 0; x < wd.w; x++) if (wd.pin[y][x]) out.push({ x, y });
    return out;
  };

  function applyPhase1(inp: Input): ViewEventExt[] {
    if (inp.t === 'END_LOOP') {
      p1.recs.push({ op: { o: 'END' }, cost: 0 });
      const ev: ViewEventExt[] = [];
      finishPhase1(ev, false);
      return ev;
    }
    const r = step(p1.world, p1.actor, inp, { pinsAllowed: order === 'FUTURE_FIRST', sapReady: false });
    const ev = r.events;
    if (r.op) p1.recs.push({ op: r.op, cost: r.cost });
    if (r.cost === 1) {
      p1.used++; p1.clock++;
      for (const x of ev) x.beat = p1.used;
      p1trace.push(startTrace(p1.actor)); p1evs.push(ev.slice());
      if (r.fx.root && p1root === null) p1root = p1.used;
      if (r.fx.charge && p1charge === null) p1charge = p1.used;
      if (r.fx.rift && p1riftBeat === null && order === 'FUTURE_FIRST') p1riftBeat = p1.used;
      if (r.fx.rift && order === 'PAST_FIRST') ev[0].text = 'The rift swallows the crate. Nothing answers in the Past.';
      if (r.fx.root) p1.ownRoot = true;
      if (r.fx.charge) p1.ownCharge = true;
      if (p1.used >= budget) finishPhase1(ev, true);
    } else {
      for (const x of ev) x.beat = p1.used;
      if (r.op && r.op.o === 'turn') p1trace[p1trace.length - 1] = startTrace(p1.actor);
    }
    return ev;
  }

  function initPhase2(): Loop {
    const o = p1out!;
    const wd = order === 'PAST_FIRST' ? futureWorld(room, o.pastKinds) : pastWorld(room);
    if (order === 'FUTURE_FIRST') for (const p of o.pins) { wd.pin[p.y][p.x] = true; }
    return newLoop(wd, p2Layer);
  }

  function fail(reason: FailReason, text: string, ev: ViewEventExt[]) {
    status = 'FAILED'; failReason = reason; failText = text;
    ev.push({ kind: reason === 'PARADOX' ? 'PARADOX' : 'BUDGET_OUT', beat: p2!.used, sfx: reason === 'PARADOX' ? 'paradox' : undefined, text });
  }

  /** Resolve the phase-2 loop. mode: 'ignite' (candidate satisfied), 'end' (END_LOOP), 'budget'. */
  function resolve(mode: 'ignite' | 'end' | 'budget', ev: ViewEventExt[]) {
    const lp = p2!;
    if (order === 'FUTURE_FIRST') {
      const bad = verifyGhost(lp.world.kind);
      if (bad) { paradoxBeat = bad.beat; fail('PARADOX', bad.text, ev); return; }
    }
    if (mode === 'ignite') {
      status = 'CLEARED';
      const spare = Math.max(0, STANDARD_BUDGET - lp.used);
      finalScore = { base: order === 'PAST_FIRST' ? 1250 : 1000, efficiency: 150 * spare };
      ev.push({ kind: 'IGNITION', beat: lp.used, sfx: 'ignite', text: 'Dual ignition!' });
      return;
    }
    if (mode === 'end') fail('NO_IGNITION', 'The Beacon never lit: the loop ended before both shrooms stood on their conduits together.', ev);
    else fail('BUDGET', 'Out of beats: the Beacon never lit.', ev);
  }

  function applyPhase2(inp: Input): ViewEventExt[] {
    const lp = p2!;
    const ev: ViewEventExt[] = [];
    if (inp.t === 'END_LOOP') {
      lp.recs.push({ op: { o: 'END' }, cost: 0 });
      resolve(ignitionCandidate(lp) ? 'ignite' : 'end', ev);
      return ev;
    }
    const g0 = ghostAt(lp.clock);
    const strainedBefore = dist(lp.actor, g0) > 4;
    const ctx: StepCtx = { pinsAllowed: false, sapReady: sapReady(lp) };
    if (inp.t === 'MOVE' && strainedBefore && budget - lp.used < 2) {
      const probe = step(cloneWorld(lp.world), { ...lp.actor }, inp, ctx);
      if (probe.cost > 0) return [{ kind: 'BLOCKED', beat: lp.used, text: 'Strained tether: a step needs 2 beats' }];
    }
    const r = step(lp.world, lp.actor, inp, ctx);
    ev.push(...r.events);
    if (r.op) lp.recs.push({ op: r.op, cost: r.cost });
    if (r.cost === 0) { for (const x of ev) x.beat = lp.used; return ev; }
    const cost = inp.t === 'MOVE' && strainedBefore ? 2 : 1;
    const oldClock = lp.clock;
    lp.used += cost; lp.clock += cost;
    lp.recs[lp.recs.length - 1].cost = cost;
    for (const x of ev) x.beat = lp.used;
    if (cost === 2) ev.push({ kind: 'STRAINED', beat: lp.used, sfx: 'strain', text: 'Tether strained: that step cost 2 beats' });
    if (r.fx.root) lp.ownRoot = true;
    if (r.fx.charge) lp.ownCharge = true;
    // ghost events for the beats just elapsed
    const o = p1out!;
    for (let b = oldClock + 1; b <= lp.clock && b < o.riftBeats.length; b++) {
      if (paradoxBeat !== null && b >= paradoxBeat) break;
      for (const x of o.riftBeats[b]) if (x.kind !== 'MOVED' && x.kind !== 'BLOCKED') ev.push({ ...x, ghost: true });
    }
    if (order === 'FUTURE_FIRST' && o.riftBeat !== null && !lp.sapAnnounced && lp.clock >= o.riftBeat - 1 && room.riftP) {
      lp.sapAnnounced = true;
      ev.push({ kind: 'SAP_ARRIVED', at: room.riftP, beat: lp.used, sfx: 'rift', text: 'Sap arrives from the future' });
    }
    const g1 = ghostAt(lp.clock);
    const d1 = dist(lp.actor, g1);
    const strainedAfter = d1 > 4;
    if (strainedAfter !== strainedBefore && cost === 1) ev.push({ kind: strainedAfter ? 'STRAINED' : 'RELAXED', beat: lp.used, sfx: strainedAfter ? 'strain' : undefined });
    else if (strainedBefore && !strainedAfter) ev.push({ kind: 'RELAXED', beat: lp.used });
    lp.strained = strainedAfter;
    if (d1 === 1 && !lp.syncUsed) {
      lp.syncUsed = true; lp.mult = Math.min(3, lp.mult + 1); lp.used = Math.max(0, lp.used - 1);
      ev.push({ kind: 'SYNC_BOOST', at: { x: lp.actor.x, y: lp.actor.y }, beat: lp.used, sfx: 'sync', text: `Sync boost x${lp.mult}, +1 beat` });
    }
    if (d1 <= 1) lp.sym += 200 * lp.mult;
    if (ignitionCandidate(lp)) { resolve('ignite', ev); return ev; }
    if (lp.used >= budget) resolve('budget', ev);
    return ev;
  }

  // ---- views ----
  const tileViews = (wd: World, extra?: (x: number, y: number, t: TileViewExt) => void): TileViewExt[][] =>
    wd.kind.map((row, y) => row.map((k, x) => {
      const t: TileViewExt = { kind: k };
      if (wd.pin[y][x]) t.pinned = true;
      if (wd.crate[y][x]) t.crate = true;
      if (wd.lit[y][x]) t.lit = true;
      if (extra) extra(x, y, t);
      return t;
    }));

  const futurePrediction = (pastKinds: TileKind[][]): TileViewExt[][] => {
    const f = futureWorld(room, pastKinds);
    return tileViews(f, (x, y, t) => { if (pastKinds[y][x] === 'VINE') t.weathering = true; });
  };

  const hintFor = (): { a: string; b: string } => {
    const lp = phase === 1 ? p1 : p2;
    if (opts.lean || !lp || status !== 'PLAYING') return { a: '', b: '' };
    const lab = (i: Input) => {
      const r = step(cloneWorld(lp.world), { ...lp.actor }, i, { pinsAllowed: phase === 1 && order === 'FUTURE_FIRST', sapReady: phase === 2 && sapReady(lp) });
      const k = r.events[0]?.kind;
      switch (k) {
        case 'PLANTED': return 'PLANT'; case 'COATED': return 'COAT'; case 'ROOT_LIT': return 'POWER ROOTS';
        case 'SAP_TAKEN': return 'TAKE SAP'; case 'PULSED': return 'PULSE'; case 'CHARGE_TAKEN': return 'ABSORB';
        case 'CHARGE_LIT': return 'DISCHARGE'; case 'CRATE_PUSHED': case 'RIFT_SENT': return 'PUSH'; case 'PIN_DROPPED': return 'PIN';
        default: return '';
      }
    };
    return { a: lab({ t: 'A' }), b: lab({ t: 'B' }) };
  };

  const actorView = (a: TraceEnt, layer: Layer, wd?: World): ActorView => {
    const c = layer === 'PAST' ? room.conduitP : room.conduitF;
    return { pos: { x: a.x, y: a.y }, carry: a.carry, facing: a.facing, onConduit: a.x === c.x && a.y === c.y };
  };

  const buildView = (events: ViewEventExt[]): StageView => {
    const lp = phase === 1 ? p1 : p2!;
    const role = phase === 1 ? p1Layer : p2Layer;
    const map = tileViews(lp.world);
    let other: TileViewExt[][];
    if (opts.lean) other = map;
    else if (phase === 1) {
      other = order === 'PAST_FIRST'
        ? futurePrediction(p1.world.kind)
        : tileViews(pastWorld(room), (x, y, t) => { if (p1.world.pin[y][x]) t.pinned = true; });
    } else if (order === 'PAST_FIRST') {
      other = tileViews(pastWorldFrom(p1out!.pastKinds));
    } else {
      other = futurePrediction(lp.world.kind);
    }
    if (order === 'FUTURE_FIRST' && phase === 2 && room.riftP && p1out!.riftBeat !== null && !lp.world.sapTaken && lp.clock >= p1out!.riftBeat - 1) {
      map[room.riftP.y][room.riftP.x].sap = true;
    }
    const me = actorView(startTrace(lp.actor), role);
    let ghost: StageView['ghost'] = null;
    let tether: StageView['tether'] = null;
    if (phase === 2 && p1out) {
      const g = ghostAt(lp.clock);
      const gp = p1out.trace.slice(0, paradoxBeat !== null ? paradoxBeat : undefined).map((t) => ({ x: t.x, y: t.y }));
      ghost = { ...actorView(g, p1Layer), path: gp, beatIndex: Math.min(lp.clock, gp.length - 1) };
      const d = dist(lp.actor, g);
      tether = { dist: d, strained: d > 4, adjacent: d === 1 };
    }
    const sc = status === 'CLEARED' ? finalScore : { base: 0, efficiency: 0 };
    const sym = phase === 2 ? lp.sym : 0;
    return {
      room: roomInfo, order, phase, role, status, failReason, failText,
      beat: lp.used, budget, map, other, me, ghost, sockets: sockets(), tether,
      pins: phase === 1 ? pinList(p1.world) : (p1out ? p1out.pins : []),
      syncBoostUsed: phase === 2 ? lp.syncUsed : false,
      score: { total: sc.base + sc.efficiency + sym, base: sc.base, efficiency: sc.efficiency, symbiosis: sym, multiplier: phase === 2 ? lp.mult : 1 },
      hints: hintFor(), events, doomed: status === 'FAILED',
    };
  };
  const pastWorldFrom = (kinds: TileKind[][]): World => newWorld('PAST', room, kinds.map((r) => r.slice()), grid(room.w, room.h, () => false));

  let lastEvents: ViewEventExt[] = [];
  initPhase1();

  const stage: Stage = {
    view: () => buildView(lastEvents),
    input(i: Input): StageView {
      if (status === 'PLAYING') {
        try {
          lastEvents = phase === 1 ? applyPhase1(i) : applyPhase2(i);
        } catch (err) {
          lastEvents = [{ kind: 'BLOCKED', beat: 0, text: 'Rejected input' }];
        }
      } else {
        lastEvents = [{ kind: 'BLOCKED', beat: phase === 1 ? p1.used : p2 ? p2.used : 0, text: 'The loop is over' }];
      }
      return buildView(lastEvents);
    },
    resetPhase(): StageView {
      if (status === 'CLEARED' || status === 'FAILED') return buildView(lastEvents);
      lastEvents = [];
      if (phase === 1) initPhase1();
      else { p2 = initPhase2(); paradoxBeat = null; }
      return buildView(lastEvents);
    },
    beginPhase2(): StageView {
      if (status !== 'PHASE1_DONE') return buildView(lastEvents);
      phase = 2; status = 'PLAYING'; p2 = initPhase2(); lastEvents = [];
      return buildView(lastEvents);
    },
    recording() {
      const map = (recs: Rec[]): Input[] => recs.map((r): Input =>
        r.op.o === 'turn' || r.op.o === 'move' ? { t: 'MOVE', dir: r.op.dir }
          : r.op.o === 'A' ? { t: 'A' } : r.op.o === 'B' ? { t: 'B' } : { t: 'END_LOOP' });
      return { phase1: map(phase === 2 ? lastPhase1Recs : p1.recs), phase2: p2 ? map(p2.recs) : [] };
    },
  };
  return stage;
}

/** Cheap read of how many pins/rooms etc. for tests. */
export function stageRoom(roomId: RoomId, seed: number): RoomDef { return buildRoom(roomId, roomVariant(seed)); }
