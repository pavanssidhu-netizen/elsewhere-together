import Phaser from 'phaser';
import { DCScene } from '../base';
import { LINE_BY_ID } from '../content/lines';
import { ForestModel, bondStress } from '../forest/forestModel';
import { WorldView } from '../forest/worldView';
import { FEET, OBJECT_NAME, SHORT, USABLE, bfs, captionMs, dirIndex, px, stressTint, verbsFor, type Usable } from '../forest/layout';
import { OBJECT_TILES, TILE, MAP_H, MAP_W, getNearbyInteractables, getWalkability, tileOf } from '../../world/topology';
import { alternateOf, availableActions } from '../../sim/engine';
import { objectiveHint } from '../../sim/planner';
import { beaconProgress } from '../../sim/core';
import type { Command, DomainEvent, PhysicalAction, SimulationState } from '../../sim/types';

const ZOOM = 2.5;                 // 960 / (32 * 2.5) = 12 tiles across
const SPEED = 3.5;                // tiles per second
const INSTRUCTION_S = 4.0;
const CYAN = 0x7be0df, PINK = 0xe8a0b4, AMBER = 0xffd48a;
const LANDMARK: Record<string, string> = { CLEARING: 'lantern', CROSSING: 'bridge', GARDEN: 'greenhouse', TOWER: 'radio', BEACON: 'anchor_LIGHTHOUSE' };

type Kind = 'world' | 'partner' | 'echo' | 'tm' | 'fork' | 'warn';
interface Caption { text: string; kind: Kind; ms: number }
interface Echo { spr: Phaser.GameObjects.Sprite; ring: Phaser.GameObjects.Image; until: number; x: number; y: number }

const KIND_TINT: Record<Kind, number> = { world: 0xffffff, partner: CYAN, echo: CYAN, tm: AMBER, fork: PINK, warn: 0xffb0b0 };

export class ForestScene extends DCScene {
  model!: ForestModel;
  private view!: WorldView;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Image;
  private col: 'red' | 'blue' = 'red';
  private pl = { tx: 0, ty: 0, x: 0, y: 0, fx: 0, fy: 0, moving: false, t: 0, dir: 0, ax: 0, ay: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { id: -1, dx: 0, dy: 0, cx: 0, cy: 0 };
  private path: { tx: number; ty: number }[] = [];
  private phase: 'INTRO' | 'PLAY' | 'END' = 'INTRO';
  private introLeft = INSTRUCTION_S;
  private timerText!: Phaser.GameObjects.BitmapText;
  private tagText!: Phaser.GameObjects.BitmapText;
  private invText!: Phaser.GameObjects.BitmapText;
  private capBox!: Phaser.GameObjects.Image;
  private capText!: Phaser.GameObjects.BitmapText;
  private captions: Caption[] = [];
  private capUntil = 0;
  private lastCap = { text: '', at: 0 };
  private label!: Phaser.GameObjects.BitmapText;
  private labelBg!: Phaser.GameObjects.Image;
  private btnA!: Phaser.GameObjects.Container;
  private btnB!: Phaser.GameObjects.Container;
  private btnC!: Phaser.GameObjects.Container;
  private btnW!: Phaser.GameObjects.Container;
  private focus: Usable | null = null;
  private cool!: Phaser.GameObjects.Image;
  private vig!: Phaser.GameObjects.Image;
  private bloomImg!: Phaser.GameObjects.Image;
  private alienTint!: Phaser.GameObjects.Rectangle;
  private echoes: Echo[] = [];
  private cm: Phaser.FX.ColorMatrix | null = null;
  private stress = 0;
  private musicFinal = false;
  private lastActAt = -9;
  private nowMs = 0;
  private lastProgress = 0;
  private lastEventCount = 0;
  private hintAt = -99;
  private blockedAt = -99;
  private done = false;
  private firstEcho = true;
  private touch = false;
  private offscreen!: Phaser.GameObjects.Image;
  private idleTimer = 0;

  constructor() { super('ForestScene'); }

  create(): void {
    const snap = this.snap;
    const character = snap?.character ?? 'JENSEN';
    const seed = snap?.forestSeed ?? snap?.baseSeed ?? 48219;
    this.col = character === 'SAM' ? 'blue' : 'red';
    this.model = new ForestModel(seed, character, this.dc.settings.relaxed);
    this.phase = 'INTRO'; this.introLeft = INSTRUCTION_S; this.done = false;
    this.captions = []; this.echoes = []; this.focus = null; this.path = []; this.stress = 0; this.musicFinal = false; this.nowMs = 0; this.firstEcho = true;
    this.cameras.main.setBackgroundColor(0x0b1a10);
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).get('touch') === '1';

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer().setDepth(100000);
    const s0 = this.model.state;
    this.view = new WorldView(this, this.worldLayer, s0, this.dc.settings.reduceMotion);

    this.makePlayer(s0);
    this.makeCameras();
    this.makeHud();
    this.makeInput();
    this.refreshAll(s0);

    const off = this.model.engine.subscribe((s, evs) => this.onSim(s, evs));
    this.events.once('shutdown', () => { off(); this.dc.audio.skipVoice(); this.tweens.killAll(); });
    this.dc.audio.playMusic('forest');
    this.dc.audio.setBondStress(0);
    void this.dc.audio.playVoice('tm_start');
    this.pushCaption(LINE_BY_ID.tm_start.text, 'tm', 3900);
    this.fadeIn(350);
    (window as unknown as Record<string, unknown>).__forest = this;
  }

  // ---------------------------------------------------------------- construction
  private makePlayer(s: Readonly<SimulationState>): void {
    for (const col of ['red', 'blue'] as const) for (let d = 0; d < 8; d++) {
      const k = `mu-${col}-idle-${d}`;
      if (!this.anims.exists(k)) {
        this.anims.create({ key: k, frames: this.anims.generateFrameNumbers('myconid/' + col, { start: d * 40, end: d * 40 + 7 }), frameRate: 5.3, repeat: -1 });
        this.anims.create({ key: `mu-${col}-walk-${d}`, frames: this.anims.generateFrameNumbers('myconid/' + col, { start: d * 40 + 8, end: d * 40 + 15 }), frameRate: 9.6, repeat: -1 });
      }
    }
    const t = { tx: s.v2.gridX, ty: s.v2.gridY };
    this.pl.tx = t.tx; this.pl.ty = t.ty; this.pl.x = px(t.tx); this.pl.y = px(t.ty) + FEET; this.pl.dir = 6; // face east, toward the clearing
    this.shadow = this.add.image(0, 0, 'vfx/p_circle_05').setTint(0x000000).setAlpha(0.28).setScale(0.07, 0.035);
    this.player = this.add.sprite(0, 0, 'myconid/' + this.col).setScale(0.78).setOrigin(0.5, 42 / 64);
    this.worldLayer.add([this.shadow, this.player]);
    this.player.play(`mu-${this.col}-idle-${this.pl.dir}`);
    this.placePlayer();
  }

  private placePlayer(): void {
    this.player.setPosition(this.pl.x, this.pl.y).setDepth(this.pl.y);
    this.shadow.setPosition(this.pl.x, this.pl.y + 1).setDepth(this.pl.y - 1);
  }

  private makeCameras(): void {
    const main = this.cameras.main;
    main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE).setZoom(ZOOM).setRoundPixels(true);
    main.startFollow(this.player, true, 0.14, 0.14).setDeadzone(24, 14);
    main.centerOn(this.pl.x, this.pl.y);
    this.uiCam = this.cameras.add(0, 0, this.W, this.H);
    this.uiCam.setScroll(0, 0);
    main.ignore(this.uiLayer);
    // world camera layers get ignored by the HUD camera through the layer filter bit (children added later inherit it)
    this.worldLayer.cameraFilter |= this.uiCam.id;
    this.uiLayer.cameraFilter |= main.id;
    this.shadow.cameraFilter |= this.uiCam.id; this.player.cameraFilter |= this.uiCam.id;
    if (!this.dc.settings.reduceMotion || true) {
      try { this.cm = main.postFX ? main.postFX.addColorMatrix() : null; } catch { this.cm = null; }
    }
    this.events.once('shutdown', () => { if (this.uiCam) this.cameras.remove(this.uiCam, true); });
  }

  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T { this.uiLayer.add(o); return o; }

  private canvasTex(key: string, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (this.textures.exists(key)) return;
    const t = this.textures.createCanvas(key, this.W, this.H);
    if (!t) return;
    draw(t.getContext(), this.W, this.H); t.refresh();
  }

  private makeHud(): void {
    const W = this.W, H = this.H;
    // overlays: bond-stress cool wash + dark edge, pink fork bloom, alien tint
    this.canvasTex('dc-vig', (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, h * 0.95); g.addColorStop(0, 'rgba(10,18,40,0)'); g.addColorStop(1, 'rgba(10,18,40,0.9)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    this.canvasTex('dc-bloom', (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85); g.addColorStop(0, 'rgba(232,160,180,0)'); g.addColorStop(1, 'rgba(232,160,180,0.95)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    this.canvasTex('dc-cool', (c, w, h) => { c.fillStyle = 'rgb(150,180,220)'; c.fillRect(0, 0, w, h); });
    this.cool = this.ui(this.add.image(W / 2, H / 2, 'dc-cool').setAlpha(0).setBlendMode(Phaser.BlendModes.MULTIPLY));
    this.vig = this.ui(this.add.image(W / 2, H / 2, 'dc-vig').setAlpha(0));
    this.bloomImg = this.ui(this.add.image(W / 2, H / 2, 'dc-bloom').setAlpha(0).setBlendMode(Phaser.BlendModes.ADD));
    this.alienTint = this.ui(this.add.rectangle(W / 2, H / 2, W, H, 0x8a3fb0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY));

    // timer (top centre) and a small tag
    this.timerText = this.ui(this.add.bitmapText(W / 2, 10, 'fonts/Pepper16-Bold', '3:00', 28).setOrigin(0.5, 0).setTint(0xfff1c9).setDropShadow(1, 2, 0x000000, 0.8));
    const sam = this.model.character === 'SAM';
    this.tagText = this.ui(this.add.bitmapText(14, 10, 'fonts/Aurora16-Smooth', sam ? 'SAM  (the past)' : 'JENSEN  (the future)', 16).setTint(sam ? 0x8fb8ff : 0xff9c8f).setDropShadow(1, 1, 0x000000, 0.9));
    this.invText = this.ui(this.add.bitmapText(14, 32, 'fonts/Aurora16-Smooth', '', 16).setTint(0xfff1c9).setDropShadow(1, 1, 0x000000, 0.9));

    // caption strip
    this.capBox = this.ui(this.add.image(W / 2, H - 112, 'ui/dialog-box').setDisplaySize(800, 74).setAlpha(0).setTint(0x9aa6c0));
    this.capText = this.ui(this.add.bitmapText(W / 2, H - 112, 'fonts/Aurora16-Smooth', '', 16).setOrigin(0.5).setMaxWidth(740).setCenterAlign().setAlpha(0));

    // focus label above the player's reach
    this.labelBg = this.ui(this.add.image(0, 0, 'ui/dialog-box').setDisplaySize(10, 10).setAlpha(0));
    this.label = this.ui(this.add.bitmapText(0, 0, 'fonts/Aurora16-Smooth', '', 16).setOrigin(0.5).setAlpha(0).setDropShadow(1, 1, 0x000000, 0.9));

    // buttons (bottom-right): primary, secondary, call, warn. Hit areas >= 72 x 56 game px (44 CSS px on a 640 px wide phone)
    const mk = (x: number, y: number, w: number, label: string, tint: number, fn: () => void) => {
      const img = this.add.image(0, 0, 'ui/button-normal').setDisplaySize(w, w * 0.34).setTint(tint);
      const t = this.add.bitmapText(0, -2, 'fonts/Aurora16-Smooth', label, 16).setOrigin(0.5).setTint(0xfff1c9);
      const c = this.add.container(x, y, [img, t]).setSize(Math.max(w, 96), 58).setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p: Phaser.Input.Pointer) => { p.event?.stopPropagation?.(); img.setTexture('ui/button-pressed'); fn(); });
      c.on('pointerup', () => img.setTexture('ui/button-normal'));
      c.on('pointerout', () => img.setTexture('ui/button-normal'));
      c.setData('t', t); c.setData('img', img);
      return this.ui(c);
    };
    this.btnA = mk(W - 108, H - 40, 190, 'E  Use', 0xffffff, () => this.doVerb(0));
    this.btnB = mk(W - 108, H - 100, 150, 'Q  Other', 0xcfd8ff, () => this.doVerb(1));
    this.btnC = mk(W - 276, H - 40, 150, 'C  Call', 0x9ff0ee, () => this.call('CALL'));
    this.btnW = mk(W - 276, H - 100, 120, 'V  Warn', 0xe8a0b4, () => this.call('WARNING'));
    [this.btnA, this.btnB, this.btnC, this.btnW].forEach(b => b.setDepth(10));
    if (this.touch) {
      const base = this.ui(this.add.image(120, H - 120, 'vfx/p_circle_05').setScale(0.3).setAlpha(0.22));
      const thumb = this.ui(this.add.image(120, H - 120, 'vfx/p_circle_05').setScale(0.14).setAlpha(0.45));
      base.setName('stickBase'); thumb.setName('stickThumb');
    }
    this.offscreen = this.ui(this.add.image(0, 0, 'vfx/p_star_04').setTint(CYAN).setScale(0.07).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD));
  }

  private makeInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,Q,F,C,V,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;
    for (const [k, fn] of [['E', () => this.doVerb(0)], ['SPACE', () => this.doVerb(0)], ['Q', () => this.doVerb(1)], ['F', () => this.doVerb(1)], ['C', () => this.call('CALL')], ['V', () => this.call('WARNING')]] as const) {
      this.keys[k].on('down', fn);
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'PLAY') return;
      const over = this.input.hitTestPointer(p).length > 0;
      if (over) return;
      if (this.touch && p.x < this.W * 0.38 && p.y > this.H * 0.4) { this.stick = { id: p.id, dx: 0, dy: 0, cx: p.x, cy: p.y }; this.moveStickGfx(p.x, p.y, p.x, p.y); return; }
      this.walkTo(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.stick.id !== p.id) return;
      const dx = p.x - this.stick.cx, dy = p.y - this.stick.cy, d = Math.hypot(dx, dy);
      const k = Math.min(1, d / 50);
      this.stick.dx = d > 14 ? dx / d * k : 0; this.stick.dy = d > 14 ? dy / d * k : 0;
      this.moveStickGfx(this.stick.cx, this.stick.cy, this.stick.cx + dx / Math.max(1, d) * Math.min(d, 50), this.stick.cy + dy / Math.max(1, d) * Math.min(d, 50));
    });
    const release = (p: Phaser.Input.Pointer) => { if (this.stick.id === p.id) { this.stick.id = -1; this.stick.dx = this.stick.dy = 0; this.moveStickGfx(120, this.H - 120, 120, this.H - 120); } };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);
  }

  private moveStickGfx(bx: number, by: number, tx: number, ty: number): void {
    const b = this.uiLayer.getByName('stickBase') as Phaser.GameObjects.Image | null, t = this.uiLayer.getByName('stickThumb') as Phaser.GameObjects.Image | null;
    b?.setPosition(bx, by); t?.setPosition(tx, ty);
  }

  private walkTo(p: Phaser.Input.Pointer): void {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    const s = this.model.state, n = s.nodes[s.player.nodeId];
    const grid = getWalkability(n.world, n.flags, s.v2.realm);
    let tgt = { tx, ty };
    if (!grid[ty]?.[tx]) { // tapped something solid (an object, a tree): walk to the nearest walkable neighbour
      const cand = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ tx: tx + dx, ty: ty + dy })).filter(c => grid[c.ty]?.[c.tx]);
      if (!cand.length) return;
      cand.sort((a, b) => Math.hypot(a.tx - this.pl.tx, a.ty - this.pl.ty) - Math.hypot(b.tx - this.pl.tx, b.ty - this.pl.ty));
      tgt = cand[0];
    }
    const path = bfs(grid, { tx: this.pl.moving ? this.pl.ax : this.pl.tx, ty: this.pl.moving ? this.pl.ay : this.pl.ty }, tgt);
    this.path = path ?? [];
    if (!path) this.pushCaption('No way through from here. Look for a bridge, a ford or a drier path.', 'world');
  }

  // ---------------------------------------------------------------- captions
  private pushCaption(text: string, kind: Kind, ms?: number): void {
    if (!text) return;
    if (text === this.lastCap.text && this.nowMs - this.lastCap.at < 6000) return;
    this.lastCap = { text, at: this.nowMs };
    if (this.captions.some(c => c.text === text)) return;
    this.captions.push({ text, kind, ms: ms ?? captionMs(text) });
    if (this.captions.length > 3) this.captions.splice(0, this.captions.length - 3);
  }

  private tickCaptions(): void {
    if (this.nowMs < this.capUntil) return;
    const c = this.captions.shift();
    if (!c) { this.tweens.add({ targets: [this.capBox, this.capText], alpha: 0, duration: 180, overwrite: true }); this.capUntil = this.nowMs + 120; return; }
    this.capText.setText(c.text).setTint(KIND_TINT[c.kind]);
    const lines = Math.ceil(c.text.length / 62);
    this.capBox.setDisplaySize(800, 40 + 22 * Math.min(lines, 3)).setTint(c.kind === 'echo' || c.kind === 'partner' ? 0x7fb9c0 : c.kind === 'fork' ? 0xd7a5b5 : 0x9aa6c0);
    this.tweens.add({ targets: this.capBox, alpha: 0.88, duration: 160, overwrite: true });
    this.tweens.add({ targets: this.capText, alpha: 1, duration: 160, overwrite: true });
    this.capUntil = this.nowMs + c.ms;
  }

  // ---------------------------------------------------------------- sim -> presentation
  private onSim(s: Readonly<SimulationState>, evs: DomainEvent[]): void {
    const texts = new Set<string>();
    for (const e of evs) {
      switch (e.type) {
        case 'FORK_RESOLVED': this.bloom(); this.dc.audio.playSfx('branch'); break;
        case 'WORLD_CHANGED':
          if (e.text) { texts.add(e.text); this.pushCaption(e.text, 'world'); }
          if (e.objectId && (USABLE as readonly string[]).includes(e.objectId)) this.ringAt(e.objectId, 0xfff1c9);
          break;
        case 'PARTNER_TRACE': this.echoAt(e.objectId, e.text); break;
        case 'TEMPORAL':
          this.dc.audio.playSfx('echo_cyan');
          if (e.toActor === 'player') this.echoAt(e.objectId, e.text, true);
          else this.pushCaption(`Your work travels forward along the Thread: ${e.change.text}`, 'echo');
          break;
        case 'VOICE': if (!texts.has(e.text)) this.pushCaption(e.text, 'partner'); break;
        case 'WARNING': this.pushCaption(e.text, 'warn'); this.dc.audio.playSfx('warning'); break;
        case 'REALM': this.alienTint.setFillStyle(0x8a3fb0, e.realm === 'ALIEN' ? 0.45 : 0); this.dc.audio.playSfx('echo_cyan'); break;
        case 'RETRACED': this.ringAt('tide', PINK); this.bloom(0.55); break;
        case 'ANCHOR_ALIGNED': this.dc.audio.playSfx('beacon_light'); this.view.beacon.pulse(e.anchorId === 'LIGHTHOUSE' ? 0xfff2c4 : e.anchorId === 'LANTERN' ? AMBER : CYAN); break;
        case 'STRAIN_RECOVERED': this.dc.audio.playSfx('reunion_chime'); break;
        case 'REJECTED': if (!texts.has(e.reason)) this.pushCaption(e.reason, 'world'); break;
        case 'WIN': this.onWin(); break;
        case 'FADE': this.onLost('The Thread frays past mending.'); break;
        default: break;
      }
    }
    this.refreshAll(s);
  }

  private refreshAll(s: Readonly<SimulationState>): void {
    this.view.refresh(s);
    const b = beaconProgress(s);
    this.view.beacon.setProgress(b.player, b.partner).setHarmony(b.player.every(Boolean) && b.partner.every(Boolean));
    const inv = s.player.inventory;
    this.invText.setText(`Wood x${inv.fuel}    Planks x${inv.plank}`);
    // bond stress: audio, desaturation, cool wash
    const st = bondStress(s);
    if (Math.abs(st - this.stress) > 0.004) { this.stress = st; this.dc.audio.setBondStress(st); this.applyStress(); }
    this.applyMusic();
    // the sim may have moved the player (the Thread tugs you back to the clearing)
    if (s.v2.gridX !== this.pl.tx || s.v2.gridY !== this.pl.ty) {
      if (!this.pl.moving || (s.v2.gridX !== this.pl.ax || s.v2.gridY !== this.pl.ay)) {
        this.pl.moving = false; this.pl.tx = s.v2.gridX; this.pl.ty = s.v2.gridY; this.pl.x = px(this.pl.tx); this.pl.y = px(this.pl.ty) + FEET; this.path = [];
        this.placePlayer(); this.cameras.main.centerOn(this.pl.x, this.pl.y);
      }
    }
    if (s.events.length !== this.lastEventCount) { this.lastEventCount = s.events.length; this.lastProgress = this.nowMs; }
  }

  private applyStress(): void {
    const t = stressTint(this.stress);
    this.cool.setAlpha(Math.min(0.28, t.coolAlpha * 1.4));
    this.vig.setAlpha(t.dark);
    if (this.cm) { this.cm.reset(); this.cm.saturate(-t.desat); }
  }

  private applyMusic(): void {
    const s = this.model.state;
    const final = this.model.timeLeft <= 60 || s.link === 'FRAYING' || s.link === 'LAST_SIGNAL' || s.realityDrift >= 55;
    if (final !== this.musicFinal) { this.musicFinal = final; this.dc.audio.playMusic(final ? 'final_minute' : 'forest'); }
  }

  private bloom(strength = 0.9): void {
    const img = this.bloomImg;
    this.tweens.killTweensOf(img);
    if (this.dc.settings.reduceMotion) { img.setAlpha(0.3 * strength); this.time.delayedCall(700, () => img.setAlpha(0)); return; }
    img.setAlpha(0);
    this.tweens.add({ targets: img, alpha: strength, duration: 180, ease: 'Sine.easeOut', yoyo: true, hold: 120, completeDelay: 0, onComplete: () => img.setAlpha(0) });
    this.tweens.add({ targets: img, alpha: 0, delay: 560, duration: 120 });
  }

  private ringAt(id: string, color: number): void {
    const p = this.view.posOf(id, this.model.state);
    const r = this.add.image(p.x, p.y + 6, 'vfx/p_circle_05').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(0.04).setAlpha(0.9).setDepth(9000);
    this.worldLayer.add(r);
    this.tweens.add({ targets: r, scale: 0.28, alpha: 0, duration: 650, onComplete: () => r.destroy() });
  }

  /** The brother is never drawn physically: only a cyan echo at the landmark where he just acted. */
  private echoAt(objectId: string | undefined, text: string, fromPast = false): void {
    const s = this.model.state;
    const id = objectId && OBJECT_TILES[objectId] ? objectId : LANDMARK[s.partner.site ?? 'CLEARING'];
    const p = this.view.posOf(id, s);
    const x = p.x - 16, y = p.y + 10 + FEET - 10;
    const other = this.col === 'red' ? 'blue' : 'red';
    while (this.echoes.length >= 2) { const o = this.echoes.shift()!; o.spr.destroy(); o.ring.destroy(); }
    const spr = this.add.sprite(x, y, 'myconid/' + other).setScale(0.78).setOrigin(0.5, 42 / 64).setTint(CYAN).setAlpha(0).setDepth(y).setBlendMode(Phaser.BlendModes.ADD);
    spr.play(`mu-${other}-idle-${p.x > this.pl.x ? 2 : 6}`);
    const ring = this.add.image(x, y - 6, 'vfx/p_circle_05').setBlendMode(Phaser.BlendModes.ADD).setTint(CYAN).setScale(0.05).setAlpha(0.9).setDepth(9000);
    this.worldLayer.add([spr, ring]);
    const born = this.nowMs;
    this.echoes.push({ spr, ring, until: born + 3600, x, y });
    this.tweens.add({ targets: spr, alpha: 0.62, duration: 280 });
    this.tweens.add({ targets: ring, scale: 0.3, alpha: 0, duration: 800 });
    this.dc.audio.playSfx('echo_cyan');
    const kind: Kind = fromPast ? 'echo' : 'partner';
    this.pushCaption(text, kind, captionMs(text) + 400);
    if (this.firstEcho) { this.firstEcho = false; void this.dc.audio.playVoice('tm_partner_hint'); }
  }

  // ---------------------------------------------------------------- actions
  private nearby(): Usable[] {
    const s = this.model.state, n = s.nodes[s.player.nodeId];
    return getNearbyInteractables(n.world, n.flags, { tx: this.pl.tx, ty: this.pl.ty }, s.v2.realm).filter((o): o is Usable => (USABLE as readonly string[]).includes(o));
  }

  private verbsOf(obj: Usable): PhysicalAction[] {
    const s = this.model.state, f = s.nodes[s.player.nodeId].flags;
    const list = verbsFor(obj, { lit: f.includes('LANTERN_LIT'), inherited: f.includes('GATE_INHERITED'), hasAlt: !!alternateOf(s), gridWheelLooked: s.v2.examined.includes('wheel') });
    const ok = new Set(availableActions(s, obj).map(a => a.action));
    return list.filter(a => a === 'OBSERVE' || ok.has(a));
  }

  private doVerb(i: number): void {
    if (this.phase !== 'PLAY' || !this.live || this.nowMs - this.lastActAt < 220) return;
    const obj = this.focus;
    if (!obj) { if (i === 0) this.pushCaption('Nothing within reach. Walk up to the beacon, the wood, the water or the mast.', 'world'); return; }
    const verbs = this.verbsOf(obj);
    const a = verbs[Math.min(i, verbs.length - 1)];
    if (i > 0 && verbs.length < 2) return;
    this.lastActAt = this.nowMs;
    this.dc.audio.playSfx(a === 'GATHER' ? 'pickup' : a === 'RELIGHT' ? 'fuel_burn' : a === 'BRACE' ? 'anchor_pickup' : a === 'TUNE' || a === 'HOLD_SIGNAL' ? 'beep' : a === 'REST' ? 'ui_confirm' : 'ui_click');
    this.model.dispatch({ type: 'INTERACT', objectId: obj, action: a });
    if (a === 'RELIGHT' && this.model.state.nodes[this.model.state.player.nodeId].flags.includes('LANTERN_LIT')) this.view.beacon.pulse(AMBER);
    this.afterAction();
  }

  private call(kind: 'CALL' | 'WARNING'): void {
    if (this.phase !== 'PLAY' || !this.live || this.nowMs - this.lastActAt < 220) return;
    this.lastActAt = this.nowMs;
    this.dc.audio.playSfx('thread_call');
    const cmd: Command = kind === 'WARNING' ? { type: 'CALL', kind: 'WARNING' } : { type: 'CALL' };
    this.model.dispatch(cmd);
    this.view.beacon.pulse(CYAN);
    this.afterAction();
  }

  private afterAction(): void { this.lastProgress = this.nowMs; this.idleTimer = 0; }

  private focusTarget(): Usable | null {
    const list = this.nearby();
    if (!list.length) return null;
    const s = this.model.state, f = s.nodes[s.player.nodeId].flags;
    const d = (o: Usable) => { const t = tileOf(o, f); return Math.hypot(t.tx - this.pl.tx, t.ty - this.pl.ty); };
    return [...list].sort((a, b) => d(a) - d(b))[0];
  }

  private updateLabel(): void {
    const obj = this.focus;
    const s = this.model.state;
    const verbs = obj ? this.verbsOf(obj) : [];
    const a = verbs[0], b = verbs[1];
    const tA = this.btnA.getData('t') as Phaser.GameObjects.BitmapText, tB = this.btnB.getData('t') as Phaser.GameObjects.BitmapText;
    tA.setText(a ? `E  ${SHORT[a] ?? 'Use'}` : 'E  Use'); tB.setText(b ? `Q  ${SHORT[b] ?? 'Other'}` : 'Q  --');
    this.btnA.setAlpha(a ? 1 : 0.55); this.btnB.setAlpha(b ? 1 : 0.4);
    const fuel = s.player.inventory.fuel;
    (this.btnC.getData('t') as Phaser.GameObjects.BitmapText).setText(fuel > 0 ? 'C  Call  -1 wood' : 'C  Call (no wood)');
    (this.btnW.getData('t') as Phaser.GameObjects.BitmapText).setText(fuel > 0 ? 'V  Warn  -1 wood' : 'V  Warn (no wood)');
    this.btnC.setAlpha(fuel > 0 ? 1 : 0.55); this.btnW.setAlpha(fuel > 0 ? 1 : 0.55);
    const p = this.view.setFocus(obj, s, this.nowMs);
    if (obj && p) {
      const cam = this.cameras.main;
      const sx = (p.x - cam.worldView.x) * ZOOM, sy = (p.y - 34 - cam.worldView.y) * ZOOM;
      const txt = `${OBJECT_NAME[obj]}${a ? ': ' + (SHORT[a] ?? '') : ''}`;
      this.label.setText(txt).setPosition(Math.round(sx), Math.round(sy)).setAlpha(1).setTint(0xfff1c9);
      this.labelBg.setDisplaySize(this.label.width + 26, 30).setPosition(Math.round(sx), Math.round(sy)).setAlpha(0.8).setTint(0x2a2f44);
    } else { this.label.setAlpha(0); this.labelBg.setAlpha(0); }
  }

  // ---------------------------------------------------------------- end states
  private onWin(): void {
    if (this.phase === 'END') return;
    this.phase = 'END';
    this.pushCaption('There you are.', 'partner', 2200);
    this.dc.audio.playSfx('reunion_chime');
    this.view.beacon.setHarmony(true); this.view.beacon.pulse(0xfff2c4);
    this.time.delayedCall(1900, () => this.finish(true));
  }

  private onLost(why: string): void {
    if (this.phase === 'END') return;
    this.phase = 'END';
    this.pushCaption(why, 'warn', 2600);
    this.dc.audio.playSfx('collapse');
    if (!this.dc.settings.reduceMotion) this.cameras.main.fadeOut(1300, 10, 12, 30);
    this.time.delayedCall(1500, () => this.finish(false));
  }

  private finish(won: boolean): void {
    if (this.done) return;
    this.done = true;
    this.dc.session.forestSummary = this.model.summary(won);
    this.dc.session.forestState = this.model.engine.getState();
    this.send({ type: won ? 'FOREST_WON' : 'FOREST_LOST' });
  }

  // ---------------------------------------------------------------- frame loop
  update(_t: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    this.view.update(dt);
    if (!this.live) { this.animatePlayer(); return; }
    this.nowMs += delta;
    this.tickCaptions();
    this.updateEchoes();
    if (this.phase === 'INTRO') {
      this.introLeft -= dt;
      this.animatePlayer();
      if (this.introLeft <= 0) { this.phase = 'PLAY'; this.pushCaption('Go.', 'tm', 700); this.lastProgress = this.nowMs; }
      this.timerText.setText(this.fmt(this.model.timeLeft));
      this.focus = this.focusTarget(); this.updateLabel();
      return;
    }
    if (this.phase === 'PLAY') {
      const r = this.model.tick(dt);
      for (const m of r.milestones) { void this.dc.audio.playVoice('tm_time_' + m); this.pushCaption(LINE_BY_ID['tm_time_' + m].text, 'tm'); }
      this.idleTimer += dt;
      if (r.lost) { this.onLost(this.model.faded ? 'The Thread frays past mending.' : 'The Thread runs out of time.'); }
      this.movePlayer(dt);
      this.maybeHint();
      this.applyMusic();
    }
    this.animatePlayer();
    this.timerText.setText(this.fmt(this.model.timeLeft)).setTint(this.model.timeLeft <= 10 ? 0xff8f8f : this.model.timeLeft <= 30 ? 0xffd48a : 0xfff1c9);
    this.focus = this.phase === 'PLAY' ? this.focusTarget() : null;
    this.updateLabel();
    this.placePlayer();
  }

  private fmt(t: number): string { const s = Math.ceil(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  private updateEchoes(): void {
    const cam = this.cameras.main;
    let pointing = false;
    for (const e of [...this.echoes]) {
      if (this.nowMs > e.until) { this.tweens.add({ targets: e.spr, alpha: 0, duration: 400, onComplete: () => { e.spr.destroy(); e.ring.destroy(); } }); this.echoes.splice(this.echoes.indexOf(e), 1); continue; }
      const sx = (e.x - cam.worldView.x) * ZOOM, sy = (e.y - cam.worldView.y) * ZOOM;
      if (!pointing && (sx < 20 || sx > this.W - 20 || sy < 20 || sy > this.H - 20)) {
        pointing = true;
        this.offscreen.setPosition(Phaser.Math.Clamp(sx, 24, this.W - 24), Phaser.Math.Clamp(sy, 60, this.H - 130)).setAlpha(0.5 + 0.4 * Math.sin(this.nowMs / 180));
      }
    }
    if (!pointing) this.offscreen.setAlpha(0);
  }

  private maybeHint(): void {
    if (this.nowMs - this.lastProgress < 38000 || this.nowMs - this.hintAt < 38000) return;
    this.hintAt = this.nowMs;
    const h = objectiveHint(this.model.state);
    if (h.text) { this.pushCaption(h.text, 'tm', 4200); if (h.objectId && OBJECT_TILES[h.objectId]) this.ringAt(h.objectId, CYAN); }
  }

  // ---------------------------------------------------------------- movement
  private wanted(): { dx: number; dy: number } {
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!dx && !dy && this.stick.id >= 0) { dx = Math.abs(this.stick.dx) > 0.35 ? Math.sign(this.stick.dx) : 0; dy = Math.abs(this.stick.dy) > 0.35 ? Math.sign(this.stick.dy) : 0; }
    return { dx, dy };
  }

  private movePlayer(dt: number): void {
    const p = this.pl;
    let budget = dt * SPEED; // tiles to travel this frame
    for (let guard = 0; guard < 4 && budget > 0; guard++) {
      if (!p.moving) {
        let { dx, dy } = this.wanted();
        if (dx || dy) this.path = [];
        else if (this.path.length) { const n = this.path[0]; dx = n.tx - p.tx; dy = n.ty - p.ty; }
        if (!dx && !dy) return;
        p.fx = dx; p.fy = dy; p.dir = dirIndex(dx, dy);
        // one axis per step (the sim moves on a 4-neighbour grid); alternate when both are held
        const tryAxes: Array<[number, number]> = dx && dy ? (this.nowMs % 400 < 200 ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]]) : [[dx, dy]];
        let moved = false;
        for (const [ax, ay] of tryAxes) {
          const s = this.model.state, n = s.nodes[s.player.nodeId];
          if (!getWalkability(n.world, n.flags, s.v2.realm)[p.ty + ay]?.[p.tx + ax]) continue;
          const ev = this.model.dispatch({ type: 'MOVE', tx: p.tx + ax, ty: p.ty + ay });
          if (ev.some(e => e.type === 'REJECTED')) continue;
          if (this.model.state.v2.gridX !== p.tx + ax || this.model.state.v2.gridY !== p.ty + ay) return; // the Thread moved us
          p.ax = p.tx + ax; p.ay = p.ty + ay; p.t = 0; p.moving = true; moved = true;
          if (this.path.length && this.path[0].tx === p.ax && this.path[0].ty === p.ay) this.path.shift();
          break;
        }
        if (!moved) {
          this.path = [];
          if (this.nowMs - this.blockedAt > 2500) { this.blockedAt = this.nowMs; const ev = this.model.dispatch({ type: 'MOVE', tx: p.tx + Math.sign(p.fx), ty: p.ty + (p.fx ? 0 : Math.sign(p.fy)) }); void ev; }
          return;
        }
      }
      const step = Math.min(budget, 1 - p.t);
      p.t += step; budget -= step;
      const x0 = px(p.tx), y0 = px(p.ty) + FEET, x1 = px(p.ax), y1 = px(p.ay) + FEET;
      p.x = x0 + (x1 - x0) * p.t; p.y = y0 + (y1 - y0) * p.t;
      if (p.t >= 1) { p.moving = false; p.tx = p.ax; p.ty = p.ay; p.x = x1; p.y = y1; }
    }
  }

  private animatePlayer(): void {
    const moving = this.pl.moving;
    const key = `mu-${this.col}-${moving ? 'walk' : 'idle'}-${this.pl.dir}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);
    this.placePlayer();
  }
}
