import Phaser from 'phaser';
import type { SimulationState, Stats } from '../sim/types';
import {
  TILE, MAP_W, MAP_H, MAP_ROWS, OBJECT_POSITIONS, PALETTE as P, INTERACT_RADIUS, MOVE_SPEED,
  isBlockedPx, PLAYER_START, VIEW_W, VIEW_H,
} from './layout';
import { registerTextures, TEX, TILE as T, FX, animKey, SPRITE_SCALE as SC, GROUND_VARIANTS, type Dir } from './sprites';
import { ART_INK, INK_SCALE } from './artStyle';

const INK_LINE = 0x0b0f1c;

export interface SceneHooks {
  getState(): Readonly<SimulationState>;
  getDir(): { x: number; y: number };
  canMove(): boolean;
  reduce(): boolean;
  onFocus(id: string | null): void;
  onMoveEnd(x: number, y: number): void;
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

  constructor(hooks: SceneHooks) { super('world'); this.hooks = hooks; }

  create(): void {
    registerTextures(this);
    this.cameras.main.setBackgroundColor(P.midnight);
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
    const s = this.hooks.getState();
    if (s.player.x > 0 && s.player.y > 0) { this.px = s.player.x; this.py = s.player.y; }
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
    const key = `${s.player.nodeId}|${w.light}${w.water}${w.structure}${w.signal}${w.growth}|${anch}`;
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
    const p = OBJECT_POSITIONS[anchorId ? `anchor_${anchorId}` : 'anchor_LANTERN'] ?? { x: this.px, y: this.py };
    this.partnerGhostAt = { x: p.x - 16, y: p.y + 6 };
    this.partnerGhostUntil = this.time.now + ms;
  }

  playEnding(): void { this.endingStart = this.time.now; }
  resetEnding(): void { this.endingStart = -1; }
  pos(): { x: number; y: number } { return { x: Math.round(this.px), y: Math.round(this.py) }; }
  teleport(x: number, y: number): void { this.px = x; this.py = y; }

  // ---------- static world drawing (tile images from sprites.ts) ----------
  private drawWorld(c: Phaser.GameObjects.Container, w: Stats, s: Readonly<SimulationState>, ghost = false): void {
    c.removeAll(true);
    const img = (x: number, y: number, frame: string, tint?: number): Phaser.GameObjects.Image => {
      const i = this.add.image(x, y, TEX.tiles, frame).setOrigin(0, 0).setScale(SC);
      if (tint !== undefined) i.setTint(tint);
      c.add(i); return i;
    };
    const g = this.add.graphics(); // small decorative bits (tide gauge, flood, glows)
    const R = (col: number, x: number, y: number, ww: number, hh: number, a = 1) => {
      g.fillStyle(col, a); g.fillRect(x, y, ww, hh);
      if (ART_INK && a >= 0.85 && ww * hh <= 100 && col !== P.midnight) { g.lineStyle(0.5, INK_LINE, 0.9); g.strokeRect(x, y, ww, hh); } // small marks get an ink outline
    };
    const gv = (n: string) => { const v = ART_INK ? (hash(this.tileX, this.tileY) >>> 5) % GROUND_VARIANTS : 0; return v ? `${n}#${v}` : n; }; // INK: break up tiling
    const alive = w.growth >= 2, intact = w.structure >= 2;
    const lampLit = w.light >= 2;
    const lhA = s.anchors.find(a => a.id === 'LIGHTHOUSE')?.aligned;
    const lhLit = !!lhA || w.light >= 3;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const ch = MAP_ROWS[ty][tx]; const x = tx * TILE, y = ty * TILE; const h = hash(tx, ty); this.tileX = tx; this.tileY = ty;
      const base = gv(h % 3 === 0 || w.light < 1 ? T.ground_dark : T.ground);
      switch (ch) {
        case '~': img(x, y, T.water); break;
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
    if (w.water >= 2) for (let tx = 6; tx < 18; tx++) R(P.teal, tx * TILE, 8 * TILE, TILE, TILE, w.water >= 3 ? 0.55 : 0.3);
    if (w.water >= 3) for (let tx = 6; tx < 17; tx++) R(P.teal, tx * TILE, 7 * TILE, TILE, TILE, 0.3);
    if (w.water >= 3) R(P.teal, 5 * TILE, 5 * TILE, TILE, TILE, 0.45);
    if (lampLit) { const p = at('lantern'); R(P.amber, p.x - 10, p.y - 14, 20, 20, 0.1); }
    if (!ghost && w.instability > 40) R(P.violet, 0, 0, VIEW_W, VIEW_H, 0.05);
    if (!ghost) R(P.midnight, 0, 176, VIEW_W, 4);
    c.add(g);
  }

  // ---------- per-frame ----------
  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const s = this.hooks.getState();
    const dir = this.hooks.canMove() && this.endingStart < 0 ? this.hooks.getDir() : { x: 0, y: 0 };
    let dx = dir.x, dy = dir.y;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    const wasMoving = this.moving;
    this.moving = m > 0.01;
    if (this.moving) {
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) { this.facing = dx > 0 ? 1 : -1; this.dirName = 'side'; }
      else if (dy !== 0) this.dirName = dy > 0 ? 'down' : 'up';
      const nx = this.px + dx * MOVE_SPEED * dt, ny = this.py + dy * MOVE_SPEED * dt;
      if (!this.hit(nx, this.py)) this.px = nx;
      if (!this.hit(this.px, ny)) this.py = ny;
      this.walkT += dt;
    }
    if (wasMoving && !this.moving) this.hooks.onMoveEnd(Math.round(this.px), Math.round(this.py));

    // focus: nearest within radius, at most two active
    const near = Object.entries(OBJECT_POSITIONS)
      .map(([id, p]) => ({ id, d: Math.hypot(p.x - this.px, p.y - this.py) }))
      .filter(o => o.d <= INTERACT_RADIUS).sort((a, b) => a.d - b.d).slice(0, 2);
    const f = near[0]?.id ?? null;
    this.secondId = near[1]?.id ?? null;
    if (f !== this.focusId) { this.focusId = f; this.hooks.onFocus(f); }

    this.drawDynamic(time, dt, s);
  }

  private hit(x: number, y: number): boolean {
    return isBlockedPx(x - 4, y - 3) || isBlockedPx(x + 4, y - 3) || isBlockedPx(x - 4, y) || isBlockedPx(x + 4, y);
  }

  private place(spr: Phaser.GameObjects.Sprite, who: 'player' | 'partner', x: number, y: number, dir: Dir, flip: boolean, moving: boolean, alpha: number, tint?: number): void {
    spr.setVisible(alpha > 0).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha).setFlipX(flip);
    if (tint === undefined) spr.clearTint(); else spr.setTint(tint);
    const k = animKey(who, moving ? 'walk' : 'idle', dir);
    if (spr.anims.currentAnim?.key !== k) spr.play(k);
  }

  private drawDynamic(time: number, dt: number, s: Readonly<SimulationState>): void {
    const g = this.dyn; g.clear();
    const t = time / 1000;
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
        const pts = [{ x: p.x, y: by - 1.5 }, { x: p.x + 2.6, y: by + 1.5 }, { x: p.x, y: by + 4.5 }, { x: p.x - 2.6, y: by + 1.5 }];
        g.fillStyle(col, isF ? 1 : 0.8); g.fillPoints(pts, true);
        g.lineStyle(0.6, INK_LINE, 0.95); g.strokePoints(pts, true);
        if (isF || isS) {
          const rr = 8 + (isF ? 2 + 2 * ph : 0), seed = p.x * 0.37 + p.y;
          const ring = Array.from({ length: 15 }, (_, k) => { const a = (k / 14) * Math.PI * 2.05, r = rr + Math.sin(k * 2.3 + seed) * 0.7; return { x: p.x + Math.cos(a) * r, y: p.y - 3 + Math.sin(a) * r }; });
          g.lineStyle(1.3, INK_LINE, (isF ? 0.55 : 0.3)); g.strokePoints(ring, false);
          g.lineStyle(0.6, isF ? P.cyan : P.teal, isF ? 1 : 0.8); g.strokePoints(ring, false);
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
      const a = 0.12 + 0.06 * Math.sin(t * 0.8);
      g.fillStyle(P.amber, a); g.fillTriangle(17 * TILE + 8, 7 * TILE - 34, 17 * TILE - 120, 7 * TILE - 70 + Math.sin(t * 0.5) * 20, 17 * TILE - 120, 7 * TILE + 0 + Math.sin(t * 0.5) * 20);
    }

    // far lamps flicker at drift>=60 (slow, smooth)
    if (drift >= 60 && !reduce) {
      [[24, 22], [300, 150], [200, 18]].forEach(([x, y], i) => {
        g.fillStyle(P.amber, 0.25 + 0.2 * Math.sin(t * 2.4 + i * 2)); g.fillRect(x, y, 2, 3);
      });
    }
    // impossible street glimpse at drift>=80 (1s every 12s, faint)
    if (drift >= 80 && !reduce && (t % 12) < 1) {
      g.fillStyle(P.violet, 0.18); g.fillRect(0, 60, VIEW_W, 6); g.fillRect(140, 0, 6, VIEW_H); g.fillRect(40, 100, 200, 4);
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
      if (ART_INK) { g.lineStyle(1.3, INK_LINE, a * 0.55); g.lineBetween(x0, y0, x1, y1); g.lineStyle(0.6, P.cyan, Math.min(1, a + 0.2)); g.lineBetween(x0, y0, x1, y1); }
      else { g.lineStyle(1, P.cyan, a); g.lineBetween(x0, y0, x1, y1); }
    }
    g.fillStyle(P.cyan, 0.5 + 0.3 * Math.sin(t * 2)); g.fillRect(mote.x - 1, mote.y - 1, 3, 3);

    // beings (sprites)
    if (drift >= 60 && !reduce) {
      g.fillStyle(P.violet, 0.2); g.fillRect(this.px - 11, this.py - 12, 8, 12); g.fillRect(this.px + 5, this.py - 14, 7, 12);
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
      for (let i = 0; i < 40 * bridgeK; i++) {
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
    if (ART_INK) g.lineStyle(0.55, 0x1b263b, 0.4); else g.lineStyle(1, P.mist, 0.28);
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
