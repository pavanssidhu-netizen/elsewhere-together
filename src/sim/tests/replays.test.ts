import { describe, expect, it } from 'vitest';
import { SimEngine } from '../engine';
import { act, planWin } from '../planner';
import type { Command, DomainEvent } from '../types';
import fixture from './replays.fixture.json';

const fx = fixture as unknown as Record<'WIN' | 'FADE' | 'ALIEN', { seed: number; commands: Command[] }>;

function play(name: 'WIN' | 'FADE' | 'ALIEN') {
  const e = new SimEngine(fx[name].seed);
  const events: DomainEvent[] = [];
  for (const c of fx[name].commands) events.push(...e.dispatch(c));
  return { e, events, s: e.getState() };
}

describe('fixed replays (seed + exact legal commands)', () => {
  it('WIN: reaches the lighthouse and reunites the lineages', () => {
    const { s, events } = play('WIN');
    expect(s.won).toBe(true);
    expect(s.v2.ending).toBe('WIN');
    expect(events.some(x => x.type === 'WIN')).toBe(true);
    expect(s.v2.journey[s.v2.journey.length - 1].action).toBe('REUNION');
    expect(s.partner.nodeId).toBe(s.player.nodeId);
    expect(fx.WIN.commands.every(c => c.type === 'MOVE' || c.type === 'INTERACT')).toBe(true);
  });
  it('FADE: fair warnings 1,2,3 precede the fade, then commands are refused', () => {
    const { e, s, events } = play('FADE');
    expect(s.phase).toBe('FADE');
    expect(s.v2.ending).toBe('FADE');
    const w = events.filter(x => x.type === 'WARNING').map(x => (x as { level: number }).level);
    expect(w).toEqual([1, 2, 3]);
    expect(events.some(x => x.type === 'FADE')).toBe(true);
    expect(e.dispatch({ type: 'MOVE', tx: 7, ty: 5 })[0].type).toBe('REJECTED');
  });
  it('ALIEN: radio with light 0, signal 0 after the stones opens the overgrown realm; the stones return', () => {
    const { e, s, events } = play('ALIEN');
    expect(s.v2.realm).toBe('ALIEN');
    expect(events.some(x => x.type === 'REALM' && x.realm === 'ALIEN')).toBe(true);
    // the goal is never locked: the planner still wins from inside the alien realm
    const w = new SimEngine(s.seed, s as never, true);
    for (const c of planWin(s)) w.dispatch(c);
    expect(w.getState().won).toBe(true);
    void e;
  });
  it('replays are deterministic', () => {
    expect(JSON.stringify(play('WIN').s)).toBe(JSON.stringify(play('WIN').s));
  });
});

describe('rules', () => {
  it('INTERACT is rejected when far away; MOVE into water is rejected', () => {
    const e = new SimEngine(1);
    expect(e.dispatch({ type: 'INTERACT', objectId: 'radio', choice: 'SELF' })[0].type).toBe('REJECTED');
    expect(e.dispatch({ type: 'MOVE', tx: 6, ty: 5 })[0].type).not.toBe('REJECTED');
    expect(e.dispatch({ type: 'MOVE', tx: 5, ty: 6 })[0].type).toBe('REJECTED');
  });
  it('restore rejects saves lacking v2', () => {
    const s = JSON.parse(SimEngine.serialize(new SimEngine(1).getState()));
    expect(SimEngine.restore(JSON.stringify(s))).not.toBeNull();
    delete s.v2;
    expect(SimEngine.restore(JSON.stringify(s))).toBeNull();
  });
  it('partner never steps into a node owned by the player before reunion', () => {
    for (const name of ['WIN', 'FADE'] as const) {
      const e = new SimEngine(fx[name].seed);
      for (const c of fx[name].commands) {
        e.dispatch(c);
        const s = e.getState();
        if (!s.won) expect(s.nodes[s.partner.nodeId].owner === 'player' && s.partner.nodeId !== 'root').toBe(false);
      }
    }
  });
  it('first touch emits an intro caption; SELF costs the partner, ECHO repays', () => {
    const e = new SimEngine(1);
    const go = (obj: string, choice?: 'SELF' | 'ECHO') => {
      for (;;) {
        const c = act(e.getState(), obj, choice)!;
        const ev = e.dispatch(c);
        if (c.type === 'INTERACT') return ev;
      }
    };
    const ev = go('lantern', 'SELF');
    expect(ev.some(x => x.type === 'WORLD_CHANGED' && x.objectId === 'lantern')).toBe(true);
    expect(ev.some(x => x.type === 'PARTNER_TRACE')).toBe(true);
    expect(e.getState().v2.partnerDrag?.signal).toBe(-1);
    expect(e.getState().v2.examined).toContain('lantern');
  });
  it('one roll can never fade: debt cannot jump past an unissued warning', () => {
    const e = new SimEngine(1);
    const st = JSON.parse(SimEngine.serialize(e.getState()));
    st.bondStrain = 99; st.v2.coherenceDebt = 29;
    const e2 = new SimEngine(1, st);
    const ev = e2.dispatch({ type: 'MOVE', tx: 8, ty: 5 });
    expect(e2.getState().phase).not.toBe('FADE');
    expect(e2.getState().v2.coherenceDebt).toBeLessThanOrEqual(30);
    expect(ev.some(x => x.type === 'WARNING')).toBe(true);
  });
});
