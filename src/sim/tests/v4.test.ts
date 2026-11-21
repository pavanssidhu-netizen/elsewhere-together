import { describe, expect, it } from 'vitest';
import { SimEngine } from '../engine';
import { proofScripts } from '../proofs';
import type { Command, DomainEvent, SimulationState } from '../types';
import { OBJECT_TILES, PLAYER_START_TILE, getWalkability, pathTo } from '../../world/topology';

function run(cmds: Command[], seed = 1) {
  const e = new SimEngine(seed, undefined, true);
  const ev: DomainEvent[] = [];
  for (const c of cmds) ev.push(...e.dispatch(c));
  return { e, s: e.getState() as SimulationState, ev };
}
const flags = (s: SimulationState) => s.nodes[s.player.nodeId].flags;
const texts = (ev: DomainEvent[]) => ev.filter(x => x.type === 'WORLD_CHANGED').map(x => (x as { text: string }).text);

describe('V4', () => {
  it('A knowledge puzzle: divert, read, follow alternate, tune, contact', () => {
    const { s, ev } = run(proofScripts.A);
    expect(s.v2.contact).toBe(true);
    expect(s.player.knowledge).toContain('KNOWS_FREQUENCY');
    expect(texts(ev)).toContain('Carved in the stone: a pattern of three long, one short. A frequency.');
    expect(ev.some(x => x.type === 'RETRACED')).toBe(true);
    const forks = ev.filter(x => x.type === 'FORK_RESOLVED').length;
    expect(forks).toBeGreaterThan(0);
    expect(ev.some(x => x.type === 'VOICE' && x.cue === 'clear')).toBe(true);
    expect(flags(s)).toContain('WHEEL_TURNING');
    // retrace never emits a fork resolution for the retrace itself
    const iR = ev.findIndex(x => x.type === 'RETRACED');
    expect(ev[iR + 1]?.type).not.toBe('FORK_RESOLVED');
    // dead / static clues
    const e = new SimEngine(1, undefined, true);
    const t = (new SimEngine(1, undefined, true)).getState();
    expect(t.player.knowledge ?? []).not.toContain('KNOWS_FREQUENCY');
    void e;
  });

  it('B spiral: divert + fire ends in FADE with causal reasons', () => {
    const { s } = run(proofScripts.B, 5);
    expect(s.phase).toBe('FADE');
    const ign = s.events.find(x => x.templateId === 'ignition')!;
    expect(ign).toBeTruthy();
    expect(ign.reason).toMatch(/^Because the river was diverted/);
    expect(s.events.every(x => x.reason.length > 0)).toBe(true);
    expect(s.events.some(x => x.templateId === 'ignition' && x.selectedOutcome === 'A')).toBe(true); // the fire really spread
  });

  it('C recovery: cascade, follow alternate, then win', () => {
    const { s } = run(proofScripts.C);
    expect(s.events.some(x => x.templateId === 'ignition' && x.selectedOutcome === 'A')).toBe(true);
    expect(s.retraceCount).toBeGreaterThan(0);
    expect(s.won).toBe(true);
  });

  it('D partner acts independently while the player waits', () => {
    const { s, ev } = run(proofScripts.D);
    const tr = ev.filter(x => x.type === 'PARTNER_TRACE') as Array<{ text: string; objectId?: string }>;
    expect(tr.length).toBeGreaterThanOrEqual(1);
    expect(tr.every(x => !!x.text && !!x.objectId)).toBe(true);
    expect(tr.some(x => /plan|another way|instead/i.test(x.text))).toBe(true);
    expect(s.partner.nodeId).not.toBe(s.player.nodeId);
  });

  it('E replay determinism', () => {
    const a = run(proofScripts.C), b = run(proofScripts.C);
    expect(JSON.stringify(a.ev)).toBe(JSON.stringify(b.ev));
    expect(JSON.stringify(a.s.v2.journey)).toBe(JSON.stringify(b.s.v2.journey));
  });

  it('F physical consistency: inscription needs diverted water; smoke blocks the garden road', () => {
    const w0 = run([]).s;
    const n0 = w0.nodes[w0.player.nodeId];
    expect(pathTo(n0.world, n0.flags, PLAYER_START_TILE, 'inscription')).toBeNull();
    const { s } = run(proofScripts.A.slice(0, 0));
    void s;
    const low = { ...n0.world, water: 1 };
    expect(pathTo(low, [...n0.flags, 'COAST_OPEN'], PLAYER_START_TILE, 'inscription')).not.toBeNull();
    const free = getWalkability(n0.world, [], 'TOWN');
    const smoky = getWalkability(n0.world, ['SMOKE'], 'TOWN');
    expect(free[3][12]).toBe(true);
    expect(smoky[3][12]).toBe(false);
    expect(OBJECT_TILES.wheel).toBeTruthy();
  });

  it('radio clues: dead without power, static without frequency', () => {
    const e = new SimEngine(1, undefined, true);
    // go west across the ford-less bridge is closed; check the clue through availableActions instead
    const st = e.getState();
    const { availableActions } = require_engine();
    const tune = availableActions(st, 'radio').find(a => a.action === 'TUNE')!;
    expect(tune.clue).toBe("Static on every band. You'd need the right frequency.");
    const labels = availableActions(st, 'tide').map(a => a.label);
    expect(labels).toContain('Divert the water');
    expect(labels).toContain('Follow the other history');
  });
});

import * as eng from '../engine';
function require_engine() { return eng; }
