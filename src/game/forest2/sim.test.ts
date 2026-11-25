import { describe, expect, it } from 'vitest';
import type { Input, Order, RoomId, StageView } from './api';
import { createStage, weather, type TileViewExt } from './sim';
import { referenceSolution } from './solutions';
import { buildRoom, roomVariant, ROOMS } from './rooms';
import { mulberry32 } from '../../shared/rng';
import { feed, mv, ORDERS, ROOM_IDS, runRef, seedForVariant, variantSeeds } from './helpers';

const S0 = seedForVariant(0);
const fresh = (room: RoomId, order: Order, relaxed = false, seed = S0) => createStage(room, order, seed, { relaxed });
const p2 = (room: RoomId, order: Order, p1: Input[], seed = S0) => {
  const s = fresh(room, order, false, seed);
  feed(s, p1);
  if (s.view().status === 'PLAYING') s.input({ t: 'END_LOOP' });
  s.beginPhase2();
  return s;
};
const L: Input = { t: 'END_LOOP' };
const A: Input = { t: 'A' };
const B: Input = { t: 'B' };

describe('rooms', () => {
  it('has three rooms of 6/7/8 and 4 distinct variants', () => {
    expect(ROOMS.map((r) => r.w)).toEqual([6, 7, 8]);
    expect(variantSeeds().length).toBe(4);
    for (const r of ROOM_IDS) {
      const base = buildRoom(r, 0), f = buildRoom(r, 1);
      expect(f.conduitP.x).toBe(base.w - 1 - base.conduitP.x);
      expect(f.conduitP.y).toBe(base.conduitP.y);
    }
  });
});

describe('reference solutions', () => {
  it('clear every room/order/variant with >= 2 spare beats (table printed)', () => {
    const rows: string[] = [];
    for (const room of ROOM_IDS) for (const order of ORDERS) {
      const spares: number[] = [];
      for (const seed of variantSeeds()) {
        const r = runRef(room, order, seed);
        expect(r.v.status, `${room} ${order} v${roomVariant(seed)} ${r.v.failText}`).toBe('CLEARED');
        expect(r.spare).toBeGreaterThanOrEqual(2);
        spares.push(r.spare);
      }
      rows.push(`room ${room} ${order.padEnd(12)} spare beats per variant: ${spares.join(', ')}`);
    }
    console.log(rows.join('\n'));
  });
  it('clear with the relaxed budget too', () => {
    for (const room of ROOM_IDS) for (const order of ORDERS) expect(runRef(room, order, S0, true).v.status).toBe('CLEARED');
  });
  it('PAST_FIRST references plant+pulse+sap+coat; FUTURE_FIRST ones pin', () => {
    const pf = runRef(2, 'PAST_FIRST', S0).s.recording().phase1.filter((i) => i.t === 'B').length;
    expect(pf).toBeGreaterThan(0);
    expect(runRef(2, 'FUTURE_FIRST', S0).v.pins.length).toBe(1);
    expect(runRef(3, 'FUTURE_FIRST', S0).v.pins.length).toBe(2);
  });
});

describe('failure modes', () => {
  it('do-nothing and immediate END_LOOP fail', () => {
    for (const room of ROOM_IDS) for (const order of ORDERS) {
      const s = fresh(room, order);
      expect(s.input(L).status).toBe('PHASE1_DONE');
      s.beginPhase2();
      const v = s.input(L);
      expect(v.status).toBe('FAILED');
    }
  });
  it('FUTURE_FIRST with an unbuilt Past is a PARADOX with a clear text', () => {
    for (const room of ROOM_IDS) {
      const sol = referenceSolution(room, 'FUTURE_FIRST', S0);
      const s = p2(room, 'FUTURE_FIRST', sol.phase1);
      const v = s.input(L);
      expect(v.status).toBe('FAILED');
      expect(v.failReason).toBe('PARADOX');
      expect(v.failText).toMatch(/Paradox: .*\(\d+,\d+\).*beat \d+/);
      expect(v.doomed).toBe(true);
    }
  });
  it('an uncoated vine turns to dust: paradox names the vine', () => {
    const sol = referenceSolution(1, 'FUTURE_FIRST', S0);
    const s = p2(1, 'FUTURE_FIRST', sol.phase1);
    // Sam plants and pulses but never coats
    const v = feed(s, [...mv('W'), A, ...mv('N', 'N', 'N'), A, ...mv('S', 'S', 'E'), A, B, L]);
    expect(v.failReason).toBe('PARADOX');
    expect(v.failText).toContain('vine at (3,2) turned to dust');
  });
  it('random bot clears < 3% (1000 runs per room/order)', () => {
    for (const room of ROOM_IDS) for (const order of ORDERS) {
      const rnd = mulberry32(room * 100 + (order === 'PAST_FIRST' ? 1 : 2));
      let wins = 0;
      for (let n = 0; n < 1000; n++) {
        const s = createStage(room, order, Math.floor(rnd() * 1e6), { relaxed: false, lean: true });
        const roll = (): Input => {
          const r = rnd();
          if (r < 0.7) return { t: 'MOVE', dir: (['N', 'E', 'S', 'W'] as const)[Math.floor(rnd() * 4)] };
          return r < 0.86 ? A : r < 0.94 ? B : L;
        };
        let v = s.view();
        for (let k = 0; k < 60 && v.status === 'PLAYING'; k++) v = s.input(roll());
        if (v.status === 'PHASE1_DONE') {
          s.beginPhase2();
          for (let k = 0; k < 60 && v.status !== 'CLEARED' && v.status !== 'FAILED'; k++) v = s.input(roll());
        }
        if (v.status === 'CLEARED') wins++;
      }
      console.log(`random bot room ${room} ${order}: ${wins}/1000 cleared`);
      expect(wins / 1000, `room ${room} ${order}`).toBeLessThan(0.03);
    }
  });
});

describe('mechanics', () => {
  it('weathering table', () => {
    expect(weather('GAP')).toBe('GAP');
    expect(weather('VINE')).toBe('DUST');
    expect(weather('BARK')).toBe('BARK');
    expect(weather('ROOTED')).toBe('FLOOR');
    expect(weather('SOIL')).toBe('FLOOR');
    expect(weather('ROCK')).toBe('ROCK');
    expect(weather('FLOOR')).toBe('FLOOR');
  });
  it('weathering applies to the real Future after phase 1 (PAST_FIRST)', () => {
    const sol = referenceSolution(1, 'PAST_FIRST', S0);
    const s = fresh(1, 'PAST_FIRST');
    feed(s, sol.phase1);
    const v = s.beginPhase2();
    expect(v.map[2][3].kind).toBe('BARK'); // coated vine survives
    expect(v.map[2][2].kind).toBe('FLOOR'); // rooted soil -> floor
  });
  it('beats: moves cost 1, blocked/no-op cost 0', () => {
    const s = fresh(1, 'PAST_FIRST');
    let v = s.input({ t: 'MOVE', dir: 'W' }); // well: blocked, turns
    expect(v.beat).toBe(0); expect(v.events[0].kind).toBe('BLOCKED'); expect(v.me.facing).toBe('W');
    v = s.input(B); expect(v.beat).toBe(0); expect(v.events[0].kind).toBe('NOTHING');
    v = s.input(A); expect(v.beat).toBe(1); expect(v.me.carry).toBe('SAP');
    v = s.input(A); expect(v.beat).toBe(1); expect(v.events[0].kind).toBe('NOTHING');
    v = s.input({ t: 'MOVE', dir: 'N' }); expect(v.beat).toBe(2);
    expect(v.hints.a).toBe('');
  });
  it('budget 20 normal / 26 relaxed; phase 1 ends in PHASE1_DONE', () => {
    const wander: Input[] = Array.from({ length: 40 }, (_, i) => ({ t: 'MOVE', dir: i % 2 ? 'S' : 'N' }));
    let s = fresh(1, 'PAST_FIRST'); let v = feed(s, wander);
    expect(v.status).toBe('PHASE1_DONE'); expect(v.beat).toBe(20); expect(v.budget).toBe(20);
    s = fresh(1, 'PAST_FIRST', true); v = feed(s, wander.slice(0, 22));
    expect(v.status).toBe('PLAYING'); expect(v.budget).toBe(26);
    v = feed(s, wander); expect(v.status).toBe('PHASE1_DONE'); expect(v.beat).toBe(26);
  });
  it('illegal inputs never throw or cost beats; finished stage rejects input', () => {
    const s = fresh(1, 'PAST_FIRST');
    s.input(L);
    const v = s.input({ t: 'MOVE', dir: 'N' });
    expect(v.events[0].kind).toBe('BLOCKED');
    expect(() => s.input({ t: 'MOVE', dir: 'X' as never })).not.toThrow();
  });
  it('pins are promises: a pin lets Jensen cross a gap in his loop; without it he is blocked', () => {
    const s = fresh(1, 'FUTURE_FIRST');
    feed(s, mv('N', 'N', 'W')); feed(s, [A]);
    feed(s, mv('S', 'E', 'E'));
    let v = s.input({ t: 'MOVE', dir: 'E' });
    expect(v.me.pos).toEqual({ x: 2, y: 2 }); // blocked by the gap, only turned
    expect(v.hints.b).toBe('PIN');
    v = s.input(B);
    expect(v.pins).toEqual([{ x: 3, y: 2 }]);
    expect(v.map[2][3].kind).toBe('BARK'); expect(v.map[2][3].pinned).toBe(true);
    v = s.input({ t: 'MOVE', dir: 'E' });
    expect(v.me.pos).toEqual({ x: 3, y: 2 });
  });
  it('max 3 pins', () => {
    const s = fresh(1, 'FUTURE_FIRST');
    let v = feed(s, [B]); // pin on current floor
    v = feed(s, mv('N')); v = s.input(B); v = feed(s, mv('N')); v = s.input(B);
    v = feed(s, mv('N')); v = s.input(B);
    expect(v.pins.length).toBe(3);
  });
  it('tether: strain only in phase 2, doubles move cost, relaxes within 4', () => {
    const sol = referenceSolution(1, 'PAST_FIRST', S0);
    const s0 = fresh(1, 'PAST_FIRST');
    expect(s0.view().tether).toBeNull();
    const s = p2(1, 'PAST_FIRST', sol.phase1);
    const costs: number[] = [];
    let sawStrain = false, sawRelax = false;
    const path = mv('S', 'S', 'E', 'E', 'N', 'N', 'N', 'N', 'W', 'N', 'N', 'W');
    for (const m of path) {
      const before = s.view();
      const strained = before.tether!.dist > 4;
      const after = s.input(m);
      if (after.beat === before.beat) continue; // free turn
      costs.push(after.beat - before.beat);
      expect(after.beat - before.beat, `strained=${strained}`).toBe(strained ? 2 : 1);
      if (strained) sawStrain = true; else if (sawStrain) sawRelax = true;
    }
    expect(sawStrain).toBe(true);
    expect(sawRelax).toBe(true);
    expect(costs).toContain(2); expect(costs).toContain(1);
  });
  it('sync boost refunds exactly once per loop and raises the multiplier', () => {
    const sol = referenceSolution(1, 'PAST_FIRST', S0);
    const s = p2(1, 'PAST_FIRST', sol.phase1);
    let v = s.input({ t: 'MOVE', dir: 'N' }); // ghost took sap and stands at start; adjacent
    expect(v.events.some((e) => e.kind === 'SYNC_BOOST')).toBe(true);
    expect(v.beat).toBe(0); expect(v.score.multiplier).toBe(2); expect(v.syncBoostUsed).toBe(true);
    expect(v.score.symbiosis).toBe(200 * 2);
    let boosts = 0;
    for (const m of mv('S', 'N', 'S', 'N', 'S')) { v = s.input(m); boosts += v.events.filter((e) => e.kind === 'SYNC_BOOST').length; }
    expect(boosts).toBe(0); expect(v.score.multiplier).toBe(2);
  });
  it('ignition needs the SAME beat; sockets alone are not enough', () => {
    const sol = referenceSolution(1, 'PAST_FIRST', S0);
    const s = p2(1, 'PAST_FIRST', sol.phase1);
    const early = sol.phase2.slice(0, 13); // Jensen reaches his conduit at clock 12; ghost not there yet
    let v = feed(s, early);
    expect(v.status).toBe('PLAYING');
    expect(v.me.onConduit).toBe(true);
    expect(v.sockets.root && v.sockets.charge).toBe(true);
    expect(v.ghost!.onConduit).toBe(false);
    v = feed(s, sol.phase2.slice(13));
    expect(v.status).toBe('CLEARED'); expect(v.sockets.ignition).toBe(true);
  });
  it('ghost replays beat-for-beat and holds its final position', () => {
    const sol = referenceSolution(1, 'PAST_FIRST', S0);
    const s = p2(1, 'PAST_FIRST', sol.phase1);
    const v0 = s.view();
    expect(v0.ghost!.path.length).toBe(16);
    let v = v0;
    for (let i = 0; i < 6; i++) { v = s.input({ t: 'MOVE', dir: i % 2 ? 'N' : 'S' }); }
    const last = v0.ghost!.path[15];
    // push the clock beyond the recording
    for (let i = 0; i < 12 && v.status === 'PLAYING'; i++) v = s.input({ t: 'MOVE', dir: i % 2 ? 'N' : 'S' });
    expect(v.ghost!.pos).toEqual(last);
  });
  it('rift: Sap arrives in the Past from the push beat (FUTURE_FIRST only)', () => {
    // crate push is beat 4 here
    const s = p2(2, 'FUTURE_FIRST', [...mv('S', 'N', 'N', 'E'), A]);
    let v = s.input({ t: 'MOVE', dir: 'E' });                  // clock 1, at (2,2)
    v = s.input({ t: 'MOVE', dir: 'S' });                       // turn toward the rift tile (2,3)
    expect((v.map[3][2] as TileViewExt).sap).toBeFalsy();
    v = s.input(A); expect(v.events[0].kind).toBe('NOTHING'); expect(v.me.carry).toBe('NONE');
    v = s.input({ t: 'MOVE', dir: 'W' }); v = s.input({ t: 'MOVE', dir: 'E' }); // clock 3
    v = s.input({ t: 'MOVE', dir: 'S' });
    expect((v.map[3][2] as TileViewExt).sap).toBe(true); expect(v.hints.a).toBe('TAKE SAP');
    v = s.input(A); expect(v.me.carry).toBe('SAP');
    // PAST_FIRST: the rift is inert
    const s2 = fresh(2, 'PAST_FIRST'); feed(s2, mv('E', 'S')); expect(s2.input(A).events[0].kind).toBe('NOTHING');
  });
  it('is deterministic (JSON-equal snapshots) and resetPhase restores the phase start', () => {
    for (const room of ROOM_IDS) for (const order of ORDERS) {
      const run = (): string[] => {
        const rnd = mulberry32(7 + room);
        const s = fresh(room, order);
        const snaps: string[] = [];
        let v: StageView = s.view();
        for (let k = 0; k < 300 && v.status !== 'CLEARED' && v.status !== 'FAILED'; k++) {
          if (v.status === 'PHASE1_DONE') v = s.beginPhase2();
          else {
            const r = rnd();
            v = s.input(r < 0.7 ? { t: 'MOVE', dir: (['N', 'E', 'S', 'W'] as const)[Math.floor(rnd() * 4)] } : r < 0.9 ? A : B);
          }
          snaps.push(JSON.stringify(v));
        }
        return snaps;
      };
      expect(run()).toEqual(run());
    }
    for (const room of ROOM_IDS) for (const order of ORDERS) {
      const sol = referenceSolution(room, order, S0);
      const s = fresh(room, order);
      const start1 = JSON.stringify(s.view());
      feed(s, sol.phase1.slice(0, 7));
      expect(JSON.stringify(s.resetPhase())).toBe(start1);
      feed(s, sol.phase1);
      if (s.view().status === 'PLAYING') s.input(L);
      const start2 = JSON.stringify(s.beginPhase2());
      feed(s, sol.phase2.slice(0, 6));
      expect(JSON.stringify(s.resetPhase())).toBe(start2);
      expect(s.recording().phase2.length).toBe(0);
      expect(s.recording().phase1.length).toBeGreaterThan(5);
      feed(s, sol.phase2);
      expect(s.view().status).toBe('CLEARED');
    }
  });
  it('replaying recording() reproduces the same result', () => {
    const r = runRef(3, 'FUTURE_FIRST', S0);
    const rec = r.s.recording();
    const s = fresh(3, 'FUTURE_FIRST');
    feed(s, rec.phase1);
    s.beginPhase2();
    const v = feed(s, rec.phase2);
    expect(v.status).toBe('CLEARED'); expect(v.score.total).toBe(r.v.score.total);
  });
  it('score: PAST_FIRST base x1.25, efficiency 150/beat, symbiosis counted', () => {
    const a = runRef(1, 'PAST_FIRST', S0).v, b = runRef(1, 'FUTURE_FIRST', S0).v;
    expect(a.score.base).toBe(1250); expect(b.score.base).toBe(1000);
    expect(a.score.efficiency).toBe(150 * (20 - a.beat));
    expect(a.score.total).toBe(a.score.base + a.score.efficiency + a.score.symbiosis);
  });
});
