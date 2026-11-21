/**
 * WorldScene (V2). Grid-stepped world renderer for all four styles (SCRIBBLE default, PIXEL, INK, INK-LIGHT).
 * Collision is ALWAYS topology.getWalkability(state) (bridge/ford/flood depend on the current node), never static.
 *
 * Public API for the Shell (existing names are unchanged):
 *   refresh(instant?)                 redraw after any state change (re-reads realm / identity / flags)
 *   syncToState()                     snap the figure to state.v2.gridX/gridY (call after RESTART / restore / demo)
 *   setIdentity('amber'|'cyan')       colour of the player figure (state.v2.playerIdentity wins once set)
 *   showPartnerNear(anchorId)         labelled 'VARIANT / ECHO' apparition beside an anchor (on ANCHOR_ALIGNED)
 *   showPartnerTrace(objectId?, ms?)  NEW: same apparition beside any object (on PARTNER_TRACE; no id = near the player)
 *   act(verb)                         NEW: 'SELF'|'ECHO'|'LET_GO'|'USE' on the focused object (mobile verb buttons); false if none
 *   focused()                         NEW: id of the focused object or null
 *   playEnding() / resetEnding() / pos() / teleport(x,y) unchanged (pos/teleport are logical px; teleport snaps to a tile).
 * Hooks: getState, getDir, canMove, reduce, onFocus(id|null), onMoveEnd(), and optional dispatch(cmd): the scene sends
 * { type:'MOVE', tx, ty } for every tile it enters (one adjacent step; the sim validates and may reject). Verb keys E/Q/F
 * stay in main.ts; the in-world prompt bubble is drawn here. Style list for the toggle: ART_STYLES in artStyle.ts.
 */
import Phaser from 'phaser';
import type { SimulationState, Stats, Command, Choice, Identity } from '../sim/types';
import { canWalk, getNearbyInteractables, TILE as TT } from '../world/topology';
import { preloadScribble, prepareScribbleTextures, drawScribbleWorld, drawScribbleAmbient, ScribbleFx, ctxOf, identityColour, otherColour, SK, type Apparition } from './scribble';
import {
  TILE, MAP_W, MAP_H, MAP_ROWS, OBJECT_POSITIONS, PALETTE as P,
  isBlockedPx, PLAYER_START, VIEW_W, VIEW_H,
} from './layout';
import { registerTextures, TEX, TILE as T, FX, animKey, SPRITE_SCALE as SC, GROUND_VARIANTS, type Dir } from './sprites';
import { ART_INK, ART_LIGHT, ART_SCRIBBLE, INK_SCALE } from './artStyle';

const DEEP_INK = 0x0b0f1c;
/** Outline colour of overlay marks: deep ink on pale paper, pale mist on the dark ground. */
const INK_LINE = ART_LIGHT ? DEEP_INK : 0xb2c4ce;

// ---- loose ink helpers (deterministic: hash-based jitter, never Math.random) ----
const jr = (i: number, s: number): number => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v) - 0.5; };
type Pt2 = { x: number; y: number };
/** Rough-edged rectangular patch (a flat tone laid down with a loose hand). */
function inkPatch(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, col: number, a: number, seed: number, j = 1.6): void {
  const pts: Pt2[] = []; let i = 0;
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
    for (let k = 0; k < n; k++, i++) pts.push({ x: x0 + (x1 - x0) * k / n + jr(i, seed) * j * 2, y: y0 + (y1 - y0) * k / n + jr(i, seed + 5) * j * 2 });
  };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  g.fillStyle(col, a); g.fillPoints(pts, true);
}
/** Rough ellipse patch. */
function inkBlob(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, col: number, a: number, seed: number): void {
  const n = 14, pts: Pt2[] = [];
  for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2, f = 1 + jr(k, seed) * 0.35; pts.push({ x: cx + Math.cos(t) * rx * f, y: cy + Math.sin(t) * ry * f }); }
  g.fillStyle(col, a); g.fillPoints(pts, true);
}
/** Short loose stroke: two slightly bent segments. */
function inkStroke(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, col: number, a: number, wd: number, seed: number): void {
  const mx = (x0 + x1) / 2 + jr(1, seed) * 1.6, my = (y0 + y1) / 2 + jr(2, seed) * 1.6;
  g.lineStyle(wd, col, a); g.beginPath(); g.moveTo(x0, y0); g.lineTo(mx, my); g.lineTo(x1, y1); g.strokePath();
}

export interface SceneHooks {
  getState(): Readonly<SimulationState>;
  getDir(): { x: number; y: number };
  canMove(): boolean;
  reduce(): boolean;
  onFocus(id: string | null): void;
  onMoveEnd(x: number, y: number): void;
  dispatch?(c: Command): unknown;
}

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const ANCHOR_IDS = ['LANTERN', 'GREENHOUSE', 'LIGHTHOUSE'] as const;

export class WorldScene extends Phaser.Scene {
  private hooks: SceneHooks;
  private layers: Phaser.GameObjects.Container[] = [];
  private front = 0;
  private ghostLayer!: Phaser.GameObjects.Container;
  private playerSpr!: Phaser.GameObjects.Sprite;
  private partnerSpr!: Phaser.GameObjects.Sprite;
  private mergeSpr!: Phaser.GameObjects.Sprite;
  private glowSpr!: Phaser.GameObjects.Image;
  private dirName: Dir = 'down';
  private curAnim = '';
  private dyn!: Phaser.GameObjects.Graphics;
  private worldKey = '';
  private ghostKey = '';
  private px = PLAYER_START.x;
  private py = PLAYER_START.y;
  private facing = 1;
  private walkT = 0;
  private moving = false;
  private focusId: string | null = null;
  private secondId: string | null = null;
  private rain: { x: number; y: number; v: number; l: number }[] = [];
  private partnerGhostUntil = 0;
  private partnerGhostAt = { x: 0, y: 0 };
  private endingStart = -1;
  private rngState = 12345;
  private tileX = 0;
  private tileY = 0;
  private tile = { tx: 7, ty: 5 };
  private stepFrom = { x: PLAYER_START.x, y: PLAYER_START.y };
  private stepTo = { x: PLAYER_START.x, y: PLAYER_START.y };
  private stepT = 1;
  private identity: Identity = 'amber';
  private fx!: ScribbleFx;
  private apparitions: Apparition[] = [];
  private lastCtx: ReturnType<typeof ctxOf> = null;
  private drawnLamp = false;
  private drawnLh = false;

  constructor(hooks: SceneHooks) { super('world'); this.hooks = hooks; }

  preload(): void { if (ART_SCRIBBLE) preloadScribble(this); }

  create(): void {
    registerTextures(this);
    if (ART_SCRIBBLE) { prepareScribbleTextures(this); this.fx = new ScribbleFx(this); }
    this.cameras.main.setBackgroundColor(ART_SCRIBBLE ? SK.paper : P.midnight);
    if (ART_INK) { // canvas is INK_SCALE x the logical grid; zoom the camera so world coordinates stay 320x180
      this.cameras.main.setZoom(INK_SCALE);
      this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
    }
    this.layers = [this.add.container(0, 0).setDepth(0), this.add.container(0, 0).setDepth(0)];
    this.ghostLayer = this.add.container(0, 0).setDepth(1).setAlpha(0);
    this.dyn = this.add.graphics().setDepth(6);
    this.glowSpr = this.add.image(0, 0, TEX.fx, FX.glow).setDepth(4).setVisible(false).setTint(P.violet).setScale(SC);
    this.partnerSpr = this.add.sprite(0, 0, TEX.chars).setOrigin(0.5, 1).setDepth(5).setVisible(false).setScale(SC);
    this.mergeSpr = this.add.sprite(0, 0, TEX.chars).setOrigin(0.5, 1).setDepth(5).setVisible(false).setScale(SC);
    this.playerSpr = this.add.sprite(this.px, this.py, TEX.chars).setOrigin(0.5, 1).setDepth(5).setScale(SC);
    for (let i = 0; i < 80; i++) this.rain.push({ x: this.rnd() * VIEW_W, y: this.rnd() * VIEW_H, v: 90 + this.rnd() * 70, l: 3 + this.rnd() * 3 });
    this.layers[1].setAlpha(0);
    if (ART_SCRIBBLE) for (const o of [this.playerSpr, this.partnerSpr, this.mergeSpr, this.glowSpr]) o.setVisible(false);
    this.syncToState(true);
    this.refresh(true);
  }

  private rnd(): number { this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0; return this.rngState / 4294967296; } // visual only

  /** Call after any state change. */
  refresh(instant = false): void {
    if (!this.layers.length) return;
    const s = this.hooks.getState();
    const w = s.nodes[s.player.nodeId]?.world;
    if (!w) return;
    const anch = s.anchors.map(a => `${a.playerReady ? 1 : 0}${a.partnerReady ? 1 : 0}${a.aligned ? 1 : 0}`).join('');
    const nd = s.nodes[s.player.nodeId];
    const key = `${s.player.nodeId}|${w.light}${w.water}${w.structure}${w.signal}${w.growth}|${anch}|${(nd.flags ?? []).join(',')}|${s.v2?.realm ?? ''}|${(s.v2?.examined ?? []).includes('stones') ? 1 : 0}|${w.instability > 40 ? 1 : 0}`;
    if (ART_SCRIBBLE) {
      this.lastCtx = ctxOf(s, s.player.nodeId);
      this.drawnLamp = w.light >= 2; this.drawnLh = !!s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned || w.light >= 3;
      this.cameras.main.setBackgroundColor(s.v2?.realm === 'ALIEN' ? SK.alienPaper : SK.paper);
    }
    if (key !== this.worldKey) {
      const first = this.worldKey === '';
      this.worldKey = key;
      const back = this.layers[1 - this.front];
      this.drawWorld(back, w, s);
      if (first || instant) {
        this.drawWorld(this.layers[this.front], w, s);
        this.layers[this.front].setAlpha(1); back.setAlpha(0);
      } else {
        const old = this.layers[this.front];
        back.setAlpha(0);
        this.tweens.killTweensOf([old, back]);
        this.tweens.add({ targets: back, alpha: 1, duration: 450 });
        this.tweens.add({ targets: old, alpha: 0, duration: 450 });
        this.front = 1 - this.front;
      }
    }
    const pw = s.nodes[s.partner.nodeId]?.world;
    const gk = pw ? `${s.partner.nodeId}|${pw.light}${pw.water}${pw.structure}${pw.signal}${pw.growth}` : '';
    if (pw && gk !== this.ghostKey) { this.ghostKey = gk; this.drawWorld(this.ghostLayer, pw, s, true); }
  }

  showPartnerNear(anchorId: string | null, ms = 3200): void {
    const id = anchorId ? `anchor_${anchorId}` : 'anchor_LANTERN';
    this.showPartnerTrace(id, ms);
  }

  showPartnerTrace(objectId?: string, ms = 3500): void {
    const p = (objectId && OBJECT_POSITIONS[objectId]) || { x: this.px + 14, y: this.py - 2 };
    const off = objectId ? -13 : 0;
    this.apparitions = [{ x: p.x + off, y: p.y + 6, until: this.time.now + ms, label: 'VARIANT / ECHO' }];
    this.partnerGhostAt = { x: p.x + off, y: p.y + 6 }; this.partnerGhostUntil = this.time.now + ms;
  }

  setIdentity(id: Identity): void { this.identity = id; }
  focused(): string | null { return this.focusId; }
  act(verb: Choice | 'USE'): boolean {
    if (!this.focusId || !this.hooks.dispatch) return false;
    this.hooks.dispatch(verb === 'USE' ? { type: 'INTERACT', objectId: this.focusId } : { type: 'INTERACT', objectId: this.focusId, choice: verb });
    return true;
  }

  syncToState(instant = false): void {
    const v = this.hooks.getState().v2;
    const tx = v && Number.isFinite(v.gridX) ? v.gridX : Math.floor(PLAYER_START.x / TT), ty = v && Number.isFinite(v.gridY) ? v.gridY : Math.floor(PLAYER_START.y / TT);
    if (instant || this.stepT >= 1) this.setTile(tx, ty);
  }
  private setTile(tx: number, ty: number): void {
    this.tile = { tx, ty }; this.px = tx * TT + 8; this.py = ty * TT + 8; this.stepT = 1;
    this.stepFrom = { x: this.px, y: this.py }; this.stepTo = { x: this.px, y: this.py };
  }

  playEnding(): void { this.endingStart = this.time.now; }
  resetEnding(): void { this.endingStart = -1; this.syncToState(true); }
  pos(): { x: number; y: number } { return { x: Math.round(this.px), y: Math.round(this.py) }; }
  teleport(x: number, y: number): void { this.setTile(Math.floor(x / TT), Math.floor(y / TT)); }

  // ---------- static world drawing (tile images from sprites.ts) ----------
  private drawWorld(c: Phaser.GameObjects.Container, w: Stats, s: Readonly<SimulationState>, ghost = false): void {
    c.removeAll(true);
    if (ART_SCRIBBLE) { const cx = ctxOf(s, s.player.nodeId, ghost); if (cx) { cx.w = w; drawScribbleWorld(this, c, cx); } return; }
    const img = (x: number, y: number, frame: string, tint?: number): Phaser.GameObjects.Image => {
      const i = this.add.image(x, y, TEX.tiles, frame).setOrigin(0, 0).setScale(SC);
      if (tint !== undefined) i.setTint(tint);
      c.add(i); return i;
    };
    const g = this.add.graphics(); // small decorative bits (tide gauge, flood, glows)
    const R = (col: number, x: number, y: number, ww: number, hh: number, a = 1) => {
      g.fillStyle(col, a); g.fillRect(x, y, ww, hh);
      if (ART_INK && a >= 0.85 && ww * hh <= 100 && (col !== P.midnight || !ART_LIGHT)) { g.lineStyle(ART_LIGHT ? 0.5 : 0.7, INK_LINE, 0.9); g.strokeRect(x, y, ww, hh); } // small marks get an ink outline
    };
    const gv = (n: string) => { const v = ART_INK ? (hash(this.tileX, this.tileY) >>> 5) % GROUND_VARIANTS : 0; return v ? `${n}#${v}` : n; }; // INK: break up tiling
    const alive = w.growth >= 2, intact = !(s.nodes[s.player.nodeId]?.flags ?? []).includes('BRIDGE_CLOSED');
    const lampLit = w.light >= 2;
    const lhA = s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned;
    const lhLit = !!lhA || w.light >= 3;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const ch = MAP_ROWS[ty][tx]; const x = tx * TILE, y = ty * TILE; const h = hash(tx, ty); this.tileX = tx; this.tileY = ty;
      const base = gv(h % 3 === 0 || w.light < 1 ? T.ground_dark : T.ground);
      switch (ch) {
        case '~': case 'f': img(x, y, T.water); break;
        case '#': img(x, y, ty === 0 || ty === MAP_H - 1 ? T.wall : gv(T.ground_dark)); if (!(ty === 0 || ty === MAP_H - 1)) img(x, y, T.tree); break;
        case '=': img(x, y, T.road); break;
        case 'S': img(x, y, gv(T.ground), 0xd8c8a0); break;
        case 'b': img(x, y, intact ? T.bridge : T.bridge_broken); break;
        case 'F': img(x, y, base); img(x, y, T.fence); break;
        case 'G': img(x, y, base); img(x, y, alive ? T.greenhouse_alive : T.greenhouse_withered); break;
        case 'H': img(x, y, gv(T.ground), 0xd8c8a0); img(x, y, lhLit ? T.lighthouse_lit : T.lighthouse_dark); break;
        default: img(x, y, base);
      }
    }
    const at = (id: string) => OBJECT_POSITIONS[id];
    { const p = at('lantern'); img(p.x - 8, p.y - 8, lampLit ? T.lamp_lit : T.lamp_broken); }
    { const p = at('radio'); img(p.x - 8, p.y - 8, T.radio_tower);
      R(w.signal >= 2 ? P.cyan : w.signal === 1 ? P.teal : P.coral, p.x - 2, p.y - 10, 4, 2, 0.9); }
    { const p = at('thread_terminal'); img(p.x - 8, p.y - 8, T.thread_terminal); }
    for (const id of ANCHOR_IDS) {
      const p = at('anchor_' + id); const a = s.anchors.find(q => q.id === id);
      img(p.x - 8, p.y - 8, T.anchor(id, !!a?.aligned));
      if (!a?.aligned) { // readiness pips: amber = you, cyan = partner
        R(a?.playerReady ? P.amber : P.midnight, p.x - 4, p.y - 9, 3, 2); R(a?.partnerReady ? P.cyan : P.midnight, p.x + 1, p.y - 9, 3, 2);
      }
    }
    { // tide gauge (no tile in sheet)
      const p = at('tide');
      R(P.mist, p.x - 1, p.y - 12, 2, 16, 0.9);
      for (let i = 0; i < 4; i++) R(i <= w.water ? P.cyan : P.deepBlue, p.x + 2, p.y - 11 + i * 4, 4, 2);
    }
    // flooding of the coast
    if (ART_INK) {
      const fl = (tx0: number, tx1: number, ty: number, a: number, sd: number): void => {
        inkPatch(g, tx0 * TILE, ty * TILE + 1, (tx1 - tx0) * TILE, TILE - 2, P.teal, a, sd, 1.8);
        for (let k = 0; k < (tx1 - tx0) * 2; k++) { const x = tx0 * TILE + 4 + k * 8 + jr(k, sd) * 3, yy = ty * TILE + 4 + (k % 3) * 4; inkStroke(g, x, yy, x + 5, yy + jr(k, sd + 3), P.mist, 0.55, 0.7, sd + k); }
      };
      if (w.water >= 2) fl(6, 18, 8, w.water >= 3 ? 0.5 : 0.28, 3);
      if (w.water >= 3) { fl(6, 17, 7, 0.3, 4); inkPatch(g, 5 * TILE, 5 * TILE, TILE, TILE, P.teal, 0.4, 5, 1.8); }
      if (lampLit) { const p = at('lantern'); inkBlob(g, p.x, p.y - 4, 11, 10, P.amber, 0.13, 6); for (let k = 0; k < 8; k++) { const t = k * 0.785 + 0.2, r0 = 12 + jr(k, 9) * 2; inkStroke(g, p.x + Math.cos(t) * r0, p.y - 4 + Math.sin(t) * r0, p.x + Math.cos(t) * (r0 + 4), p.y - 4 + Math.sin(t) * (r0 + 4), P.amber, 0.6, 0.8, k); } }
      if (!ghost && w.instability > 40) { inkBlob(g, 30, 22, 40, 20, P.violet, 0.07, 1); inkBlob(g, 290, 150, 44, 22, P.violet, 0.07, 2); inkBlob(g, 250, 30, 26, 14, P.violet, 0.05, 3); for (let k = 0; k < 5; k++) inkStroke(g, 20 + k * 60, 90 + jr(k, 4) * 40, 36 + k * 60, 96 + jr(k, 5) * 40, P.violet, 0.2, 0.8, k); }
    } else {
      if (w.water >= 2) for (let tx = 6; tx < 18; tx++) R(P.teal, tx * TILE, 8 * TILE, TILE, TILE, w.water >= 3 ? 0.55 : 0.3);
      if (w.water >= 3) for (let tx = 6; tx < 17; tx++) R(P.teal, tx * TILE, 7 * TILE, TILE, TILE, 0.3);
      if (w.water >= 3) R(P.teal, 5 * TILE, 5 * TILE, TILE, TILE, 0.45);
      if (lampLit) { const p = at('lantern'); R(P.amber, p.x - 10, p.y - 14, 20, 20, 0.1); }
      if (!ghost && w.instability > 40) R(P.violet, 0, 0, VIEW_W, VIEW_H, 0.05);
    }
    if (!ghost) R(P.midnight, 0, 176, VIEW_W, 4);
    c.add(g);
  }

  // ---------- per-frame ----------
  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const s = this.hooks.getState();
    const dir = this.hooks.canMove() && this.endingStart < 0 ? this.hooks.getDir() : { x: 0, y: 0 };
    const wasMoving = this.moving;
    if (this.stepT < 1) { // mid-step: glide to the next tile
      this.stepT = Math.min(1, this.stepT + dt / 0.11);
      this.px = this.stepFrom.x + (this.stepTo.x - this.stepFrom.x) * this.stepT; this.py = this.stepFrom.y + (this.stepTo.y - this.stepFrom.y) * this.stepT;
      this.walkT += dt;
    }
    if (this.stepT >= 1) {
      if (this.endingStart < 0 && s.v2 && this.hooks.dispatch && Number.isFinite(s.v2.gridX) && (s.v2.gridX !== this.tile.tx || s.v2.gridY !== this.tile.ty)) this.setTile(s.v2.gridX, s.v2.gridY); // sim is authoritative
      this.moving = false;
      if (dir.x || dir.y) this.tryStep(dir, s);
    } else this.moving = true;
    if (wasMoving && !this.moving) this.hooks.onMoveEnd(Math.round(this.px), Math.round(this.py));

    // focus: nearest object within Chebyshev<=1 of the current tile (same rule the sim uses for INTERACT)
    const nd = s.nodes[s.player.nodeId];
    let f: string | null = null, second: string | null = null;
    if (nd && this.endingStart < 0) {
      const near = getNearbyInteractables(nd.world, nd.flags, this.tile, s.v2?.realm ?? 'TOWN')
        .map(id => ({ id, d: Math.hypot(OBJECT_POSITIONS[id].x - this.px, OBJECT_POSITIONS[id].y - this.py) })).sort((p, q) => p.d - q.d);
      f = near[0]?.id ?? null; second = near[1]?.id ?? null;
    }
    this.secondId = second;
    if (f !== this.focusId) { this.focusId = f; this.hooks.onFocus(f); }

    this.drawDynamic(time, dt, s);
  }

  /** One adjacent step toward `dir`, validated by topology (current node's world+flags); dispatches MOVE. */
  private tryStep(dir: { x: number; y: number }, s: Readonly<SimulationState>): void {
    const nd = s.nodes[s.player.nodeId]; if (!nd) return;
    const realm = s.v2?.realm ?? 'TOWN';
    const cand: { tx: number; ty: number }[] = [];
    const h = { tx: this.tile.tx + Math.sign(dir.x), ty: this.tile.ty }, v = { tx: this.tile.tx, ty: this.tile.ty + Math.sign(dir.y) };
    if (Math.abs(dir.x) >= Math.abs(dir.y)) { if (dir.x) cand.push(h); if (dir.y) cand.push(v); } else { cand.push(v); if (dir.x) cand.push(h); }
    for (const to of cand) {
      if (to.tx === this.tile.tx && to.ty === this.tile.ty) continue;
      if (to.ty !== this.tile.ty) this.dirName = to.ty > this.tile.ty ? 'down' : 'up'; else { this.dirName = 'side'; this.facing = to.tx > this.tile.tx ? 1 : -1; }
      if (!canWalk(nd.world, nd.flags, this.tile, to, realm)) continue;
      if (this.hooks.dispatch) {
        this.hooks.dispatch({ type: 'MOVE', tx: to.tx, ty: to.ty });
        const v2 = this.hooks.getState().v2;
        if (v2 && (v2.gridX !== to.tx || v2.gridY !== to.ty)) { this.syncToState(true); continue; } // sim rejected the step
      }
      this.stepFrom = { x: this.px, y: this.py }; this.stepTo = { x: to.tx * TT + 8, y: to.ty * TT + 8 };
      this.tile = to; this.stepT = 0.0001; this.moving = true;
      return;
    }
  }

  private place(spr: Phaser.GameObjects.Sprite, who: 'player' | 'partner', x: number, y: number, dir: Dir, flip: boolean, moving: boolean, alpha: number, tint?: number): void {
    spr.setVisible(alpha > 0).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha).setFlipX(flip);
    if (tint === undefined) spr.clearTint(); else spr.setTint(tint);
    const k = animKey(who, moving ? 'walk' : 'idle', dir);
    if (spr.anims.currentAnim?.key !== k) spr.play(k);
  }

  private drawScribbleDynamic(g: Phaser.GameObjects.Graphics, t: number, s: Readonly<SimulationState>): void {
    const cx = this.lastCtx; const reduce = this.hooks.reduce();
    const alien = s.v2?.realm === 'ALIEN';
    const idn = s.v2?.playerIdentity ?? this.identity;
    if (cx) drawScribbleAmbient(g, cx, t, reduce, this.focusId, { lit: this.drawnLamp, lhLit: this.drawnLh });
    // focus ring on the focused object
    if (this.focusId) {
      const p = OBJECT_POSITIONS[this.focusId], ph = reduce ? 0 : Math.sin(t * 3);
      g.lineStyle(0.9, SK.graphite, 0.85); g.strokeEllipse(p.x, p.y + 5, 15, 7);
      g.lineStyle(0.6, idn === 'cyan' ? SK.cyan : SK.amber, 1); g.strokeEllipse(p.x, p.y + 5, 15 + ph, 7 + ph * 0.5);
    }
    // partner apparitions (never physically present): translucent, dashed, labelled
    const now = this.time.now; let labelled = false;
    for (const ap of this.apparitions) {
      const left = (ap.until - now) / 1000; if (left <= 0) continue;
      const a = Math.min(0.55, left * 0.5) * (reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 3));
      this.fx.figure(g, ap.x, ap.y, otherColour(idn), 1, 0, a, true, alien);
      this.fx.label(true, ap.x, ap.y - 17, Math.min(1, a * 2), ap.label); labelled = true;
    }
    if (!labelled) this.fx.label(false, 0, 0, 0);
    this.apparitions = this.apparitions.filter(a => a.until > now);
    const ending = this.endingStart >= 0 ? (now - this.endingStart) / 1000 : -1;
    const col = identityColour(idn);
    if (ending < 0) {
      const bob = this.stepT < 1 ? Math.abs(Math.sin(this.stepT * Math.PI)) * 1.6 : 0;
      this.fx.figure(g, this.px, this.py + 4, col, this.facing, bob, 1, false, alien);
    } else { // ending: both beings converge, a thread arcs between them
      const k = Math.min(1, Math.max(0, (ending - 1.2) / 3)), cxm = 160, cym = 110;
      const ax = 100 + (cxm - 6 - 100) * k, bx = 220 + (cxm + 6 - 220) * k;
      g.lineStyle(1.1, SK.amber, 0.9); g.beginPath(); g.arc(ax + (bx - ax) / 2, cym - 4, (bx - ax) / 2, Math.PI, Math.PI * (1 + Math.min(1, ending / 2.5)), false); g.strokePath();
      this.fx.figure(g, ax, cym + 4, col, 1, 0, 1, false, alien); this.fx.figure(g, bx, cym + 4, otherColour(idn), -1, 0, 1, false, alien);
    }
    this.fx.prompt(ending < 0 ? this.focusId : null, this.px, this.py + 4, t);
  }

  private drawDynamic(time: number, dt: number, s: Readonly<SimulationState>): void {
    const g = this.dyn; g.clear();
    const t = time / 1000;
    if (ART_SCRIBBLE) { this.drawScribbleDynamic(g, t, s); return; }
    const reduce = this.hooks.reduce();
    const drift = s.realityDrift, strain = s.bondStrain;
    const pw = s.nodes[s.player.nodeId]?.world;

    // alt-world ghost overlay (slow, low alpha, no strobing)
    if (!reduce && drift >= 30 && s.partner.nodeId !== s.player.nodeId) {
      this.ghostLayer.setAlpha(0.16 * Math.pow(Math.max(0, Math.sin(t * 0.7)), 2) * (drift >= 60 ? 1.3 : 1));
    } else this.ghostLayer.setAlpha(0);

    // pulsing interactables
    for (const [id, p] of Object.entries(OBJECT_POSITIONS)) {
      const isF = id === this.focusId, isS = id === this.secondId;
      const ph = Math.sin(t * 3 + p.x);
      const col = id.startsWith('anchor') ? P.violet : id === 'thread_terminal' ? P.violet : P.amber;
      g.fillStyle(col, isF ? 1 : 0.55);
      const by = p.y - 26 + Math.round(ph * 1.5);
      if (ART_INK) {
        const k = ART_LIGHT ? 1 : 1.3, pts = [{ x: p.x, y: by + 1.5 - 3 * k }, { x: p.x + 2.6 * k, y: by + 1.5 }, { x: p.x, y: by + 1.5 + 3 * k }, { x: p.x - 2.6 * k, y: by + 1.5 }];
        g.fillStyle(col, isF ? 1 : 0.8); g.fillPoints(pts, true);
        g.lineStyle(ART_LIGHT ? 0.6 : 0.9, INK_LINE, 0.95); g.strokePoints(pts, true);
        if (isF || isS) {
          const rr = 8 + (isF ? 2 + 2 * ph : 0), seed = p.x * 0.37 + p.y;
          const ring = Array.from({ length: 15 }, (_, k) => { const a = (k / 14) * Math.PI * 2.05, r = rr + Math.sin(k * 2.3 + seed) * 0.7; return { x: p.x + Math.cos(a) * r, y: p.y - 3 + Math.sin(a) * r }; });
          g.lineStyle(ART_LIGHT ? 1.3 : 2.2, DEEP_INK, (isF ? 0.6 : 0.35)); g.strokePoints(ring, false);
          g.lineStyle(ART_LIGHT ? 0.6 : 1, isF ? P.cyan : P.teal, isF ? 1 : 0.8); g.strokePoints(ring, false);
        }
      } else {
        g.fillRect(p.x - 1, by, 2, 2); g.fillRect(p.x - 2, by + 1, 4, 0); g.fillRect(p.x, by + 2, 1, 1);
        if (isF || isS) {
          g.lineStyle(1, isF ? P.cyan : P.teal, (isF ? 0.9 : 0.5) * (0.6 + 0.4 * (0.5 + 0.5 * ph)));
          g.strokeCircle(p.x, p.y - 3, 8 + (isF ? 2 + 2 * ph : 0));
        }
      }
    }

    // lighthouse beam
    if (s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned) {
      const a = 0.12 + 0.06 * Math.sin(t * 0.8), sw = Math.sin(t * 0.5) * 20;
      const ax = 17 * TILE + 8, ay = 7 * TILE - 34, bx = 17 * TILE - 120, by1 = 7 * TILE - 70 + sw, by2 = 7 * TILE + sw;
      if (ART_INK) { // loose ink patch with a few bright strokes along the beam
        const pts: Pt2[] = [{ x: ax, y: ay }];
        for (let k = 1; k < 6; k++) pts.push({ x: ax + (bx - ax) * k / 6 + jr(k, 21) * 3, y: ay + (by1 - ay) * k / 6 + jr(k, 22) * 3 });
        pts.push({ x: bx, y: by1 }, { x: bx + jr(7, 3) * 3, y: (by1 + by2) / 2 });
        pts.push({ x: bx, y: by2 });
        for (let k = 5; k >= 1; k--) pts.push({ x: ax + (bx - ax) * k / 6 + jr(k, 23) * 3, y: ay + (by2 - ay) * k / 6 + jr(k, 24) * 3 });
        g.fillStyle(P.amber, a * 1.3); g.fillPoints(pts, true);
        for (let k = 0; k < 5; k++) { const f = (k + 0.5) / 5, ty2 = by1 + (by2 - by1) * f; inkStroke(g, ax - 6, ay + 2 + k, bx + 10 + k * 3, ty2, P.amber, 0.4, 0.9, 30 + k); }
      } else {
        g.fillStyle(P.amber, a); g.fillTriangle(ax, ay, bx, by1, bx, by2);
      }
    }

    // far lamps flicker at drift>=60 (slow, smooth)
    if (drift >= 60 && !reduce) {
      [[24, 22], [300, 150], [200, 18]].forEach(([x, y], i) => {
        g.fillStyle(P.amber, 0.25 + 0.2 * Math.sin(t * 2.4 + i * 2)); g.fillRect(x, y, 2, 3);
      });
    }
    // impossible street glimpse at drift>=80 (1s every 12s, faint)
    if (drift >= 80 && !reduce && (t % 12) < 1) {
      if (ART_INK) { inkStroke(g, 0, 62, VIEW_W, 64, P.violet, 0.3, 1.6, 41); inkStroke(g, 143, 0, 144, VIEW_H, P.violet, 0.3, 1.6, 42); inkStroke(g, 40, 102, 240, 100, P.violet, 0.3, 1.4, 43); }
      else { g.fillStyle(P.violet, 0.18); g.fillRect(0, 60, VIEW_W, 6); g.fillRect(140, 0, 6, VIEW_H); g.fillRect(40, 100, 200, 4); }
    }

    // thread tether to partner mote (top right)
    const mote = { x: 300, y: 14 };
    const sx = this.px, sy = this.py - 8;
    const N = 18;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      if (strain >= 30 && strain < 60 && i % 3 === 2) continue;
      if (strain >= 80 && i % 2 === 1) continue;
      const sag = (u: number) => Math.sin(u * Math.PI) * (strain >= 60 ? 10 : 5);
      const x0 = sx + (mote.x - sx) * u0, y0 = sy + (mote.y - sy) * u0 + sag(u0);
      const x1 = sx + (mote.x - sx) * u1, y1 = sy + (mote.y - sy) * u1 + sag(u1);
      let a = 0.7;
      if (strain >= 60 && strain < 80) a = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.4));
      if (strain >= 80) a = 0.45;
      if (ART_INK) { g.lineStyle(ART_LIGHT ? 1.3 : 2.4, DEEP_INK, a * (ART_LIGHT ? 0.55 : 0.7)); g.lineBetween(x0, y0, x1, y1); g.lineStyle(ART_LIGHT ? 0.6 : 1.1, P.cyan, Math.min(1, a + 0.2)); g.lineBetween(x0, y0, x1, y1); }
      else { g.lineStyle(1, P.cyan, a); g.lineBetween(x0, y0, x1, y1); }
    }
    g.fillStyle(P.cyan, 0.5 + 0.3 * Math.sin(t * 2)); g.fillRect(mote.x - 1, mote.y - 1, 3, 3);

    // beings (sprites)
    if (drift >= 60 && !reduce) {
      if (ART_INK) { inkBlob(g, this.px - 7, this.py - 6, 5, 7, P.violet, 0.22, 51); inkBlob(g, this.px + 8, this.py - 8, 4.5, 7, P.violet, 0.22, 52); }
      else { g.fillStyle(P.violet, 0.2); g.fillRect(this.px - 11, this.py - 12, 8, 12); g.fillRect(this.px + 5, this.py - 14, 7, 12); }
    }
    const ending = this.endingStart >= 0 ? (time - this.endingStart) / 1000 : -1;
    const flipP = this.dirName === 'side' && this.facing < 0;
    if (ending < 0) {
      this.glowSpr.setVisible(false); this.mergeSpr.setVisible(false);
      this.place(this.playerSpr, 'player', this.px, this.py, this.dirName, flipP, this.moving, 1);
      if (time < this.partnerGhostUntil) {
        const left = (this.partnerGhostUntil - time) / 1000;
        const a = Math.min(0.6, left * 0.5);
        this.place(this.partnerSpr, 'partner', this.partnerGhostAt.x, this.partnerGhostAt.y, 'side', false, false, a);
        g.lineStyle(1, P.cyan, a); g.lineBetween(this.px, this.py - 8, this.partnerGhostAt.x, this.partnerGhostAt.y - 8);
      } else this.partnerSpr.setVisible(false);
    } else {
      // ending: two beings converge, thread bridge forms, then merge
      const cx = 160, cy = 120;
      const k = Math.min(1, Math.max(0, (ending - 1.2) / 3));
      const ax = 100 + (cx - 6 - 100) * k, bx = 220 + (cx + 6 - 220) * k;
      const bridgeK = Math.min(1, ending / 2.5);
      if (ART_INK) { // two loose strokes (amber from you, cyan from your partner) that meet in an arc
        const arc = (u: number): Pt2 => ({ x: 100 + 120 * u + jr(Math.round(u * 40), 61) * 1.4, y: cy - 18 - Math.sin(u * Math.PI) * 24 + jr(Math.round(u * 40), 62) * 1.4 });
        const n = Math.floor(40 * bridgeK);
        for (const [col, lo, hi, wd] of [[DEEP_INK, 0, n, 3.2], [P.amber, 0, Math.min(n, 20), 1.6], [P.cyan, 20, n, 1.6]] as const) {
          if (hi - lo < 1) continue;
          g.lineStyle(wd, col, col === DEEP_INK ? 0.6 : 0.95); g.beginPath();
          for (let i = lo; i <= hi; i++) { const q = arc(i / 40); if (i === lo) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); }
          g.strokePath();
        }
      } else for (let i = 0; i < 40 * bridgeK; i++) {
        const u = i / 40; const x = 100 + 120 * u; const y = cy - 18 - Math.sin(u * Math.PI) * 24;
        g.fillStyle(i % 2 ? P.cyan : P.amber, 0.8); g.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
      const merged = ending > 4.4;
      if (merged) {
        this.glowSpr.setVisible(true).setPosition(cx, cy - 8).setScale((3 + 0.2 * Math.sin(t * 2)) * SC).setAlpha(0.7);
        this.place(this.playerSpr, 'player', cx, cy, 'down', false, false, 1);
        this.place(this.partnerSpr, 'partner', cx, cy, 'down', false, false, 0.5);
        this.mergeSpr.setVisible(false);
      } else {
        this.place(this.playerSpr, 'player', ax, cy, 'side', false, k > 0 && k < 1, 1);
        this.place(this.partnerSpr, 'partner', bx, cy, 'side', true, k > 0 && k < 1, 1);
      }
    }

    // rain
    const intensity = pw ? 50 + pw.water * 10 : 60;
    if (ART_INK) { if (ART_LIGHT) g.lineStyle(0.55, 0x1b263b, 0.4); else g.lineStyle(0.7, P.mist, 0.3); } else g.lineStyle(1, P.mist, 0.28);
    for (let i = 0; i < Math.min(this.rain.length, intensity); i++) {
      const r = this.rain[i];
      r.y += r.v * dt; r.x -= r.v * 0.25 * dt;
      if (r.y > VIEW_H) { r.y = -r.l; r.x = this.rnd() * (VIEW_W + 40); }
      if (r.x < 0) r.x += VIEW_W;
      if (ART_INK) { // loose ink stroke: two slightly bent segments
        const bend = Math.sin(i * 12.9898) * 0.7;
        g.lineBetween(r.x, r.y, r.x + 0.5 + bend, r.y + r.l * 0.5); g.lineBetween(r.x + 0.5 + bend, r.y + r.l * 0.5, r.x + 1, r.y + r.l);
        continue;
      }
      g.lineBetween(Math.round(r.x), Math.round(r.y), Math.round(r.x + 1), Math.round(r.y + r.l));
    }
  }
}
