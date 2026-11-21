import { describe, expect, it } from 'vitest';
import { SimEngine, createInitialState, availableActions } from '../engine';
import { act, objectiveHint, planStep, planWin } from '../planner';
import type { Command, DomainEvent, SimulationState } from '../types';
import { getWalkability, OBJECT_TILES, PLAYER_START_TILE } from '../../world/topology';
import win from './replays/win.json';
import fade from './replays/fade.json';
import secret from './replays/secret.json';

type Replay = { seed: number; commands: Command[]; expect: string };

function play(r: Replay) {
  const e = new SimEngine(r.seed, undefined, true);
  const events: DomainEvent[] = [];
  const links: string[] = [];
  for (const c of r.commands) { events.push(...e.dispatch(c)); const l = e.getState().link; if (links[links.length - 1] !== l) links.push(l); }
  return { e, s: e.getState() as SimulationState, events, links };
}
function runPlanner(seed: number, max = 600) {
  const e = new SimEngine(seed, undefined, true);
  const events: DomainEvent[] = [];
  for (let i = 0; i < max * 3 && !e.getState().won && e.getState().phase !== 'FADE'; i++) {
    const c = planStep(e.getState());
    if (!c) break;
    events.push(...e.dispatch(c));
  }
  return { e, s: e.getState() as SimulationState, events };
}
const goTo = (e: SimEngine, obj: string, action?: Parameters<typeof act>[2]) => {
  const evs: DomainEvent[] = [];
  for (let i = 0; i < 200; i++) {
    const c = act(e.getState(), obj, action);
    if (!c) throw new Error('unreachable ' + obj);
    evs.push(...e.dispatch(c));
    if (c.type === 'INTERACT') return evs;
  }
  throw new Error('no arrival');
};

describe('replays (seed + exact legal commands)', () => {
  it('WIN: independent partner progress, both beacons lit, win event, nodes never merged', () => {
    const { s, events } = play(win as Replay);
    expect(s.won).toBe(true);
    expect(events.some(x => x.type === 'WIN')).toBe(true);
    expect(s.anchors.every(a => a.aligned && a.playerReady && a.partnerReady)).toBe(true);
    // V5: one shared clearing beacon, lit in both worlds; partner walked home to its own beacon; a technique crossed the Thread
    expect(s.nodes[s.player.nodeId].flags).toContain('LANTERN_LIT');
    expect(s.nodes[s.partner.nodeId].flags).toContain('LANTERN_LIT');
    expect(s.partner.site).toBe('CLEARING');
    expect(s.partner.heard).toBe(true);
    expect(s.v2.contact).toBe(true);
    expect(s.partner.nodeId).not.toBe(s.player.nodeId);
  });
  it('FADE: CONNECTED -> FRAYING -> LAST_SIGNAL -> FADED, in order, with warnings 1 and 2 before', () => {
    const { s, events, links } = play(fade as Replay);
    expect(s.phase).toBe('FADE');
    expect(links.slice(-3)).toEqual(['FRAYING', 'LAST_SIGNAL', 'FADED']);
    const w = events.filter(x => x.type === 'WARNING').map(x => (x as { level: number }).level);
    expect(w.slice(-3)).toEqual([1, 2, 3]);
    expect(events.findIndex(x => x.type === 'FADE')).toBeGreaterThan(events.findIndex(x => x.type === 'WARNING' && x.level === 2));
    expect(new SimEngine(s.seed, s as never).dispatch({ type: 'MOVE', tx: 7, ty: 5 })[0].type).toBe('REJECTED');
  });
  it('SECRET: the echo stones open the alien realm after a repeated motif, and the game is still winnable', () => {
    const { s, events } = play(secret as Replay);
    expect(s.v2.secretFound).toBe(true);
    expect(events.some(x => x.type === 'REALM' && x.realm === 'ALIEN')).toBe(true);
    expect(s.won).toBe(true);
  });
  it('replays are reproducible (same seed + same actions => same records and ending)', () => {
    const a = play(win as Replay), b = play(win as Replay);
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
});

describe('causal model invariants', () => {
  it('no EchoCredit, and Thread messages carry information only', () => {
    const { s } = runPlanner(3);
    expect('echoCredits' in s).toBe(false);
    for (const m of s.messages) {
      expect(Object.keys(m).every(k => ['from', 'to', 'kind', 'site', 'turn', 'clarity', 'technique', 'text'].includes(k))).toBe(true);
      expect(['LOCATION', 'WARNING', 'TECHNIQUE', 'CALL']).toContain(m.kind);
    }
  });
  it('the partner is never moved into the player node by seeking; nodes stay distinct through a full run', () => {
    const e = new SimEngine(5, undefined, true);
    for (let i = 0; i < 500 && !e.getState().won && e.getState().phase !== 'FADE'; i++) {
      e.dispatch(planStep(e.getState())!);
      expect(e.getState().partner.nodeId).not.toBe(e.getState().player.nodeId);
    }
  });
  it('a call costs the caller fuel and strain, and changes nothing physical in the partner world', () => {
    const e = new SimEngine(1, undefined, true);
    goTo(e, 'woodpile', 'GATHER');
    const before = JSON.parse(JSON.stringify(e.getState())) as SimulationState;
    e.dispatch({ type: 'CALL' });
    const a = e.getState();
    expect(a.player.inventory.fuel).toBe(before.player.inventory.fuel - 1);
    expect(a.bondStrain).toBeGreaterThan(before.bondStrain);
    expect(a.nodes[a.partner.nodeId].flags).toEqual(before.nodes[before.partner.nodeId].flags);
    expect(a.partner.inventory.plank).toBe(before.partner.inventory.plank);
  });
  it('the partner learns the sluice technique only if told (or by rare self-discovery), not by magic', () => {
    const e = new SimEngine(2, undefined, true);
    expect(e.getState().partner.knowledge).not.toContain('open_sluice');
    // a message told with clear signal teaches it
    const s = JSON.parse(JSON.stringify(e.getState())) as SimulationState;
    s.messages.push({ from: 'player', to: 'partner', kind: 'TECHNIQUE', technique: 'open_sluice', site: 'CROSSING', turn: 0, clarity: 0.95 });
    const t = new SimEngine(2, s, true);
    t.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(t.getState().partner.knowledge).toContain('open_sluice');
  });
  it('the partner refuses when the Thread is overstrained, and does not learn', () => {
    const s = JSON.parse(JSON.stringify(createInitialState(2))) as SimulationState;
    s.bondStrain = 90;
    s.messages.push({ from: 'player', to: 'partner', kind: 'TECHNIQUE', technique: 'open_sluice', site: 'CROSSING', turn: 0, clarity: 0.95 });
    const t = new SimEngine(2, s, true);
    const ev = t.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(ev.some(x => x.type === 'VOICE' && x.cue === 'refusal')).toBe(true);
    expect(t.getState().partner.knowledge).not.toContain('open_sluice');
  });
  it('every partner action is in the journey history (no fork needed)', () => {
    const { s } = runPlanner(4);
    const hist = s.history.filter(h => h.actor === 'partner').length;
    const steps = s.v2.journey.filter(j => j.actor === 'partner').length - 1; // minus the opening split
    expect(hist).toBeGreaterThan(5);
    expect(steps).toBe(hist);
  });
  it('forks record every contract field; both outcomes exist; interventions bias but never guarantee', () => {
    const outcomes = { A: 0, B: 0 };
    for (let seed = 1; seed <= 80; seed++) {
      const e = new SimEngine(seed, undefined, true);
      goTo(e, 'woodpile', 'GATHER');
      goTo(e, 'lantern', 'OBSERVE');
      const evs = goTo(e, 'lantern', 'RELIGHT');
      const f = evs.find(x => x.type === 'FORK_RESOLVED');
      expect(f).toBeTruthy();
      const r = (f as Extract<DomainEvent, { type: 'FORK_RESOLVED' }>).record;
      for (const k of ['sourceObject', 'priorState', 'playerAction', 'outcomeA', 'outcomeB', 'seededRoll', 'chosenOutcome', 'localPhysicalEffect', 'evidenceShown']) expect((r as unknown as Record<string, unknown>)[k]).toBeDefined();
      expect(r.childNodeIds.length).toBe(2);
      outcomes[r.chosenOutcome]++;
      const flags = e.getState().nodes[e.getState().player.nodeId].flags;
      expect(flags.includes('LANTERN_LIT')).toBe(r.chosenOutcome === 'A');
    }
    expect(outcomes.A).toBeGreaterThan(20); expect(outcomes.B).toBeGreaterThan(5);
  });
  it('blocked interactions return a factual clue with no numbers or stat names', () => {
    const e = new SimEngine(1, undefined, true);
    const probes: Array<[string, Parameters<typeof act>[2]]> = [['lantern', 'RELIGHT'], ['bridge', 'BRACE'], ['anchor_LANTERN', 'OBSERVE'], ['anchor_GREENHOUSE', 'OBSERVE'], ['tide', 'OBSERVE']];
    for (const [obj, a] of probes) {
      const evs = goTo(e, obj, a);
      const clue = evs.filter(x => x.type === 'WORLD_CHANGED' || x.type === 'REJECTED').map(x => (x as { text?: string; reason?: string }).text ?? (x as { reason: string }).reason).join(' ');
      expect(clue.length).toBeGreaterThan(10);
      expect(clue).not.toMatch(/\d|signal|strain|drift|stat\b/i);
    }
    expect(availableActions(e.getState(), 'lantern').find(x => x.action === 'RELIGHT')?.clue).toMatch(/cold/i);
  });
  it('an early visit to the lookout shows an unlit beacon and a physical clue, not an order lock', () => {
    const s = JSON.parse(JSON.stringify(createInitialState(1))) as SimulationState;
    const n = s.nodes[s.player.nodeId];
    n.flags.push('COAST_OPEN'); n.world.water = 1;
    const e = new SimEngine(1, s, true);
    const evs = goTo(e, 'anchor_LIGHTHOUSE', 'BEACON');
    const t = evs.filter(x => x.type === 'WORLD_CHANGED').map(x => (x as { text: string }).text).join(' ');
    expect(t).toMatch(/bowl is empty|cold/i);
    expect(t).not.toMatch(/first|before|tutorial|\d/i);
    expect(e.getState().won).toBe(false);
  });
  it('changed terrain changes both engine movement and the display walkability', () => {
    const e = new SimEngine(1, undefined, true);
    const s0 = e.getState();
    const n0 = s0.nodes[s0.player.nodeId];
    expect(getWalkability(n0.world, n0.flags)[5][5]).toBe(false);
    // the bridge tile is refused by the engine while closed
    const s = JSON.parse(JSON.stringify(s0)) as SimulationState;
    s.v2.gridX = 6; s.v2.gridY = 5;
    expect(new SimEngine(1, s, true).dispatch({ type: 'MOVE', tx: 5, ty: 5 })[0].type).toBe('REJECTED');
    // open sluice (found by a successful roll) makes the ford walkable in both
    for (let seed = 1; seed < 40; seed++) {
      const t = new SimEngine(seed, undefined, true);
      goTo(t, 'tide', 'OPEN_SLUICE');
      const st = t.getState(); const n = st.nodes[st.player.nodeId];
      if (n.flags.includes('COAST_OPEN')) {
        expect(getWalkability(n.world, n.flags)[7][5]).toBe(true);
        return;
      }
    }
    throw new Error('no seed opened the sluice');
  });
  it('win is never inferred from node ids or a single side', () => {
    const s = JSON.parse(JSON.stringify(createInitialState(1))) as SimulationState;
    s.partner.nodeId = s.player.nodeId;
    const e = new SimEngine(1, s, true);
    for (let i = 0; i < 5; i++) e.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(e.getState().won).toBe(false);
    // one side ready at the beacon is not a win
    const t = JSON.parse(JSON.stringify(createInitialState(1))) as SimulationState;
    t.anchors.forEach(a => { a.playerReady = true; });
    t.nodes[t.player.nodeId].flags.push('BEACON_LIT');
    t.v2.gridX = 15; t.v2.gridY = 7;
    const e2 = new SimEngine(1, t, true);
    e2.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(e2.getState().won).toBe(false);
  });
  it('anchors have no order lock: GREENHOUSE can be earned before LANTERN, each side independently', () => {
    const s = JSON.parse(JSON.stringify(createInitialState(1))) as SimulationState;
    s.v2.contact = true; // V5: GREENHOUSE = the connection (radio contact) on the player side
    const e = new SimEngine(1, s, true);
    goTo(e, 'anchor_GREENHOUSE', 'OBSERVE');
    const a = e.getState().anchors;
    expect(a.find(x => x.id === 'GREENHOUSE')!.playerReady).toBe(true);
    expect(a.find(x => x.id === 'GREENHOUSE')!.aligned).toBe(false); // the partner has not earned its side
    expect(a.find(x => x.id === 'LANTERN')!.playerReady).toBe(false);
  });
  it('three ineffective interactions in a row escalate with a concrete next step', () => {
    const e = new SimEngine(1, undefined, true);
    goTo(e, 'lantern', 'RELIGHT');
    const out: DomainEvent[] = [];
    for (let i = 0; i < 3; i++) out.push(...e.dispatch({ type: 'INTERACT', objectId: 'lantern', action: 'RELIGHT' }));
    const texts = out.filter(x => x.type === 'WORLD_CHANGED').map(x => (x as { text: string }).text);
    expect(texts.some(t => /driftwood|dry wood|wood/i.test(t))).toBe(true);
  });
  it('INTERACT.choice remains a deprecated alias for a physical action', () => {
    const e = new SimEngine(1, undefined, true);
    for (let i = 0; i < 100; i++) { const c = act(e.getState(), 'woodpile'); if (c!.type === 'INTERACT') break; e.dispatch(c!); }
    const ev = e.dispatch({ type: 'INTERACT', objectId: 'woodpile', choice: 'LET_GO' });
    expect(ev.some(x => x.type === 'REJECTED')).toBe(false);
    expect(e.getState().player.inventory.fuel).toBe(1);
  });
  it('objectiveHint is observation-based and names a physical step', () => {
    const h = objectiveHint(createInitialState(1));
    expect(h.text).toMatch(/wood|fire|lantern/i);
    expect(h.text).not.toMatch(/\d/);
  });
  it('save / restore round-trips', () => {
    const { s } = runPlanner(2, 30);
    const back = SimEngine.restore(SimEngine.serialize(s));
    expect(back).not.toBeNull();
    expect(JSON.stringify(back)).toBe(JSON.stringify(s));
  });
});

describe('quality gates (small, fast)', () => {
  it('planner wins from 30 seeds, never softlocks, and planWin(state) is legal and winning', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) if (runPlanner(seed).s.won) wins++;
    expect(wins).toBeGreaterThanOrEqual(28);
    const e = new SimEngine(1, undefined, true);
    const plan = planWin(e);
    const p = new SimEngine(1, undefined, true);
    for (const c of plan) p.dispatch(c);
    expect(p.getState().won).toBe(true);
    expect(e.getState().v2.tick).toBe(0); // planWin never mutates its input
    expect(PLAYER_START_TILE).toBeTruthy(); expect(OBJECT_TILES.planks).toBeTruthy();
  });
  it('idle safety: standing still, or repeating an unavailable action, never fades the Thread by itself', () => {
    const e = new SimEngine(1, undefined, true);
    for (let i = 0; i < 400; i++) e.dispatch({ type: 'ADVANCE_PARTNER' });
    expect(e.getState().phase).not.toBe('FADE');
    const f = new SimEngine(1, undefined, true);
    goTo(f, 'lantern', 'RELIGHT');
    for (let i = 0; i < 300; i++) f.dispatch({ type: 'INTERACT', objectId: 'lantern', action: 'RELIGHT' }); // no fuel: refused every time
    expect(f.getState().phase).not.toBe('FADE');
    expect(f.getState().link).toBe('CONNECTED');
  });
  it('resting at a safe site is a real recovery from LAST_SIGNAL', () => {
    const s = JSON.parse(JSON.stringify(createInitialState(1))) as SimulationState;
    s.link = 'LAST_SIGNAL'; s.bondStrain = 75; s.v2.gridX = 11; s.v2.gridY = 6;
    const e = new SimEngine(1, s, true);
    const ev = e.dispatch({ type: 'INTERACT', objectId: 'anchor_LANTERN', action: 'REST' });
    expect(ev.some(x => x.type === 'REJECTED')).toBe(false);
    expect(e.getState().bondStrain).toBeLessThan(60);
    expect(e.getState().link).not.toBe('FADED');
  });
});
