import { describe, expect, it } from 'vitest';
import {
  MAP_ROWS, MAP_W, MAP_H, OBJECT_TILES, PLAYER_START_TILE, canWalk, getNearbyInteractables, getReachableObjects, getWalkability, pathTo,
} from '../../world/topology';
import type { Stats } from '../types';

const W = (o: Partial<Stats> = {}): Stats => ({ light: 1, water: 1, structure: 1, signal: 1, growth: 1, instability: 0, ...o });

describe('topology', () => {
  it('grid is 20x11 and start/objects are in bounds', () => {
    expect(MAP_ROWS.length).toBe(MAP_H);
    for (const r of MAP_ROWS) expect(r.length).toBe(MAP_W);
    for (const c of [PLAYER_START_TILE, ...Object.values(OBJECT_TILES)]) {
      expect(c.tx).toBeGreaterThanOrEqual(0); expect(c.tx).toBeLessThan(MAP_W);
    }
  });
  it('initially everything but the lighthouse is reachable', () => {
    const r = getReachableObjects(W(), [], PLAYER_START_TILE);
    for (const id of Object.keys(OBJECT_TILES)) {
      if (id === 'anchor_LIGHTHOUSE' || id === 'inscription') expect(r).not.toContain(id); else expect(r).toContain(id);
    }
  });
  it('coast opens only with COAST_OPEN and water<=2', () => {
    expect(getReachableObjects(W(), ['COAST_OPEN'], PLAYER_START_TILE)).toContain('anchor_LIGHTHOUSE');
    expect(getReachableObjects(W({ water: 3 }), ['COAST_OPEN'], PLAYER_START_TILE)).not.toContain('anchor_LIGHTHOUSE');
    expect(getReachableObjects(W(), ['COAST_CLOSED'], PLAYER_START_TILE)).not.toContain('anchor_LIGHTHOUSE');
  });
  it('closed bridge is detoured through the ford only when water<=1', () => {
    expect(getReachableObjects(W(), ['BRIDGE_CLOSED'], PLAYER_START_TILE)).toContain('radio');
    expect(getReachableObjects(W({ water: 2 }), ['BRIDGE_CLOSED'], PLAYER_START_TILE)).not.toContain('radio');
    expect(getReachableObjects(W({ water: 2 }), [], PLAYER_START_TILE)).toContain('radio');
  });
  it('canWalk only allows adjacent walkable steps', () => {
    expect(canWalk(W(), [], { tx: 7, ty: 5 }, { tx: 8, ty: 5 })).toBe(true);
    expect(canWalk(W(), [], { tx: 7, ty: 5 }, { tx: 8, ty: 6 })).toBe(false);
    expect(canWalk(W(), [], { tx: 6, ty: 5 }, { tx: 5, ty: 4 })).toBe(false);
    expect(getWalkability(W(), [])[5][5]).toBe(true);
  });
  it('pathTo and nearby', () => {
    const p = pathTo(W(), [], PLAYER_START_TILE, 'lantern')!;
    expect(p.length).toBeGreaterThan(0);
    expect(getNearbyInteractables(W(), [], p[p.length - 1])).toContain('lantern');
    expect(pathTo(W(), [], PLAYER_START_TILE, 'anchor_LIGHTHOUSE')).toBeNull();
    expect(pathTo(W(), [], PLAYER_START_TILE, 'nope')).toBeNull();
  });
});
