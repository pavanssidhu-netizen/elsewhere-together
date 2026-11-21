// Dev-only harness (open /shots.html?style=scribble): renders WorldScene against a synthetic state so the art can be
// screenshotted without the sim/shell. Controls via window.__h.set({...}).
import Phaser from 'phaser';
import { WorldScene } from './WorldScene';
import { VIEW_W, VIEW_H } from './layout';
import { ART_INK, INK_SCALE } from './artStyle';

const state: any = {
  nodes: { root: { world: { light: 3, water: 1, structure: 2, signal: 2, growth: 2, instability: 10 }, flags: [] } },
  player: { nodeId: 'root', x: 0, y: 0 }, partner: { nodeId: 'root', x: 0, y: 0 },
  anchors: ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'].map(id => ({ id, playerReady: false, partnerReady: false, aligned: false })),
  realityDrift: 0, bondStrain: 0, phase: 'EXPLORING',
  v2: { realm: 'TOWN', examined: [], playerIdentity: 'amber', gridX: 7, gridY: 5 },
};
let dir = { x: 0, y: 0 };
const scene = new WorldScene({ getState: () => state, getDir: () => dir, canMove: () => true, reduce: () => true, onFocus: () => {}, onMoveEnd: () => {} } as any);
const k = ART_INK ? INK_SCALE : 1;
new Phaser.Game({ type: Phaser.AUTO, parent: 'v', width: VIEW_W * k, height: VIEW_H * k, pixelArt: !ART_INK, antialias: ART_INK, roundPixels: !ART_INK, scale: { mode: Phaser.Scale.NONE }, input: { keyboard: false, mouse: false, touch: false }, audio: { noAudio: true }, scene: [] }).scene.add('world', scene, true);
(window as any).__h = {
  scene, state,
  set(o: any) {
    const w = state.nodes.root.world, f = state.nodes.root.flags as string[];
    for (const key of ['light', 'water', 'structure', 'signal', 'growth', 'instability']) if (o[key] !== undefined) w[key] = o[key];
    if (o.flags) { f.length = 0; f.push(...o.flags); }
    if (o.alien !== undefined) state.v2.realm = o.alien ? 'ALIEN' : 'TOWN';
    if (o.identity) state.v2.playerIdentity = o.identity;
    if (o.examined) state.v2.examined = o.examined;
    if (o.anchors) state.anchors.forEach((a: any, i: number) => Object.assign(a, o.anchors[i] ?? {}));
    if (o.tile) { state.v2.gridX = o.tile[0]; state.v2.gridY = o.tile[1]; scene.syncToState(true); }
    scene.refresh(true);
  },
  walk(d: { x: number; y: number }) { dir = d; },
  trace(id?: string) { scene.showPartnerTrace(id, 8000); },
};
