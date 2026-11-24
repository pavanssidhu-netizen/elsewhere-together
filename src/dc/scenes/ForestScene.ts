import Phaser from 'phaser';
import { DCScene } from '../base';
import { LINE_BY_ID, type SfxId } from '../content/lines';
import type { Dir, Input, Layer, Order, Pt, Stage, StageView, SfxHint, ViewEvent } from '../forest2/api';
import { buildIsoTextures } from '../forest2/view/isoTex';
import { Iso, TileLayer, ensureViewAnims } from '../forest2/view/tileLayer';
import { Actor, STEP_MS, SAM_COL, JENSEN_COL } from '../forest2/view/actor';
import { Hud } from '../forest2/view/hud';
import { Cards } from '../forest2/view/cards';
import { Beacon } from '../shared/beacon';
import type { RunPort } from '../forest2/view/runPort';
import { createRunPort } from '../forest2/view/runAdapter';

const GOLD = 0xffc850, CYAN = 0x7be0df;
const SFX: Record<SfxHint, SfxId> = {
  step: 'lane_move', plant: 'ui_confirm', pulse: 'echo_cyan', sap: 'pickup', coat: 'pink_flash', root: 'beacon_light', charge: 'pickup', discharge: 'beacon_light',
  pin: 'branch', push: 'lane_move', rift: 'branch', sync: 'reunion_chime', strain: 'warning', paradox: 'thread_snap', ignite: 'beacon_light', lock: 'thread_call',
};
const KEY_DIR: Record<string, Dir> = { ArrowUp: 'N', KeyW: 'N', ArrowDown: 'S', KeyS: 'S', ArrowLeft: 'W', KeyA: 'W', ArrowRight: 'E', KeyD: 'E' };
type Mode = 'CARD' | 'PLAY' | 'LOCK' | 'DONE';
const DISP = (l: Layer): string => (l === 'PAST' ? 'SAM' : 'JENSEN');
const ROLE = (l: Layer): string => (l === 'PAST' ? 'THE BUILDER' : 'THE SCOUT');
const TIPS = [
  'Plant roots, pulse the soil, coat the vine with sap. The past decays into the future.',
  'Two gaps, two wells, and a time rift. A crate pushed into the rift sends sap backwards.',
  'Three gaps and a pillar maze. Sap is scarce, so spend every beat.',
];

export class ForestScene extends DCScene {
  run!: RunPort;
  stage!: Stage;
  v!: StageView;
  private mode: Mode = 'CARD';
  private iso!: Iso;
  private main?: TileLayer;
  private peekL?: TileLayer;
  private beacon?: Beacon;
  private me?: Actor;
  private ghost?: Actor;
  private hud!: Hud;
  private cards!: Cards;
  private haze!: Phaser.GameObjects.Image;
  private backdrop!: Phaser.GameObjects.TileSprite;
  private veinsMain!: Phaser.GameObjects.Graphics;
  private veinsPeek!: Phaser.GameObjects.Graphics;
  private pathG!: Phaser.GameObjects.Graphics;
  private tetherG!: Phaser.GameObjects.Graphics;
  private cap!: Phaser.GameObjects.BitmapText;
  private capBg!: Phaser.GameObjects.Rectangle;
  private capTimer?: Phaser.Time.TimerEvent;
  private peeking = false;
  private dimW = 0; private dimH = 0;
  private touch = false;
  private seed = 0;
  private first = true;
  private said = new Set<string>();
  private lowSaid = false;
  private gone = false;
  private pickOrder: Order = 'PAST_FIRST';
  private lastOrder: Order = 'PAST_FIRST';
  private beaconTile: Pt = { x: 3, y: 3 };
  private builtFor = '';
  private t = 0;
  private timers: Phaser.Time.TimerEvent[] = [];
  private keyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private keyUp = (e: KeyboardEvent): void => { if (e.code === 'KeyC') this.setPeek(false); };

  constructor() { super('ForestScene'); }

  create(): void {
    this.gone = false; this.mode = 'CARD'; this.said = new Set(); this.lowSaid = false; this.peeking = false; this.first = true;
    this.me = undefined; this.ghost = undefined; this.main = undefined; this.peekL = undefined; this.beacon = undefined; this.builtFor = ''; this.timers = [];
    const snap = this.snap;
    const ch = snap?.character ?? 'JENSEN';
    this.seed = snap?.forestSeed ?? snap?.baseSeed ?? 1;
    this.pickOrder = ch === 'SAM' ? 'PAST_FIRST' : 'FUTURE_FIRST';
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).get('touch') === '1';
    buildIsoTextures(this); ensureViewAnims(this);
    this.cameras.main.setBackgroundColor(0x0b1a10);
    this.backdrop = this.add.tileSprite(0, 0, 960, 540, 'tiles/front_lawn').setOrigin(0).setTileScale(2).setTint(0x2c4a2a).setDepth(-5000);
    this.haze = this.add.image(480, 250, 'vfx/p_light_01').setScale(2.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(-800).setAlpha(0.22);
    this.veinsMain = this.add.graphics().setDepth(-950);
    this.veinsPeek = this.add.graphics().setDepth(1950);
    this.pathG = this.add.graphics().setDepth(3300);
    this.tetherG = this.add.graphics().setDepth(5000);
    this.cards = new Cards(this);
    this.hud = new Hud(this, {
      move: d => this.act({ t: 'MOVE', dir: d }), a: () => this.act({ t: 'A' }), b: () => this.act({ t: 'B' }),
      peek: on => this.setPeek(on), endLoop: () => this.act({ t: 'END_LOOP' }), reset: () => this.doReset(),
    }, this.touch);
    this.capBg = this.add.rectangle(480, 50, 560, 30, 0x0b0d18, 0.7).setOrigin(0.5, 0).setDepth(20001).setVisible(false);
    this.cap = this.txt(480, 54, '', 16, 'Aurora16-Smooth', 0xe9e2c8).setOrigin(0.5, 0).setCenterAlign().setDepth(20002).setVisible(false);
    this.hud.setVisible(false);

    this.run = createRunPort(this.seed, ch, this.dc.settings.relaxed);
    this.input.keyboard!.on('keydown', this.keyDown);
    this.input.keyboard!.on('keyup', this.keyUp);
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
    (window as unknown as Record<string, unknown>).__forest2 = { stage: () => this.stage, run: () => this.run, scene: this, mode: () => this.mode };
    if (new URLSearchParams(location.search).has('f2debug')) {
      // test hook only: reference solutions for scripted playthroughs (separate tiny chunk, never loaded in normal play)
      void import('../forest2/solutions').then(m => { const h = (window as unknown as Record<string, Record<string, unknown>>).__forest2; if (h) h.solve = (room: 1 | 2 | 3, order: Order) => m.referenceSolution(room, order, (this.run.raw as { stageSeed: number }).stageSeed); });
    }
    this.dc.audio.playMusic('forest'); this.dc.audio.setBondStress(0.1);
    this.fadeIn(350);
    this.showIntroCard();
  }

  private cleanup(): void {
    if (this.gone) return; this.gone = true;
    this.input.keyboard?.off('keydown', this.keyDown); this.input.keyboard?.off('keyup', this.keyUp);
    this.timers.forEach(t => t.remove()); this.timers = [];
    this.capTimer?.remove(); this.cards?.hide(); this.dc.audio.skipVoice(); this.dc.audio.setBondStress(0);
    this.tweens.killAll();
    const w = window as unknown as Record<string, unknown>; if (w.__forest2 && (w.__forest2 as { scene: unknown }).scene === this) delete w.__forest2;
  }

  private later(ms: number, fn: () => void): void { this.timers.push(this.time.delayedCall(ms, () => { if (!this.gone) fn(); })); }

  // ------------------------------------------------------------------ cards / flow
  private showIntroCard(): void {
    this.mode = 'CARD'; this.hud.setVisible(false); this.hideRoom();
    const r = this.run.room;
    this.cards.card({
      title: r.name.toUpperCase(), sub: `ROOM ${this.run.roomIndex + 1} / 3`, subTint: GOLD, w: 600, h: 300,
      body: [TIPS[this.run.roomIndex] ?? '', '', `${r.w}x${r.h} grid. ${r.budget} beats per loop.`],
      buttons: [{ label: 'CONTINUE', fn: () => this.showChooser(false), primary: true }], autoMs: 3200,
    });
  }

  private showChooser(retry: boolean): void {
    this.mode = 'CARD'; this.hud.setVisible(false);
    this.cards.chooser(retry ? this.lastOrder : this.pickOrder, retry, o => this.startAttempt(o));
  }

  private startAttempt(order: Order): void {
    this.lastOrder = order;
    this.stage = this.run.begin(order); this.v = this.stage.view();
    this.said = new Set();
    this.buildRoom();
    this.me = this.mkActor(this.v.role, false); this.ghost = undefined;
    this.me.place(this.v.me.pos.x, this.v.me.pos.y); this.me.face(this.v.me.facing);
    this.mode = 'PLAY'; this.hud.setVisible(true); this.setPeek(false);
    this.refresh(this.v, [], true);
    if (this.first) { this.first = false; this.say('tm_start'); }
    if (this.run.charges === 1 && !this.lowSaid) { this.lowSaid = true; this.say('tm_charge_low'); }
  }

  private mkActor(role: Layer, ghost: boolean): Actor { return new Actor(this, this.iso, role === 'PAST' ? 'blue' : 'red', ghost); }

  private hideRoom(): void {
    this.main?.setVisible(false); this.peekL?.setVisible(false); this.beacon?.setVisible(false);
    this.me?.setVisible(false); this.ghost?.setVisible(false); this.tetherG.clear(); this.veinsMain.clear(); this.veinsPeek.clear(); this.pathG.clear();
  }

  private buildRoom(): void {
    const r = this.v.room, key = `${r.id}|${r.w}x${r.h}`;
    this.me?.destroy(); this.ghost?.destroy(); this.me = undefined; this.ghost = undefined;
    if (this.builtFor === key && this.main) { this.main.setVisible(true); this.beacon?.setVisible(true); return; }
    this.main?.destroy(); this.peekL?.destroy(); this.beacon?.destroy();
    this.builtFor = key; this.dimW = r.w; this.dimH = r.h;
    const n = r.w + r.h, S = r.w <= 6 ? 1.75 : r.w === 7 ? 1.6 : 1.45;
    const midY = 272 + (this.touch ? -6 : 0);
    this.iso = new Iso(S, 480, midY - ((n - 2) / 2) * 16 * S);
    const reduce = this.dc.settings.reduceMotion;
    this.main = new TileLayer(this, this.iso, { reduceMotion: reduce, floorBase: -1000, objBase: 100, alpha: 1 });
    this.peekL = new TileLayer(this, this.iso, { reduceMotion: reduce, floorBase: 1500, objBase: 2000, alpha: 0.93 });
    this.peekL.setVisible(false);
    // beacon at the BEACON tile(s)
    const pts: Pt[] = [];
    this.v.map.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'BEACON') pts.push({ x, y }); }));
    const bx = pts.reduce((a, p) => a + p.x, 0) / Math.max(1, pts.length), by = pts.reduce((a, p) => a + p.y, 0) / Math.max(1, pts.length);
    this.beaconTile = { x: bx, y: by };
    const bp = { x: this.iso.x(bx, by), y: this.iso.y(bx, by) };
    this.beacon = new Beacon(this, bp.x, bp.y + 16 * S, { scale: S * (pts.length > 1 ? 0.95 : 0.78), dusty: true });
    this.beacon.setDepth(100 + bp.y + 12);
  }

  // ------------------------------------------------------------------ input
  private onKeyDown(e: KeyboardEvent): void {
    if (this.gone) return;
    if (e.repeat) { if (e.code in KEY_DIR || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); return; }
    if (this.cards.key(e)) { e.preventDefault(); return; }
    if (this.mode !== 'PLAY' || !this.live) return;
    const d = KEY_DIR[e.code];
    if (d) { e.preventDefault(); this.act({ t: 'MOVE', dir: d }); return; }
    switch (e.code) {
      case 'KeyZ': case 'Space': e.preventDefault(); this.act({ t: 'A' }); break;
      case 'KeyX': this.act({ t: 'B' }); break;
      case 'KeyC': this.setPeek(true); break;
      case 'KeyR': this.doReset(); break;
      case 'Enter': e.preventDefault(); this.act({ t: 'END_LOOP' }); break;
    }
  }

  private setPeek(on: boolean): void {
    if (on && this.mode !== 'PLAY') return;
    this.peeking = on;
    this.peekL?.setVisible(on); this.veinsPeek.setVisible(on); this.pathG.setVisible(on);
    for (const a of [this.me, this.ghost]) if (a) { a.depthAdd = on ? 3000 : 0; a.sync(); }
    if (on) this.dc.audio.playSfx('echo_cyan');
    if (this.v) this.drawPeekExtras();
  }

  private doReset(): void {
    if (this.mode !== 'PLAY' || !this.live) return;
    this.v = this.stage.resetPhase();
    this.me?.place(this.v.me.pos.x, this.v.me.pos.y); this.me?.face(this.v.me.facing);
    if (this.v.ghost) { this.ghost?.place(this.v.ghost.pos.x, this.v.ghost.pos.y); }
    this.said.delete('b5' + this.v.phase); this.said.delete('b2' + this.v.phase);
    this.dc.audio.playSfx('ui_click');
    this.refresh(this.v, [], true);
  }

  private act(i: Input): void {
    if (this.mode !== 'PLAY' || !this.live) return;
    const prev = this.v;
    this.v = this.stage.input(i);
    const bumped = this.v.events.some(e => e.kind === 'BLOCKED');
    if (i.t === 'MOVE' && bumped) { this.me?.face(i.dir); this.me?.hit(); this.shake(2, 90); }
    this.refresh(this.v, this.v.events, false, prev);
  }

  // ------------------------------------------------------------------ render
  private refresh(v: StageView, evs: ViewEvent[], snap: boolean, prev?: StageView): void {
    if (!this.main || !this.peekL) return;
    const role = v.role, other: Layer = role === 'PAST' ? 'FUTURE' : 'PAST';
    const pins = new Set(v.pins.map(p => p.x + ',' + p.y));
    this.main.update(v.map, role, pins);
    this.peekL.update(v.other, other, pins, (x, y) => !!(v.map[y]?.[x]?.weathering || v.other[y]?.[x]?.weathering || (v.map[y]?.[x]?.kind === 'VINE' && v.other[y]?.[x]?.kind === 'DUST')));
    this.haze.setTint(role === 'PAST' ? 0xffd890 : 0x5fb0d0).setAlpha(role === 'PAST' ? 0.24 : 0.16);
    this.backdrop.setTint(role === 'PAST' ? 0x2f5a2a : 0x2a3038);
    this.cameras.main.setBackgroundColor(role === 'PAST' ? 0x0b1a10 : 0x0c1118);
    // actors
    const ms = snap || this.dc.settings.reduceMotion ? 0 : STEP_MS;
    if (this.me) {
      if (snap) this.me.place(v.me.pos.x, v.me.pos.y); else this.me.moveTo(v.me.pos.x, v.me.pos.y, v.me.facing, ms);
      this.me.face(v.me.facing);
    }
    if (v.ghost) {
      if (!this.ghost) { this.ghost = this.mkActor(role === 'PAST' ? 'FUTURE' : 'PAST', true); this.ghost.place(v.ghost.pos.x, v.ghost.pos.y); }
      if (snap) this.ghost.place(v.ghost.pos.x, v.ghost.pos.y); else this.ghost.moveTo(v.ghost.pos.x, v.ghost.pos.y, v.ghost.facing, ms);
      this.ghost.face(v.ghost.facing);
    } else if (this.ghost && v.phase === 1) { this.ghost.destroy(); this.ghost = undefined; }
    for (const a of [this.me, this.ghost]) if (a) { a.depthAdd = this.peeking ? 3000 : 0; a.sync(); }
    // beacon sockets: amber pips = [root, -, ignition]; cyan pips = [-, charge, ignition]
    const s = v.sockets;
    if (this.beacon) {
      this.beacon.setDusty(!(s.root || s.charge || s.ignition));
      this.beacon.setProgress([s.root, false, s.ignition], [false, s.charge, s.ignition]);
      this.beacon.setFlame(s.root || s.ignition, s.charge || s.ignition); this.beacon.setHarmony(s.ignition);
    }
    this.drawVeins(v);
    this.drawPeekExtras();
    const info = { charges: this.run.charges, maxCharges: this.run.maxCharges, total: this.run.total + (v.status === 'CLEARED' ? 0 : 0), roomLabel: `ROOM ${this.run.roomIndex + 1}/3   ${role} LAYER`, phaseText: `PHASE ${v.phase}: ${DISP(role)}, ${ROLE(role)}`, showTouch: this.touch };
    this.hud.update(v, info, this.peeking);
    // audio mood
    const left = v.budget - v.beat;
    const final = this.run.charges === 1 || (v.phase === 2 && left <= 5 && v.status === 'PLAYING');
    this.dc.audio.playMusic(final ? 'final_minute' : 'forest');
    this.dc.audio.setBondStress(v.doomed ? 0.9 : v.tether?.strained ? 0.6 : 0.1);
    // events -> fx / sfx / voice
    for (const e of evs) this.onEvent(e, v);
    if (v.status === 'PLAYING') {
      if (left <= 5 && left > 2 && !this.said.has('b5' + v.phase) && v.beat > 0) { this.said.add('b5' + v.phase); this.say('tm_beats_5'); }
      if (left <= 2 && left > 0 && !this.said.has('b2' + v.phase)) { this.said.add('b2' + v.phase); this.said.add('b5' + v.phase); this.say('tm_beats_2'); }
    }
    void prev;
    if (v.status === 'PHASE1_DONE' && this.mode === 'PLAY') this.timeLock();
    else if (v.status === 'CLEARED' && this.mode === 'PLAY') this.onCleared();
    else if (v.status === 'FAILED' && this.mode === 'PLAY') this.onFailed();
  }

  private veinPath(g: Phaser.GameObjects.Graphics, from: Pt, col: number, lit: boolean, alpha = 1): void {
    const b = this.beaconTile, I = this.iso;
    const pts = [new Phaser.Math.Vector2(I.x(from.x, from.y), I.y(from.x, from.y)), new Phaser.Math.Vector2(I.x(b.x, from.y), I.y(b.x, from.y)), new Phaser.Math.Vector2(I.x(b.x, b.y), I.y(b.x, b.y))];
    g.lineStyle(lit ? 7 : 4, col, (lit ? 0.28 : 0.1) * alpha).strokePoints(pts, false);
    g.lineStyle(lit ? 2.5 : 1.5, col, (lit ? 1 : 0.4) * alpha).strokePoints(pts, false);
  }

  private drawVeins(v: StageView): void {
    this.veinsMain.clear(); this.veinsPeek.clear();
    const draw = (g: Phaser.GameObjects.Graphics, map: StageView['map'], layer: Layer): void => {
      const col = layer === 'PAST' ? GOLD : CYAN;
      let plate: Pt | null = null, ruin: Pt | null = null;
      map.forEach((row, y) => row.forEach((t, x) => {
        if (t.kind === 'ROOT_PLATE') this.veinPath(g, { x, y }, GOLD, !!v.sockets.root || !!t.lit);
        if (t.kind === 'CONDUIT_PLATE') { plate = { x, y }; this.veinPath(g, { x, y }, CYAN, !!v.sockets.charge || !!t.lit); }
        if (t.kind === 'RUIN') ruin = { x, y };
        if (t.kind === 'RIFT') this.veinPath(g, { x, y }, 0xb08cff, false);
      }));
      const p = plate as Pt | null, r = ruin as Pt | null;
      if (p && r) {
        const I = this.iso; g.lineStyle(1.5, CYAN, 0.35).strokePoints([new Phaser.Math.Vector2(I.x(r.x, r.y), I.y(r.x, r.y)), new Phaser.Math.Vector2(I.x(p.x, p.y), I.y(p.x, p.y))], false);
      }
      void col;
    };
    draw(this.veinsMain, v.map, v.role);
    draw(this.veinsPeek, v.other, v.role === 'PAST' ? 'FUTURE' : 'PAST');
    this.veinsPeek.setVisible(this.peeking);
  }

  private drawPeekExtras(): void {
    const g = this.pathG.clear(); const v = this.v;
    if (!this.peeking || !v?.ghost) return;
    const col = this.ghost?.ringColor ?? GOLD, I = this.iso, path = v.ghost.path;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      const x1 = I.x(a.x, a.y), y1 = I.y(a.x, a.y), x2 = I.x(b.x, b.y), y2 = I.y(b.x, b.y);
      g.lineStyle(2.5, col, i < v.ghost.beatIndex ? 0.35 : 0.8).lineBetween(x1, y1, x2, y2);
    }
    path.forEach((p, i) => { g.fillStyle(col, i === v.ghost!.beatIndex ? 1 : 0.55).fillCircle(I.x(p.x, p.y), I.y(p.x, p.y), i === v.ghost!.beatIndex ? 4 : 2); });
  }

  private onEvent(e: ViewEvent, v: StageView): void {
    const isGhost = (e as { ghost?: boolean }).ghost === true;
    let id: SfxId | undefined = e.sfx ? SFX[e.sfx] : undefined;
    if (e.kind === 'BLOCKED') id = 'hit';
    else if (!e.sfx) id = e.kind === 'PARADOX' ? 'thread_snap' : e.kind === 'IGNITION' ? 'beacon_light' : e.kind === 'SYNC_BOOST' ? 'reunion_chime' : undefined;
    if (isGhost && (e.sfx === 'step' || e.kind === 'BLOCKED')) id = undefined;
    if (id) this.dc.audio.playSfx(id);
    const at = e.at ?? v.me.pos;
    const still = this.dc.settings.reduceMotion;
    switch (e.kind) {
      case 'PLANTED': case 'VINE_GREW': case 'COATED': this.burst(at, 0x8cff8c); break;
      case 'PULSED': this.ring(at, 0xb6ff9a); break;
      case 'SAP_TAKEN': case 'CHARGE_TAKEN': case 'SAP_ARRIVED': this.burst(at, e.kind === 'CHARGE_TAKEN' ? CYAN : GOLD); break;
      case 'ROOT_LIT': this.burst(at, GOLD); break;
      case 'CHARGE_LIT': this.burst(at, CYAN); break;
      case 'PIN_DROPPED': case 'RIFT_SENT': this.ring(at, 0xffffff); break;
      case 'SYNC_BOOST': this.ring(v.me.pos, 0xfff2a0); this.toast('SYNC BOOST +1 beat, multiplier up'); break;
      case 'STRAINED': this.toast('TETHER STRAINED: moves cost 2 beats'); break;
      case 'IGNITION': if (!still) this.cameras.main.flash(300, 255, 240, 200); this.beacon?.pulse(0xfff2c4); break;
      case 'PARADOX': this.say('tm_paradox'); if (!still) { this.cameras.main.flash(260, 255, 60, 60); } this.shake(5, 300); break;
      default: break;
    }
    if (e.text && e.kind !== 'MOVED' && e.kind !== 'NOTHING') this.toast(e.text);
    if (e.kind === 'NOTHING' && e.text) this.toast(e.text);
  }

  private burst(at: Pt, tint: number): void {
    const x = this.iso.x(at.x, at.y), y = this.iso.y(at.x, at.y) - 10;
    this.ring(at, tint);
    if (this.dc.settings.reduceMotion) return;
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(x, y, 'vfx/p_star_01').setTint(tint).setScale(0.04 * this.iso.S).setBlendMode(Phaser.BlendModes.ADD).setDepth(6000);
      this.tweens.add({ targets: s, x: x + Math.cos(i * 1.05) * 26, y: y - 8 + Math.sin(i * 1.05) * 18 - 14, alpha: 0, duration: 520, onComplete: () => s.destroy() });
    }
  }
  private ring(at: Pt, tint: number): void {
    const x = this.iso.x(at.x, at.y), y = this.iso.y(at.x, at.y);
    const r = this.add.image(x, y, 'vfx/p_circle_05').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.05 * this.iso.S, 0.025 * this.iso.S).setAlpha(0.95).setDepth(6000);
    this.tweens.add({ targets: r, scaleX: 0.3 * this.iso.S, scaleY: 0.15 * this.iso.S, alpha: 0, duration: this.dc.settings.reduceMotion ? 200 : 520, onComplete: () => r.destroy() });
  }
  private shake(px: number, ms: number): void { if (!this.dc.settings.reduceMotion) this.cameras.main.shake(ms, px / 1000); }
  private toast(s: string): void { this.caption(s, 'sys'); }

  private say(id: string): void {
    const l = LINE_BY_ID[id]; if (!l) return;
    void this.dc.audio.playVoice(id);
    this.caption(l.text, 'tm');
  }
  private caption(text: string, kind: 'tm' | 'sys'): void {
    this.cap.setText(text).setTint(kind === 'tm' ? 0xffe2a0 : 0xd7f6f5).setVisible(true).setMaxWidth(520);
    this.capBg.setVisible(true).setSize(this.cap.width + 24, this.cap.height + 8);
    this.capTimer?.remove();
    this.capTimer = this.time.delayedCall(kind === 'tm' ? 3800 : 2200, () => { this.cap.setVisible(false); this.capBg.setVisible(false); });
  }

  // ------------------------------------------------------------------ Time-Lock
  private timeLock(): void {
    this.mode = 'LOCK'; this.setPeek(false);
    const me = this.me!, still = this.dc.settings.reduceMotion;
    this.dc.audio.playSfx('thread_call'); this.say('tm_loop_lock');
    const p = { x: me.px, y: me.py - 24 * this.iso.S };
    if (!still) {
      const f = this.add.sprite(p.x, p.y, 'vfx/charge').setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(6000).play('f2-charge');
      f.once('animationcomplete', () => f.destroy());
    }
    // padlock icon (UI overlay shape)
    const lk = this.add.graphics().setDepth(6001).setPosition(p.x, p.y - 8);
    lk.lineStyle(4, 0xffe9a0, 1).beginPath().arc(0, -6, 8, Math.PI, 0, false).strokePath();
    lk.fillStyle(0xffc850, 1).fillRoundedRect(-12, -6, 24, 18, 3); lk.fillStyle(0x3a2a10, 1).fillCircle(0, 3, 3);
    this.tweens.add({ targets: lk, y: lk.y - 26, alpha: 0, duration: 1300, delay: 300, onComplete: () => lk.destroy() });
    me.toGhost();
    this.tweens.add({ targets: me.spr, alpha: 0.45, duration: still ? 50 : 500 });
    this.later(still ? 200 : 1000, () => {
      this.v = this.stage.beginPhase2();
      const old = me; this.me = undefined;
      this.ghost?.destroy();
      this.ghost = old;
      this.me = this.mkActor(this.v.role, false);
      this.me.place(this.v.me.pos.x, this.v.me.pos.y); this.me.face(this.v.me.facing);
      this.me.spr.setAlpha(0); this.tweens.add({ targets: this.me.spr, alpha: 1, duration: still ? 50 : 400 });
      const g = this.v.ghost; if (g) old.moveTo(g.pos.x, g.pos.y, g.facing, still ? 0 : 500);
      if (!still) this.cameras.main.flash(260, 200, 240, 255);
      this.mode = 'PLAY';
      this.said.delete('b52'); this.said.delete('b22');
      this.refresh(this.v, [], false);
    });
  }

  // ------------------------------------------------------------------ results
  private onCleared(): void {
    this.mode = 'DONE'; this.setPeek(false);
    const v = this.v, st = this.stage;
    const info = this.run.cleared(st);
    this.say('tm_stage_clear');
    this.later(1800, () => { void this.dc.audio.playVoice(this.snap?.character === 'SAM' ? 'sam_cheer' : 'jensen_cheer'); });
    const sc = v.score;
    const rows: [string, string, number?][] = [
      ['Base clear' + (v.order === 'PAST_FIRST' ? ' (x1.25 foresight)' : ''), String(sc.base)],
      ['Efficiency (spare beats)', String(sc.efficiency)],
      ['Symbiosis', String(sc.symbiosis)],
      ['Multiplier reached', 'x' + sc.multiplier, 0xfff2a0],
      ['STAGE SCORE', String(sc.total), 0xffd060],
      ['RUN TOTAL', String(this.run.total), 0xffffff],
    ];
    const star = info.hasStar ? 'CHRONO-MASTERY STAR EARNED' + (info.starEarned ? ' (new!)' : '') : info.needOther ? `Star: also clear this room as ${info.needOther === 'PAST_FIRST' ? 'SAM first' : 'JENSEN first'}` : '';
    this.later(this.dc.settings.reduceMotion ? 300 : 1100, () => {
      this.mode = 'CARD'; this.hud.setVisible(false);
      this.cards.card({
        title: 'ROOM CLEARED', titleTint: 0xffe08a, sub: v.room.name + '   ' + (v.order === 'PAST_FIRST' ? 'SAM FIRST' : 'JENSEN FIRST'), rows, body: star ? [star] : [], bodyTint: info.hasStar ? 0xffe08a : 0xbcd8d8, w: 620, h: 420,
        buttons: [{ label: info.lastRoom ? 'FINISH THE RUN' : 'NEXT ROOM', primary: true, fn: () => this.afterClear(info.lastRoom) }],
      });
    });
  }

  private afterClear(last: boolean): void {
    this.run.advance();
    if (!last) { this.showIntroCard(); return; }
    this.finalCard(true);
  }

  private onFailed(): void {
    this.mode = 'DONE'; this.setPeek(false);
    const v = this.v;
    this.run.failed(this.stage);
    const left = this.run.charges;
    if (left === 1 && !this.lowSaid) { this.lowSaid = true; this.later(2600, () => this.say('tm_charge_low')); }
    const hint = v.failReason === 'PARADOX'
      ? 'A Blueprint Pin is only a promise. Sam has to really build what Jensen assumed (coat the vine, make the bark) before Jensen walks it. Hold C to Peek at the ghost route.'
      : v.failReason === 'BUDGET' ? 'Out of beats. Hold C to Peek for a shorter route, and press END LOOP early when your job is done.'
      : 'Both shrooms must stand on their conduits on the same beat, with the root and charge sockets already lit. Peek at the ghost to time it.';
    this.later(this.dc.settings.reduceMotion ? 200 : 1000, () => {
      this.mode = 'CARD'; this.hud.setVisible(false);
      if (this.run.result === 'LOST') { this.finalCard(false); return; }
      this.cards.card({
        title: v.failReason === 'PARADOX' ? 'PARADOX!' : 'LOOP FAILED', titleTint: 0xff8a7a, sub: v.failText ?? 'The loop did not close.', subTint: 0xffd8c8, w: 640, h: 380,
        rows: [['Thread charges left', `${left} / ${this.run.maxCharges}`, left <= 1 ? 0xff8a7a : 0xfff1c9]], body: ['Why: ' + hint],
        buttons: [{ label: 'RETRY ROOM', primary: true, fn: () => this.showChooser(true) }],
      });
    });
  }

  private finalCard(won: boolean): void {
    this.mode = 'CARD'; this.hud.setVisible(false); this.hideRoom();
    const medal = this.run.medal();
    const tint = { GOLD: 0xffd24a, SILVER: 0xd8e0e8, BRONZE: 0xd8883a, NONE: 0x8a8a8a }[medal];
    if (!won) this.say('tm_forest_fail');
    this.cards.card({
      title: won ? 'THE THREAD HOLDS' : 'THE THREAD SNAPS', titleTint: won ? 0xffe08a : 0xff8a7a, w: 560, h: 380,
      sub: won ? 'All three rooms cleared.' : 'No Thread charges left.',
      icon: won && medal !== 'NONE' ? { key: 'runner/Diamond', tint, scale: 2.6 } : undefined,
      rows: [['Run score', String(this.run.total), 0xffffff], ['Medal', medal === 'NONE' ? 'none' : medal, tint]],
      buttons: [{ label: 'CONTINUE', primary: true, fn: () => this.finish(won) }],
    });
  }

  private finish(won: boolean): void {
    if (this.gone) return;
    const sum = this.run.summary(); sum.won = won;
    this.dc.session.forestSummary = sum; this.dc.session.forestState = null;
    this.send({ type: won ? 'FOREST_WON' : 'FOREST_LOST' });
  }

  // ------------------------------------------------------------------ per-frame
  update(_t: number, dt: number): void {
    this.t += dt;
    this.backdrop.tilePositionX += dt * 0.004; this.backdrop.tilePositionY += dt * 0.002;
    const g = this.tetherG.clear();
    for (const a of [this.me, this.ghost]) a?.sync();
    if (this.mode === 'PLAY' || this.mode === 'LOCK') {
      const v = this.v, me = this.me, gh = this.ghost;
      if (v?.ghost && me && gh && this.mode === 'PLAY') {
        const k = this.iso.S, x1 = me.px, y1 = me.py - 18 * k, x2 = gh.px, y2 = gh.py - 18 * k;
        const strained = !!v.tether?.strained, pulse = strained ? 0.55 + 0.45 * Math.sin(this.t / 90) : 1;
        const col = strained ? 0xe0304a : v.tether && v.tether.dist > 2 ? 0xc8e060 : 0x62e07a;
        g.lineStyle(7, col, 0.22 * pulse).lineBetween(x1, y1, x2, y2);
        g.lineStyle(2, col, 0.95 * pulse).lineBetween(x1, y1, x2, y2);
        for (let i = 0; i < 3; i++) { const f = ((this.t / 1400 + i / 3) % 1); g.fillStyle(0xffffff, 0.8 * pulse).fillCircle(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, 2); }
      }
    }
  }
}
