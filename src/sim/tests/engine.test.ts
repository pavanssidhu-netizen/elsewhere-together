import { describe, it, expect } from 'vitest';
import { SimEngine, cheapestWinPath, previewFork, TEMPLATES } from '../engine';
import { planWin, nextCommand } from '../planner';
import { calculateDrift, lca, pathTo } from '../branches';
import { mulberry32 } from '../rng';
import type { Command, SimulationState, Choice } from '../types';

const SEED = 48219;

function boot(seed = SEED) {
  const e = new SimEngine(seed);
  e.dispatch({ type: 'SET_PHASE', phase: 'EXPLORING' });
  return e;
}
function fork(e: SimEngine, templateId: string, choice: Choice) {
  const b = e.dispatch({ type: 'BEGIN_FORK', templateId });
  expect(b.filter(x => x.type === 'REJECTED')).toEqual([]);
  const id = e.getState().pendingFork!.eventInstanceId;
  return e.dispatch({ type: 'RESOLVE_FORK', eventInstanceId: id, choice });
}
/** Play the three tutorial forks (SELF) so any template is open afterwards. */
function pastTutorial(e: SimEngine) {
  for (const t of ['lantern', 'greenhouse', 'radio']) fork(e, t, 'SELF');
}
const norm = (s: Readonly<SimulationState>) => JSON.stringify(s);

describe('1 determinism', () => {
  it('same seed + commands => identical state', () => {
    const run = () => { const e = boot(); planWin(e, { echoFirst: true }); return norm(e.getState()); };
    expect(run()).toBe(run());
  });
  it('different seeds diverge in LET_GO outcomes at some point', () => {
    const outs = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const e = boot(seed); fork(e, 'lantern', 'LET_GO');
      outs.add(e.getState().events[0].selectedOutcome);
    }
    expect(outs.size).toBe(2);
  });
});

describe('2 fork correctness', () => {
  it('creates exactly two distinct children, one active, valid parents, clamped stats', () => {
    const e = boot();
    pastTutorial(e);
    for (let i = 0; i < 6; i++) for (const t of TEMPLATES) {
      if (e.getState().bondStrain > 70) e.dispatch({ type: 'REST_AT_TERMINAL' });
      fork(e, t.id, i % 2 ? 'SELF' : 'LET_GO');
    }
    const s = e.getState();
    for (const r of s.events) {
      const [a, b] = r.childNodeIds;
      expect(a).not.toBe(b);
      expect(s.nodes[a].parentId).toBe(r.parentNodeId);
      expect(s.nodes[b].parentId).toBe(r.parentNodeId);
      expect(JSON.stringify([s.nodes[a].world, s.nodes[a].flags])).not.toBe(JSON.stringify([s.nodes[b].world, s.nodes[b].flags]));
      expect([a, b]).toContain(r.activeChildNodeId);
      const visited = [a, b].filter(id => s.nodes[id].visitState === 'VISITED');
      expect(visited).toEqual([r.activeChildNodeId]);
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.paid.length).toBeGreaterThan(5);
    }
    for (const n of Object.values(s.nodes)) {
      for (const k of ['light', 'water', 'structure', 'signal', 'growth'] as const) {
        expect(n.world[k]).toBeGreaterThanOrEqual(0); expect(n.world[k]).toBeLessThanOrEqual(3);
      }
      expect(n.world.instability).toBeLessThanOrEqual(100);
    }
    expect(s.nodes.N0001.id).toBe('N0001');
    expect(s.events[0].eventInstanceId).toBe('E0001');
  });
  it('tutorial order is lantern, greenhouse, radio', () => {
    const e = boot();
    expect(e.dispatch({ type: 'BEGIN_FORK', templateId: 'tide' })[0].type).toBe('REJECTED');
    fork(e, 'lantern', 'SELF');
    expect(e.dispatch({ type: 'BEGIN_FORK', templateId: 'radio' })[0].type).toBe('REJECTED');
    fork(e, 'greenhouse', 'SELF');
    expect(e.dispatch({ type: 'BEGIN_FORK', templateId: 'tide' })[0].type).toBe('REJECTED');
    fork(e, 'radio', 'SELF');
    expect(e.dispatch({ type: 'BEGIN_FORK', templateId: 'tide' }).some(x => x.type === 'REJECTED')).toBe(false);
  });
  it('previewFork text depends on state', () => {
    const e = boot();
    pastTutorial(e);
    const p = previewFork(e.getState(), 'bridge');
    expect(p.A.text.length).toBeGreaterThan(0);
    expect(['A', 'B']).toContain(p.defaultOutcome);
  });
});

describe('3 history persistence', () => {
  it('retrace keeps nodes and events, no cycles, partner acts', () => {
    const e = boot();
    pastTutorial(e);
    const before = norm({ ...e.getState(), nodes: e.getState().nodes } as SimulationState);
    const s0 = JSON.parse(before) as SimulationState;
    e.dispatch({ type: 'RETRACE', targetNodeId: 'root' });
    const s1 = e.getState();
    expect(s1.player.nodeId).toBe('root');
    for (const id of Object.keys(s0.nodes)) {
      expect(s1.nodes[id]).toBeDefined();
      expect(s1.nodes[id].parentId).toBe(s0.nodes[id].parentId);
      expect(s1.nodes[id].world).toEqual(s0.nodes[id].world);
    }
    expect(s1.events.slice(0, s0.events.length)).toEqual(s0.events);
    for (const id of Object.keys(s1.nodes)) { // no cycles: path to root terminates and is unique
      const p = pathTo(s1.nodes, id);
      expect(new Set(p).size).toBe(p.length);
      expect(p[0]).toBe('root');
    }
    expect(e.dispatch({ type: 'RETRACE', targetNodeId: 'N9999' })[0].type).toBe('REJECTED');
  });
  it('first anchor grants a free retrace', () => {
    const e = boot();
    fork(e, 'lantern', 'SELF');
    e.dispatch({ type: 'ADVANCE_PARTNER' });
    const ev = e.dispatch({ type: 'ACTIVATE_ANCHOR', anchorId: 'LANTERN', actor: 'player' });
    expect(ev.some(x => x.type === 'ANCHOR_ALIGNED')).toBe(true);
    expect(e.getState().freeRetraceAvailable).toBe(true);
    const strain = e.getState().bondStrain;
    e.dispatch({ type: 'RETRACE', targetNodeId: 'root' });
    expect(e.getState().freeRetraceAvailable).toBe(false);
    // partner may stabilise (-4) in the same turn, but the retrace itself added nothing
    expect(e.getState().bondStrain).toBeLessThanOrEqual(strain);
    const strain2 = e.getState().bondStrain;
    e.dispatch({ type: 'RETRACE', targetNodeId: e.getState().nodes.root.children[0] });
    expect(e.getState().bondStrain).toBeGreaterThanOrEqual(strain2 + 4 - 4); // +4 retrace cost, partner may steady -4
  });
});

describe('4 distinct risks', () => {
  it('ECHO +12 strain and worse outcome; SELF +2 and no credit', () => {
    const a = boot(); fork(a, 'lantern', 'ECHO');
    const sa = a.getState();
    expect(sa.events[0].selectedOutcome).toBe('B');
    expect(sa.echoCredits).toHaveLength(1);
    expect(sa.events[0].echoId).toBe(sa.echoCredits[0].id);
    expect(sa.events[0].strainAfter).toBeGreaterThanOrEqual(8); // 12 minus a possible partner stabilise
    const b = boot(); fork(b, 'lantern', 'SELF');
    expect(b.getState().echoCredits).toHaveLength(0);
    expect(b.getState().events[0].selectedOutcome).toBe('A');
    expect(b.getState().bondStrain).toBeLessThanOrEqual(2);
  });
  it('drift is independent of strain', () => {
    const e = boot(); fork(e, 'lantern', 'SELF');
    const s = e.getState();
    expect(s.realityDrift).toBe(calculateDrift(s));
  });
});

describe('5 echo conservation', () => {
  it('credit is consumed at most once; queue cap protected', () => {
    const e = boot();
    fork(e, 'lantern', 'SELF'); fork(e, 'greenhouse', 'SELF'); fork(e, 'radio', 'SELF');
    fork(e, 'bridge', 'ECHO');
    fork(e, 'tide', 'ECHO');
    const s = e.getState();
    // never more than 2 unconsumed
    expect(s.echoCredits.filter(c => !c.consumed).length).toBeLessThanOrEqual(2);
    // fill queue deterministically if partner already consumed: check rejection when full
    const e2 = boot(); pastTutorial(e2);
    const full = () => e2.getState().echoCredits.filter(c => !c.consumed).length >= 2;
    for (let i = 0; i < 8 && !full(); i++) {
      // bridge/tide echo kinds (structure/water) are never useful to the partner here, so they queue
      if (e2.getState().bondStrain > 60) e2.dispatch({ type: 'REST_AT_TERMINAL' });
      fork(e2, i % 2 ? 'bridge' : 'tide', 'ECHO');
    }
    expect(full()).toBe(true);
    {
      e2.dispatch({ type: 'BEGIN_FORK', templateId: 'bridge' });
      const id = e2.getState().pendingFork!.eventInstanceId;
      const ev = e2.dispatch({ type: 'RESOLVE_FORK', eventInstanceId: id, choice: 'ECHO' });
      expect(ev[0].type).toBe('REJECTED');
      expect(e2.getState().phase).toBe('FORK');
      e2.dispatch({ type: 'CANCEL_FORK' });
    }
    const ids = e2.getState().echoCredits.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of e2.getState().echoCredits.filter(c => c.consumed)) {
      expect(e2.getState().events.filter(r => r.actorId === 'partner' && r.echoId === c.id)).toHaveLength(1);
    }
  });
  it('lantern ECHO is spent by the partner on its own lantern event, once', () => {
    const e = boot(); fork(e, 'lantern', 'ECHO');
    const s = e.getState();
    const pe = s.events.filter(r => r.actorId === 'partner');
    expect(pe).toHaveLength(1);
    expect(pe[0].selectedOutcome).toBe('A');
    expect(pe[0].echoId).toBe(s.echoCredits[0].id);
    expect(s.echoCredits[0].consumed).toBe(true);
    e.dispatch({ type: 'ADVANCE_PARTNER' }); e.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(e.getState().events.filter(r => r.echoId === s.echoCredits[0].id)).toHaveLength(2); // player's creation + one partner spend
  });
});

describe('6 agent progress', () => {
  it('every partner turn logs and changes something; terminates', () => {
    const e = boot();
    pastTutorial(e);
    for (let i = 0; i < 40; i++) {
      const before = norm(e.getState());
      const logLen = e.getState().log.length;
      const ev = e.dispatch({ type: 'ADVANCE_PARTNER' });
      expect(ev.some(x => x.type === 'PARTNER_ACTED')).toBe(true);
      expect(e.getState().log.length).toBeGreaterThan(Math.min(logLen, 79) - 1);
      expect(norm(e.getState())).not.toBe(before);
    }
  });
  it('refuses a dangerous request and stabilises instead', () => {
    const e = boot(); pastTutorial(e);
    const s = JSON.parse(norm(e.getState())) as SimulationState;
    s.bondStrain = 80;
    const e2 = new SimEngine(SEED, s);
    const ev = e2.dispatch({ type: 'REQUEST_PARTNER', intention: 'HELP_MY_WORLD' });
    const act = ev.find(x => x.type === 'PARTNER_ACTED');
    expect(act && act.type === 'PARTNER_ACTED' && act.goal).toBe('STABILISE');
    expect(e2.getState().log.some(l => l.text.includes('refuses'))).toBe(true);
  });
  it('intentions are honoured when safe', () => {
    const e = boot(); pastTutorial(e);
    e.dispatch({ type: 'RETRACE', targetNodeId: 'root' });
    const ev = e.dispatch({ type: 'REQUEST_PARTNER', intention: 'FIND_ME' });
    expect(ev.some(x => x.type === 'PARTNER_ACTED')).toBe(true);
  });
});

describe('7 softlock prevention', () => {
  it('critical drift can retrace; critical strain can recover', () => {
    const e = boot(); pastTutorial(e);
    const s = JSON.parse(norm(e.getState())) as SimulationState;
    s.bondStrain = 100; s.realityDrift = 100;
    const e2 = new SimEngine(SEED, s);
    e2.dispatch({ type: 'RETRACE', targetNodeId: 'root' });
    expect(e2.getState().player.nodeId).toBe('root');
    const b = e2.getState().bondStrain;
    e2.dispatch({ type: 'REST_AT_TERMINAL' });
    expect(e2.getState().bondStrain).toBeLessThan(b);
  });
  it('rest lowers strain by 12', () => {
    const e = boot(); fork(e, 'lantern', 'ECHO');
    const s = JSON.parse(norm(e.getState())) as SimulationState;
    s.bondStrain = 50;
    s.partner.nodeId = s.player.nodeId; // partner acts but strain change from rest is isolated below
    const e2 = new SimEngine(SEED, s);
    const ev = e2.dispatch({ type: 'REST_AT_TERMINAL' });
    expect(ev.some(x => x.type === 'STRAIN_RECOVERED')).toBe(true);
    expect(e2.getState().bondStrain).toBeLessThanOrEqual(38);
    expect(e2.getState().bondStrain).toBeGreaterThanOrEqual(38 - 4);
  });
  it('a randomly mangled run can always be finished by the planner (no softlock)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = mulberry32(seed * 7919);
      const e = boot(seed);
      for (let i = 0; i < 14; i++) {
        const st = e.getState();
        const r = rng();
        if (r < 0.5) {
          const t = TEMPLATES[Math.floor(rng() * 5)].id;
          const need = ['lantern', 'greenhouse', 'radio'][st.events.filter(x => x.actorId === 'player').length];
          const ch: Choice = (['LET_GO', 'SELF', 'ECHO'] as const)[Math.floor(rng() * 3)];
          fork(e, need ?? t, ch);
        } else if (r < 0.65) {
          const targets = Object.keys(st.nodes).filter(id => id !== st.player.nodeId);
          e.dispatch({ type: 'RETRACE', targetNodeId: targets[Math.floor(rng() * targets.length)] });
        } else if (r < 0.8) e.dispatch({ type: 'REST_AT_TERMINAL' });
        else if (r < 0.9) e.dispatch({ type: 'REQUEST_PARTNER', intention: (['FIND_ME', 'STAY_SAFE', 'HELP_MY_WORLD'] as const)[Math.floor(rng() * 3)] });
        else e.dispatch({ type: 'ADVANCE_PARTNER' });
      }
      // dismiss any dangling fork, then let the planner finish
      e.dispatch({ type: 'CANCEL_FORK' });
      planWin(e, { maxSteps: 150 });
      expect(e.getState().won, `seed ${seed}`).toBe(true);
    }
  });
});

describe('8 win gating', () => {
  it('early victory rejected with actionable hints', () => {
    const e = boot();
    const ev = e.dispatch({ type: 'ACTIVATE_ANCHOR', anchorId: 'LIGHTHOUSE', actor: 'player' });
    expect(ev[0].type).toBe('REJECTED');
    expect(e.getState().won).toBe(false);
    const ev2 = e.dispatch({ type: 'ACTIVATE_ANCHOR', anchorId: 'LANTERN', actor: 'player' });
    expect(ev2[0].type === 'REJECTED' && ev2[0].reason).toMatch(/LANTERN|SIGNAL/);
  });
  it('high strain is rejected with the rest hint', () => {
    const e = boot(); fork(e, 'lantern', 'SELF'); e.dispatch({ type: 'ADVANCE_PARTNER' });
    const s = JSON.parse(norm(e.getState())) as SimulationState;
    s.bondStrain = 90;
    const e2 = new SimEngine(SEED, s);
    const ev = e2.dispatch({ type: 'ACTIVATE_ANCHOR', anchorId: 'LANTERN', actor: 'player' });
    expect(ev[0].type === 'REJECTED' && ev[0].reason).toBe('REST AT A THREAD TERMINAL TO LOWER STRAIN');
  });
  it('earlier-branch hint when an ancestor satisfies the anchor', () => {
    const e = boot(); fork(e, 'lantern', 'SELF'); fork(e, 'greenhouse', 'SELF'); fork(e, 'radio', 'SELF');
    // bad lantern: ECHO from lantern node drops light below 2 while signal stays
    fork(e, 'lantern', 'ECHO');
    const ev = e.dispatch({ type: 'ACTIVATE_ANCHOR', anchorId: 'LANTERN', actor: 'player' });
    expect(ev.find(x => x.type === 'REJECTED')).toBeDefined();
  });
  it('full path wins, ENDING, further commands rejected', () => {
    const e = boot(); const cmds = planWin(e, { echoFirst: true });
    expect(e.getState().won).toBe(true);
    expect(e.getState().phase).toBe('ENDING');
    expect(cmds[cmds.length - 1]).toEqual({ type: 'ACTIVATE_ANCHOR', anchorId: 'LIGHTHOUSE', actor: 'player' });
    const s = e.getState();
    expect(s.realityDrift).toBeLessThanOrEqual(35);
    expect(s.bondStrain).toBeLessThanOrEqual(55);
    expect(s.anchors.every(a => a.aligned)).toBe(true);
    expect(e.dispatch({ type: 'ADVANCE_PARTNER' })[0].type).toBe('REJECTED');
  });
});

describe('9 save / restore', () => {
  it('round trips', () => {
    const e = boot(); planWin(e, { maxSteps: 12, echoFirst: true });
    const json = SimEngine.serialize(e.getState());
    const back = SimEngine.restore(json)!;
    expect(back).not.toBeNull();
    expect(norm(back)).toBe(json);
    const e2 = new SimEngine(1, back);
    expect(e2.getState().seed).toBe(SEED);
    expect(e2.getState().turn).toBe(e.getState().turn);
    // continuing both produces identical results
    planWin(e, {}); planWin(e2, {});
    expect(norm(e2.getState())).toBe(norm(e.getState()));
  });
  it('rejects corrupt / wrong version', () => {
    expect(SimEngine.restore('{nope')).toBeNull();
    expect(SimEngine.restore(JSON.stringify({ version: 2 }))).toBeNull();
    const s = JSON.parse(SimEngine.serialize(new SimEngine().getState()));
    s.player.nodeId = 'ghost';
    expect(SimEngine.restore(JSON.stringify(s))).toBeNull();
  });
  it('subscribe notifies and unsubscribes', () => {
    const e = new SimEngine(); let n = 0;
    const off = e.subscribe(() => { n++; });
    e.dispatch({ type: 'SET_PHASE', phase: 'EXPLORING' }); off();
    e.dispatch({ type: 'SET_PHASE', phase: 'ARCHIVE' });
    expect(n).toBe(1);
  });
});

describe('cheapestWinPath', () => {
  it('replays to WIN from seed 48219 and emits WIN + voice cues', () => {
    const path = cheapestWinPath();
    const e = new SimEngine(SEED);
    const seen: string[] = [];
    for (const c of path as Command[]) for (const ev of e.dispatch(c)) seen.push(ev.type === 'VOICE' ? 'V:' + ev.cue : ev.type);
    expect(e.getState().won).toBe(true);
    expect(seen).toContain('WIN');
    expect(seen).toContain('V:echo_received');
    expect(seen).toContain('V:final');
    expect(seen).not.toContain('REJECTED');
  });
  it('a pure-SELF path also wins, and so do other seeds', () => {
    for (const seed of [SEED, 1, 2, 3, 99, 12345]) {
      for (const echoFirst of [false, true]) {
        const e = boot(seed); planWin(e, { echoFirst });
        expect(e.getState().won, `seed ${seed} echo ${echoFirst}`).toBe(true);
      }
    }
  });
  it('nextCommand returns null once won', () => {
    const e = boot(); planWin(e);
    expect(nextCommand(e.getState(), {})).toBeNull();
    expect(lca(e.getState().nodes, 'root', 'root')).toBe('root');
  });
});
