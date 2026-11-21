import Phaser from 'phaser';
import './ui/styles.css';
import { SimEngine, TEMPLATES, availableActions } from './sim/engine';
import * as planner from './sim/planner';
import type { Command, DomainEvent, SimulationState, Identity, Choice } from './sim/types';
import { AudioEngine } from './audio/audioEngine';
import { WorldScene } from './game/WorldScene';
import { ART_INK, ART_SCRIBBLE, INK_SCALE } from './game/artStyle';
import { OBJECT_LABELS, VIEW_W, VIEW_H } from './game/layout';
import { Shell, type Verb } from './ui/shell';
import * as topo from './world/topology';

const SAVE_KEY = 'elsewhere-together-save-v1'; // same key on purpose: old (no `v2`) saves are detected and a new game is offered
const PREF_KEY = 'elsewhere-together-prefs-v1';
const SEED = Number(new URLSearchParams(location.search).get('seed')) || 48219; // ?seed=N for reproducible demos

// ---------- prefs ----------
let prefs = { muted: false, reduce: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'); if (p) prefs = { ...prefs, ...p }; } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

// ---------- engine / save ----------
let stale = false; // a save exists but is unreadable or from an earlier version
let engine: SimEngine;
let unsub: (() => void) | null = null;
function loadSaved(): SimulationState | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
  if (!raw) return null;
  const r = SimEngine.restore(raw);
  if (!r) stale = true;
  return r;
}
const saved = loadSaved();
engine = saved ? new SimEngine(SEED, saved) : new SimEngine(SEED);
const persist = () => { try { localStorage.setItem(SAVE_KEY, SimEngine.serialize(engine.getState() as SimulationState)); } catch { /* quota/private mode: play on */ } };
const hasSave = (): boolean => !!saved && !stale && engine.getState().turn > 0;

// ---------- state shared with scene ----------
const audio = new AudioEngine();
audio.setMuted(prefs.muted);
let focusId: string | null = null;
let demoToken = 0;
let demoRunning = false;
let playing = false;
let endTimer = 0;
const keys = new Set<string>();
let touchDir = { x: 0, y: 0 };
let scene: WorldScene;
let prevDrift = engine.getState().realityDrift;
// Idle hint: if the player walks ~30 tiles without a meaningful action, surface the diegetic objective hint.
const HINT_IDLE_TICKS = 30;
let lastActionTick = 0, lastHintTick = 0;

const send = (cmd: Command): DomainEvent[] => engine.dispatch(cmd);
const isFork = (id: string | null): boolean => !!id && TEMPLATES.some(t => t.triggerObjectId === id);
const sceneAny = (): any => scene as any;

const shell: Shell = new Shell(document.getElementById('app')!, {
  play: () => (hasSave() ? continueGame() : newGame()),
  cont: () => continueGame(),
  newGame: () => newGame(),
  demo: () => startDemo(),
  identity: (i) => chooseIdentity(i),
  verb: (v) => interact(v),
  dir: (x, y) => { touchDir = { x, y }; },
  toggleMute: () => { prefs.muted = !prefs.muted; shell.muted = prefs.muted; audio.setMuted(prefs.muted); savePrefs(); shell.render(engine.getState()); },
  toggleReduce: () => { prefs.reduce = !prefs.reduce; shell.reduce = prefs.reduce; savePrefs(); shell.render(engine.getState()); },
  openArchive: () => { audio.playSfx('archive_open'); shell.openArchive(engine.getState()); },
  restart: () => restart(),
});
shell.muted = prefs.muted; shell.reduce = prefs.reduce;

// ---------- actions ----------
function canMove(): boolean {
  const s = engine.getState();
  return playing && !demoRunning && !shell.overlayOpen() && s.phase !== 'ENDING' && s.phase !== 'FADE' && !s.won;
}

/** E = keep (SELF) / use, Q = send across (ECHO), F = let it be (LET_GO). Non-fork objects only answer to USE. */
/** V4: contextual world actions. Slot 0/1/2 = E/Q/F (and the three touch buttons). */
function focusOptions() {
  if (!focusId) return [];
  return availableActions(engine.getState(), focusId).slice(0, 3);
}
function refreshVerbs(): void {
  const opts = focusOptions();
  shell.setVerbs(focusId ? 'fork' : null, focusId ? (OBJECT_LABELS[focusId] ?? focusId) : '', opts.map(o => o.label));
}
function interactSlot(i: number): void {
  if (!canMove()) return;
  if (!focusId) { shell.caption('Walk up to something to look at it.', 'system', 2500); return; }
  const opts = focusOptions();
  const o = opts[i];
  if (!o) { if (i === 0) send({ type: 'INTERACT', objectId: focusId }); return; }
  if (!o.enabled && o.clue) { shell.caption(o.clue, 'world', 4500); return; }
  send({ type: 'INTERACT', objectId: focusId, action: o.action } as Command);
}
function interact(v: Verb): void { interactSlot(v === 'ECHO' ? 1 : v === 'LET_GO' ? 2 : 0); }

function beginPlay(): void {
  playing = true;
  audio.unlock();
  shell.showPlay();
  const s = engine.getState();
  if (s.phase === 'BOOT') send({ type: 'SET_PHASE', phase: 'EXPLORING' });
  else notify(engine.getState(), []);
  sceneAny()?.syncToState?.(); scene?.refresh();
  window.setTimeout(fitCanvas, 30);
}

function continueGame(): void {
  audio.unlock();
  const s = engine.getState();
  if (s.v2?.ending || s.won) { playing = true; shell.render(s); shell.showEnding(s); return; }
  if (!s.v2?.playerIdentity || s.phase === 'BOOT') { shell.showIntro(); return; }
  beginPlay();
}

function freshEngine(): void {
  demoToken++; demoRunning = false; clearTimeout(endTimer);
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  stale = false;
  engine = new SimEngine(SEED);
  (window as any).__et.engine = engine;
  subscribe();
  shell.clearCaptions(); shell.closeAll();
  sceneAny()?.resetEnding?.(); sceneAny()?.syncToState?.(); 
  prevDrift = 0; focusId = null; shell.setVerbs(null);
}

function newGame(): void {
  audio.unlock();
  freshEngine();
  shell.render(engine.getState());
  shell.showFacts(() => shell.showIntro());
}

function restart(): void {
  audio.unlock(); playing = false;
  freshEngine();
  shell.render(engine.getState());
  shell.showIntro();
}

function chooseIdentity(i: Identity): void {
  send({ type: 'SET_IDENTITY', identity: i });
  sceneAny()?.setIdentity?.(i);
  beginPlay();
}

// ---------- demo: watch planWin play legal commands, step by step ----------
function planFrom(state: SimulationState): Command[] {
  const w = planner.planWin as unknown as (e: unknown, o?: unknown) => Command[];
  const restored = SimEngine.restore(SimEngine.serialize(state));
  if (!restored) return [];
  const clone = new SimEngine(SEED, restored);
  try { return w(clone) ?? []; } catch { return []; }
}

function startDemo(): void {
  audio.unlock();
  freshEngine();
  send({ type: 'SET_IDENTITY', identity: 'amber' }); sceneAny()?.setIdentity?.('amber');
  beginPlay();
  const token = ++demoToken; demoRunning = true;
  shell.caption('DEMO: watching a scripted winning route.', 'system', 3500);
  let plan = planFrom(engine.getState() as SimulationState), i = 0, replans = 0;
  const step = () => {
    if (token !== demoToken) return;
    const s = engine.getState();
    if (s.won || s.v2.ending) { demoRunning = false; return; }
    if (i >= plan.length) {
      if (replans++ > 4) { demoRunning = false; return; }
      plan = planFrom(s as SimulationState); i = 0; if (!plan.length) { demoRunning = false; return; }
    }
    const c = plan[i++];
    const evs = send(c);
    if (evs.some(e => e.type === 'REJECTED')) { plan = planFrom(engine.getState() as SimulationState); i = 0; replans++; }
    window.setTimeout(step, c.type === 'INTERACT' ? 1100 : 220);
  };
  window.setTimeout(step, 800);
}

// ---------- V4 divergence: drain colour from the world as the histories drift apart (no meters) ----------
function applyDivergence(s: Readonly<SimulationState>): void {
  const d = s.realityDrift, link = (s as any).link as string | undefined;
  let band = d >= 80 || link === 'LAST_SIGNAL' ? 3 : d >= 55 || link === 'FRAYING' ? 2 : d >= 30 ? 1 : 0;
  if (s.phase === 'ENDING') band = 0;
  const sat = [1, 0.7, 0.4, 0.15][band], cool = [0, 8, 16, 24][band];
  const c = game?.canvas as HTMLCanvasElement | undefined;
  if (c) { c.style.transition = 'filter 1.2s ease'; c.style.filter = prefs.reduce && band ? `saturate(${Math.max(sat, 0.5)})` : `saturate(${sat}) hue-rotate(${cool}deg) contrast(${1 - band * 0.04})`; }
  document.documentElement.dataset.diverge = String(band);
}

// ---------- domain events -> UI/audio/scene ----------
function notify(s: Readonly<SimulationState>, events: DomainEvent[]): void {
  shell.render(s);
  scene?.refresh();
  refreshVerbs();
  applyDivergence(s);
  audio.setState(s.realityDrift, s.bondStrain);
  if (prevDrift < 60 && s.realityDrift >= 60) audio.playSfx('drift_warning');
  prevDrift = s.realityDrift;
  const worldCaption = events.some(e => e.type === 'WORLD_CHANGED');
  if (events.some(e => e.type !== 'REJECTED')) {
    if (events.some(e => e.type === 'FORK_RESOLVED' || e.type === 'ANCHOR_ALIGNED' || e.type === 'STRAIN_RECOVERED' || e.type === 'WORLD_CHANGED')) lastActionTick = s.v2.tick;
  }
  if (s.phase === 'EXPLORING' && s.v2.tick - lastActionTick >= HINT_IDLE_TICKS && s.v2.tick - lastHintTick >= HINT_IDLE_TICKS) {
    const h = planner.objectiveHint(s);
    if (h.text) { lastHintTick = s.v2.tick; shell.caption(h.text, 'trace', 5500); }
  }
  for (const ev of events) {
    switch (ev.type) {
      case 'VOICE': audio.playVoice(ev.cue); shell.caption(ev.text, 'voice', 5000); break;
      case 'WORLD_CHANGED': shell.caption(ev.text, 'world'); break;
      case 'WARNING': shell.caption(ev.text, 'warning', 6000); break;
      case 'PARTNER_TRACE': shell.caption(ev.text, 'trace'); sceneAny()?.showPartnerTrace?.(ev.objectId); break;
      case 'REJECTED': shell.caption(ev.reason, 'warning', 4500); break;
      case 'FORK_RESOLVED': {
        const r = ev.record;
        audio.playSfx(r.choice === 'ECHO' ? 'echo_send' : 'branch_split');
        shell.bloom();
        if (!worldCaption) {
          const t = TEMPLATES.find(q => q.id === r.templateId); const o = t?.outcomes.find(q => q.id === r.selectedOutcome);
          if (o) shell.caption(o.text, 'world');
        }
        break;
      }
      case 'ANCHOR_ALIGNED': audio.playSfx('anchor_lock'); sceneAny()?.showPartnerNear?.(ev.anchorId); break;
      case 'WIN': audio.playSfx('final_merge'); sceneAny()?.playEnding?.(); scheduleEnding(6000); break;
      case 'FADE': scheduleEnding(3500); break;
    }
  }
  if (playing && shell.screen === 'play' && (s.v2?.ending || s.won) && !endTimer) scheduleEnding(1500);
}

function scheduleEnding(ms: number): void {
  clearTimeout(endTimer); demoRunning = false;
  endTimer = window.setTimeout(() => { endTimer = 0; shell.setVerbs(null); shell.showEnding(engine.getState()); }, ms);
}

function subscribe(): void {
  unsub?.();
  unsub = engine.subscribe((s, ev) => { persist(); notify(s, ev); });
}

// ---------- phaser ----------
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: shell.viewport, width: VIEW_W * (ART_INK ? INK_SCALE : 1), height: VIEW_H * (ART_INK ? INK_SCALE : 1),
  backgroundColor: '#111626', pixelArt: !ART_INK, antialias: ART_INK, roundPixels: !ART_INK,
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  scene: [],
});
scene = new WorldScene({
  getState: () => engine.getState(),
  getDir: () => {
    let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (!x && !y) { x = touchDir.x; y = touchDir.y; }
    return { x, y };
  },
  canMove,
  reduce: () => prefs.reduce,
  dispatch: (c: Command) => send(c),
  onFocus: (id: string | null) => {
    focusId = id;
    refreshVerbs();
  },
  onMoveEnd: () => { /* V2: the scene dispatches MOVE per tile */ },
} as any);
game.scene.add('world', scene, true);

function fitCanvas(): void {
  const vp = document.getElementById('viewport'); if (!vp) return;
  const w = vp.clientWidth, h = vp.clientHeight;
  if (!w || !h) return;
  const c = game.canvas; if (!c) return;
  if (ART_SCRIBBLE) { // hand-drawn art: render at the viewport's real size, camera zoom decides how much forest shows
    if (game.scale.width !== w || game.scale.height !== h) game.scale.resize(w, h);
    c.style.width = w + 'px'; c.style.height = h + 'px'; return;
  }
  const cw = (game.config.width as number), ch = (game.config.height as number);
  const k = Math.min(w / cw, h / ch);
  c.style.width = Math.floor(cw * k) + 'px'; c.style.height = Math.floor(ch * k) + 'px';
}
new ResizeObserver(fitCanvas).observe(document.getElementById('viewport')!);
window.addEventListener('resize', fitCanvas); window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));
game.events.once('ready', fitCanvas); setTimeout(fitCanvas, 50); setTimeout(fitCanvas, 400);

// ---------- keyboard ----------
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    if (shell.helpOpen()) shell.help(false);
    else if (shell.aboutOpen()) shell.about(false);
    else if (shell.screen === 'facts') shell.skipFacts();
    return;
  }
  if (shell.screen === 'play' && !shell.helpOpen()) {
    if (MOVE_KEYS.has(k)) { keys.add(k); e.preventDefault(); return; }
    lastInputAt = performance.now();
    if (k === 'c') { if (!e.repeat) callThread(); return; }
    if (k === 'e' || k === ' ') { e.preventDefault(); if (!e.repeat) interactSlot(0); return; }
    if (k === 'q') { interactSlot(1); return; }
    if (k === 'f') { interactSlot(2); return; }
  }
  if (k === 'l') { shell.replay(); return; }
  if (k === '?' || k === 'h') { if (shell.screen === 'play') shell.help(!shell.helpOpen()); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); touchDir = { x: 0, y: 0 }; });
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b && shell.screen === 'play') b.blur();
});

// ---------- boot ----------
(window as any).__et = {
  engine, shell,
  state: () => engine.getState(),
  send, scene: () => scene, focus: () => focusId, demoRunning: () => demoRunning,
  planWin: () => planFrom(engine.getState() as SimulationState),
  proofs: () => import('./sim/proofs').then(m => m.proofScripts),
};
// ---------- V5: the Thread and the partner's own time ----------
function callThread(): void {
  if (!canMove()) return;
  send({ type: 'CALL' });
}
(window as any).__etCall = callThread;
// The partner keeps living while you stand still: one deterministic ADVANCE_PARTNER every 3 s of active, idle play.
let lastInputAt = 0;
window.setInterval(() => {
  const s = engine.getState();
  if (!canMove() || shell.screen !== 'play' || s.phase !== 'EXPLORING') return;
  if (keys.size || touchDir.x || touchDir.y || performance.now() - lastInputAt < 1500) return;
  send({ type: 'ADVANCE_PARTNER' });
}, 3000);

if (new URLSearchParams(location.search).get('debug') === '1') {
  (window as any).__et.debug = {
    setMeters: (drift: number, strain: number) => {
      const st = engine.getState() as SimulationState; st.realityDrift = drift; st.bondStrain = strain; notify(st, []);
    },
    topo,
    pos: () => sceneAny().pos?.(), teleport: (x: number, y: number) => sceneAny().teleport?.(x, y),
    texDataUrl: (key: string) => (game.textures.get(key).getSourceImage() as HTMLCanvasElement).toDataURL('image/png'),
  };
}
subscribe();
shell.render(engine.getState());
shell.showTitle({ hasSave: hasSave(), stale });
