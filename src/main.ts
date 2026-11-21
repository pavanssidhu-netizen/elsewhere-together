import Phaser from 'phaser';
import './ui/styles.css';
import { SimEngine, TEMPLATES, cheapestWinPath } from './sim/engine';
import type { Command, DomainEvent, SimulationState, Intention, Choice } from './sim/types';
import { AudioEngine } from './audio/audioEngine';
import { WorldScene } from './game/WorldScene';
import { ART_INK, INK_SCALE, toggleArtStyle } from './game/artStyle';
import { OBJECT_POSITIONS, OBJECT_LABELS, PLAYER_START, VIEW_W, VIEW_H, isBlockedPx } from './game/layout';
import { Shell } from './ui/shell';
import { ancestors, tpl } from './ui/panels';

const SAVE_KEY = 'elsewhere-together-save-v1';
const PREF_KEY = 'elsewhere-together-prefs-v1';
const SEED = 48219;

// ---------- prefs ----------
let prefs = { muted: false, reduce: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'); if (p) prefs = { ...prefs, ...p }; } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

// ---------- engine / save ----------
let corrupt = false;
let engine: SimEngine;
let unsub: (() => void) | null = null;
function loadSaved(): SimulationState | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
  if (!raw) return null;
  const r = SimEngine.restore(raw);
  if (!r) corrupt = true;
  return r;
}
const saved = loadSaved();
engine = saved ? new SimEngine(SEED, saved) : new SimEngine(SEED);
const persist = () => { try { localStorage.setItem(SAVE_KEY, SimEngine.serialize(engine.getState() as SimulationState)); } catch { /* quota/private mode: play on */ } };

// ---------- state shared with scene ----------
const audio = new AudioEngine();
audio.setMuted(prefs.muted);
let focusId: string | null = null;
let demoRunning = false;
let demoToken = 0;
let started = false;
const keys = new Set<string>();
let touchDir = { x: 0, y: 0 };
let scene: WorldScene;
let prevDrift = engine.getState().realityDrift;

const send = (cmd: Command): DomainEvent[] => engine.dispatch(cmd);

const shell: Shell = new Shell(document.getElementById('app')!, {
  act: () => act(),
  call: () => { send({ type: 'REQUEST_PARTNER', intention: engine.getState().intention }); },
  openArchive: () => toggleArchive(true),
  retraceSelected: () => retraceSelected(),
  intention: (i: Intention) => { send({ type: 'REQUEST_PARTNER', intention: i }); },
  rest: () => { sendAtObject('thread_terminal', { type: 'REST_AT_TERMINAL' }); },
  forkChoice: (c: Choice) => {
    const pf = engine.getState().pendingFork; if (pf) send({ type: 'RESOLVE_FORK', eventInstanceId: pf.eventInstanceId, choice: c });
  },
  cancelFork: () => { send({ type: 'CANCEL_FORK' }); },
  retraceTo: (id: string) => { send({ type: 'RETRACE', targetNodeId: id }); },
  select: (id: string) => { shell.selected = id; shell.render(engine.getState()); },
  closeArchive: () => toggleArchive(false),
  start: () => startGame(),
  newGame: () => newGame(false),
  demo: () => { startGame(true); },
  playAgain: () => newGame(true),
  toggleMute: () => { prefs.muted = !prefs.muted; shell.muted = prefs.muted; audio.setMuted(prefs.muted); savePrefs(); shell.render(engine.getState()); },
  toggleReduce: () => { prefs.reduce = !prefs.reduce; shell.reduce = prefs.reduce; savePrefs(); shell.render(engine.getState()); },
  dir: (x, y) => { touchDir = { x, y }; },
  tab: (t) => {
    if (t === 'archive') toggleArchive(true);
    else { if (engine.getState().phase === 'ARCHIVE') toggleArchive(false); shell.setTab(t); }
  },
});
shell.muted = prefs.muted; shell.reduce = prefs.reduce;

// ---------- actions ----------
function canMove(): boolean { const s = engine.getState(); return started && !demoRunning && s.phase === 'EXPLORING' && !s.won && !shell.helpOpen(); }

function sendAtObject(objId: string, cmd: Command): DomainEvent[] {
  const p = scene?.pos(); if (p) send({ type: 'SET_POSITION', x: p.x, y: p.y });
  return send(cmd);
}

function act(): void {
  const s = engine.getState();
  if (!started || s.phase !== 'EXPLORING') return;
  if (!focusId) { shell.toast('MOVE NEXT TO A PULSING OBJECT, THEN INTERACT'); return; }
  if (focusId.startsWith('anchor_')) sendAtObject(focusId, { type: 'ACTIVATE_ANCHOR', anchorId: focusId.slice(7) as 'LANTERN', actor: 'player' });
  else if (focusId === 'thread_terminal') sendAtObject(focusId, { type: 'REST_AT_TERMINAL' });
  else {
    const t = TEMPLATES.find(q => q.triggerObjectId === focusId);
    if (t) sendAtObject(focusId, { type: 'BEGIN_FORK', templateId: t.id });
  }
}

function toggleArchive(open: boolean): void {
  const s = engine.getState();
  if (!started) return;
  if (open && (s.phase === 'EXPLORING')) { shell.selected = s.player.nodeId; audio.playSfx('archive_open'); send({ type: 'SET_PHASE', phase: 'ARCHIVE' }); }
  else if (!open && s.phase === 'ARCHIVE') { send({ type: 'SET_PHASE', phase: 'EXPLORING' }); shell.setTab('world'); }
}

function retraceSelected(): void {
  const s = engine.getState();
  if (!started) return;
  if (s.phase === 'FORK' || s.phase === 'ENDING' || s.won) return;
  if (s.phase !== 'ARCHIVE') {
    // archive closed: retrace straight to the nearest visited ancestor if there is one
    const target = ancestors(s, s.player.nodeId).find(id => s.nodes[id]?.visitState === 'VISITED');
    if (target) { send({ type: 'RETRACE', targetNodeId: target }); return; }
    toggleArchive(true); shell.toast('NOTHING TO RETRACE TO YET. SELECT A VISITED ANCESTOR IN THE ARCHIVE'); return;
  }
  const n = s.nodes[shell.selected];
  if (n && n.visitState === 'VISITED' && ancestors(s, s.player.nodeId).includes(n.id)) send({ type: 'RETRACE', targetNodeId: n.id });
  else shell.toast('RETRACE ONLY GOES BACK TO A VISITED ANCESTOR OF YOUR BRANCH');
}

function startGame(demo = false): void {
  audio.unlock();
  if (demo) { newGame(false, true); return; }
  begin();
}
function begin(): void {
  started = true;
  shell.showStart(false);
  const s = engine.getState();
  if (s.phase === 'BOOT') send({ type: 'SET_PHASE', phase: 'EXPLORING' });
  else notify(engine.getState(), []);
  if (s.won) shell.showEnding();
}

function newGame(fromEnding: boolean, demo = false): void {
  demoToken++; demoRunning = false;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  corrupt = false;
  engine = new SimEngine(SEED);
  (window as any).__et.engine = engine;
  subscribe();
  scene?.resetEnding(); scene?.teleport(PLAYER_START.x, PLAYER_START.y);
  prevDrift = 0;
  audio.unlock();
  begin();
  if (demo) runDemo();
  void fromEnding;
}

function runDemo(): void {
  const token = ++demoToken; demoRunning = true;
  shell.toast('DEMO PATH: watching a scripted winning route', 3000);
  const cmds = cheapestWinPath();
  let i = 0;
  const step = () => {
    if (token !== demoToken) return;
    if (i >= cmds.length) { demoRunning = false; return; }
    let c = cmds[i++];
    const s = engine.getState();
    if (c.type === 'RESOLVE_FORK' && s.pendingFork) c = { ...c, eventInstanceId: s.pendingFork.eventInstanceId };
    let obj: string | null = null;
    if (c.type === 'BEGIN_FORK') obj = TEMPLATES.find(t => t.id === c.templateId)?.triggerObjectId ?? null;
    if (c.type === 'ACTIVATE_ANCHOR') obj = 'anchor_' + c.anchorId;
    if (c.type === 'REST_AT_TERMINAL') obj = 'thread_terminal';
    if (obj && OBJECT_POSITIONS[obj]) { const p = OBJECT_POSITIONS[obj]; scene.teleport(p.x - 10, p.y + 8); }
    send(c);
    window.setTimeout(step, c.type === 'RESOLVE_FORK' ? 1500 : 800);
  };
  window.setTimeout(step, 700);
}

// ---------- domain events -> UI/audio/scene ----------
function notify(s: Readonly<SimulationState>, events: DomainEvent[]): void {
  shell.render(s);
  scene?.refresh();
  audio.setState(s.realityDrift, s.bondStrain);
  if (prevDrift < 60 && s.realityDrift >= 60) audio.playSfx('drift_warning');
  prevDrift = s.realityDrift;
  let voiced = false;
  for (const ev of events) {
    switch (ev.type) {
      case 'VOICE': voiced = true; audio.playVoice(ev.cue); shell.setSubtitle(ev.text, s); break;
      case 'PARTNER_ACTED': if (!events.some(e => e.type === 'VOICE')) shell.setSubtitle(ev.text, s); break;
      case 'FORK_RESOLVED': {
        const r = ev.record; audio.playSfx(r.choice === 'ECHO' ? 'echo_send' : 'branch_split');
        const t = tpl(r.templateId); const o = t?.outcomes.find(q => q.id === r.selectedOutcome);
        shell.toast(`${(t?.label ?? r.templateId).toUpperCase()}: ${o?.text ?? ''}`, 5000);
        break;
      }
      case 'ANCHOR_ALIGNED': audio.playSfx('anchor_lock'); scene?.showPartnerNear(ev.anchorId); shell.toast(`ANCHOR ALIGNED: ${ev.anchorId}`); break;
      case 'RETRACED': audio.playSfx('branch_split'); shell.toast(`RETRACED TO ${ev.nodeId}. HISTORY KEPT.`); break;
      case 'STRAIN_RECOVERED': shell.toast('THREAD STRAIN RELEASED'); break;
      case 'REJECTED': shell.toast(ev.reason, 6000); break;
      case 'WIN': audio.playSfx('final_merge'); scene?.playEnding(); window.setTimeout(() => shell.showEnding(), 6000); break;
    }
  }
  void voiced;
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
  onFocus: (id) => { focusId = id; shell.setFocus(id ? (OBJECT_LABELS[id] ?? id) : null); },
  onMoveEnd: (x, y) => { if (engine.getState().phase === 'EXPLORING') send({ type: 'SET_POSITION', x, y }); },
});
game.scene.add('world', scene, true);

function fitCanvas(): void {
  const vp = document.getElementById('viewport'); if (!vp) return;
  const w = vp.clientWidth, h = vp.clientHeight;
  if (!w || !h) return;
  let k = Math.min(w / VIEW_W, h / VIEW_H);
  if (k >= 2) k = Math.floor(k); // integer upscale when there is room; fractional (still pixelated) on small screens
  const c = game.canvas; if (!c) return;
  c.style.width = Math.floor(VIEW_W * k) + 'px'; c.style.height = Math.floor(VIEW_H * k) + 'px';
}
new ResizeObserver(fitCanvas).observe(document.getElementById('viewport')!);
window.addEventListener('resize', fitCanvas); window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));
game.events.once('ready', fitCanvas); setTimeout(fitCanvas, 50); setTimeout(fitCanvas, 400);

// ---------- keyboard ----------
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const inOverlay = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('.overlay,.fork,.archive');
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const s = engine.getState();
  const overlayUp = shell.startOpen() || shell.helpOpen() || s.phase === 'FORK';
  if (k === 'escape') {
    if (shell.helpOpen()) shell.help(false);
    else if (s.phase === 'FORK') send({ type: 'CANCEL_FORK' });
    else if (s.phase === 'ARCHIVE') toggleArchive(false);
    return;
  }
  if (shell.startOpen()) return;
  if (k === '?' || k === 'h') { shell.help(!shell.helpOpen()); return; }
  if (MOVE_KEYS.has(k)) { keys.add(k); if (!inOverlay(e.target)) e.preventDefault(); return; }
  if (overlayUp) return;
  if (k === 'e' || k === ' ') { if (k === ' ' && inOverlay(e.target)) return; e.preventDefault(); act(); }
  else if (k === 'tab' || k === 'm') { e.preventDefault(); toggleArchive(s.phase !== 'ARCHIVE'); }
  else if (k === 'c') { send({ type: 'REQUEST_PARTNER', intention: s.intention }); }
  else if (k === 'r') { retraceSelected(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); touchDir = { x: 0, y: 0 }; });
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b && !b.closest('.overlay,.fork,.archive')) b.blur();
});

// ---------- boot ----------
(window as any).__et = { engine };
if (new URLSearchParams(location.search).get('debug') === '1') {
  // test helper (only with ?debug=1): force meters for CSS band checks; the next dispatch recomputes them
  (window as any).__et.debug = {
    setMeters: (drift: number, strain: number) => {
      const st = engine.getState() as SimulationState; st.realityDrift = drift; st.bondStrain = strain; notify(st, []);
    },
    texDataUrl: (key: string) => (game.textures.get(key).getSourceImage() as HTMLCanvasElement).toDataURL('image/png'),
    portraitUrl: (who: string, expr: string) => import('./game/ink').then(m => m.portrait(who as 'player', expr as 'calm').toDataURL('image/png')),
    shell, pos: () => scene.pos(), blocked: isBlockedPx, pxFocus: () => focusId, teleport: (x: number, y: number) => scene.teleport(x, y), showEnding: () => shell.showEnding(),
  };
}
subscribe();
shell.render(engine.getState());
shell.showStart(true, { hasSave: !!saved && !corrupt && engine.getState().turn > 0, corrupt });
