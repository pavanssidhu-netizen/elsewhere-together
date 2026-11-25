// Director's Cut entry point. Owns: Phaser config, scene registry, FlowState -> scene router, DOM overlay (skip / pause / mute), debug jumps.
import Phaser from 'phaser';
import { FlowController, type FlowEvent, type FlowSnapshot, type FlowState } from '../flow/flow';
import { GAME_W, GAME_H, SCENES, type DCServices, type DCSession, type DCSettings } from './contracts';
import { createDCAudio } from './audio/dcAudio';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { IntroScene } from './scenes/IntroScene';
import { SelectScene } from './scenes/SelectScene';
import { ForestScene } from './scenes/ForestScene';
import { ReunionScene } from './scenes/ReunionScene';
import { AbductionScene } from './scenes/AbductionScene';
import { OfficeScene } from './scenes/OfficeScene';
import { SoupScene } from './scenes/SoupScene';
import { RunnerScene } from './scenes/RunnerScene';
import { RunnerResultScene } from './scenes/RunnerResultScene';
import { EndingScene } from './scenes/EndingScene';

const q = new URLSearchParams(location.search);
const baseSeed = Number(q.get('seed')) || 48219;
const flow = new FlowController(baseSeed);

const settings: DCSettings = (() => {
  const d: DCSettings = { relaxed: q.get('relaxed') === '1', reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, muted: false, music: 0.7, voice: 1, sfx: 0.8 };
  try { Object.assign(d, JSON.parse(localStorage.getItem('oos-dc-settings') || '{}'), q.get('relaxed') === '1' ? { relaxed: true } : {}); } catch { /* ignore */ }
  return d;
})();
const saveSettings = () => { try { localStorage.setItem('oos-dc-settings', JSON.stringify(settings)); } catch { /* ignore */ } };

const session: DCSession = { forestSummary: null, runnerStats: null };
const audio = createDCAudio(settings);
audio.setMuted(settings.muted);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let toastTimer = 0;
const services: DCServices = {
  flow, audio, settings, session,
  toast(msg) { const t = $('dc-toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.style.display = 'none'), 2600); },
};

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'dc-game', width: GAME_W, height: GAME_H, backgroundColor: '#05060d',
  pixelArt: true, roundPixels: true, antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  audio: { noAudio: true },                       // all sound goes through DCAudio (Web Audio), not Phaser's sound manager
  scene: [BootScene, TitleScene, IntroScene, SelectScene, ForestScene, ReunionScene, AbductionScene, OfficeScene, SoupScene, RunnerScene, RunnerResultScene, EndingScene],
});
game.registry.set('dc', services);

/** FlowState -> scene. Every transition in the game goes through here, so it is explicit and testable. */
export function routeFor(snap: Readonly<FlowSnapshot>): { key: string; data: Record<string, unknown> } {
  const base = { snap };
  switch (snap.state) {
    case 'TITLE': return { key: SCENES.Title, data: base };
    case 'COSMIC_INTRO': return { key: SCENES.Intro, data: base };
    case 'CHARACTER_SELECT': return { key: SCENES.Select, data: base };
    case 'FOREST_GAME': return { key: SCENES.Forest, data: base };
    case 'FOREST_SUCCESS': return { key: SCENES.Reunion, data: base };
    case 'FOREST_FAILURE': return { key: SCENES.Abduction, data: { ...base, phase: 'collapse' } };
    case 'ABDUCTION': return { key: SCENES.Abduction, data: { ...base, phase: 'beam' } };
    case 'TIME_MASTER_OFFICE': return { key: SCENES.Office, data: base };
    case 'SOUP_ENDING': return { key: SCENES.Soup, data: base };
    case 'THREAD_RUNNER': return { key: SCENES.Runner, data: base };
    case 'RUNNER_SUCCESS': return { key: SCENES.RunnerResult, data: { ...base, win: true } };
    case 'RUNNER_FAILURE': return { key: SCENES.RunnerResult, data: { ...base, win: false } };
    case 'REUNION_ENDING': return { key: SCENES.Ending, data: { ...base, kind: 'FOREST_REUNION' } };
    case 'FINAL_ENDING': return { key: SCENES.Ending, data: { ...base, kind: snap.ending } };
  }
}

let started = false;
function showState(snap: Readonly<FlowSnapshot>): void {
  const r = routeFor(snap);
  for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
  game.scene.start(r.key, r.data);
  syncOverlay(snap);
}

// ---- DOM overlay: skip / pause / mute --------------------------------------------------------
const GAMEPLAY: FlowState[] = ['FOREST_GAME', 'THREAD_RUNNER'];
function syncOverlay(snap: Readonly<FlowSnapshot>): void {
  $('dc-skip').style.display = flow.skippable && snap.state !== 'TIME_MASTER_OFFICE' ? 'block' : 'none';
  $('dc-pause').style.display = GAMEPLAY.includes(snap.state) ? 'block' : 'none';
  $('dc-pause-overlay').classList.toggle('open', snap.paused);
  $('dc-restart-game').style.display = GAMEPLAY.includes(snap.state) ? 'block' : 'none';
  $('dc-relaxed').textContent = 'RELAXED MODE: ' + (settings.relaxed ? 'ON (takes effect next run)' : 'OFF');
  $('dc-mute').textContent = settings.muted ? 'MUTED' : 'SND';
}
flow.subscribe((snap, e) => {
  if (!started) return;
  const pauseOnly = e.type === 'PAUSE' || e.type === 'RESUME';
  if (pauseOnly) { syncOverlay(snap); if (e.type === 'PAUSE') game.scene.getScenes(true).forEach(s => s.scene.pause());
    else game.scene.getScenes(false).filter(s => s.scene.isPaused()).forEach(s => s.scene.resume());
    return; }
  showState(snap);
});
$('dc-skip').onclick = () => { audio.skipVoice(); flow.dispatch({ type: 'SKIP' }); };
$('dc-pause').onclick = () => flow.dispatch({ type: 'PAUSE' });
$('dc-resume').onclick = () => flow.dispatch({ type: 'RESUME' });
$('dc-relaxed').onclick = () => { settings.relaxed = !settings.relaxed; saveSettings(); syncOverlay(flow.snapshot()); };
$('dc-restart-game').onclick = () => { const s = flow.state; flow.dispatch({ type: 'RESUME' }); flow.dispatch({ type: s === 'THREAD_RUNNER' ? 'RESTART_RUNNER' : 'RESTART_FOREST' }); };
$('dc-to-title').onclick = () => flow.dispatch({ type: 'QUIT' });
$('dc-mute').onclick = () => { settings.muted = !settings.muted; audio.setMuted(settings.muted); saveSettings(); syncOverlay(flow.snapshot()); };
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && GAMEPLAY.includes(flow.state)) flow.dispatch({ type: flow.snapshot().paused ? 'RESUME' : 'PAUSE' });
  if ((e.key === 'Enter' || e.key === ' ') && flow.skippable && flow.state !== 'TIME_MASTER_OFFICE' && !e.repeat) { /* scenes own Enter/Space for advancing dialogue; skip stays on the button */ }
});
// phones held upright: the 16:9 game is tiny, so ask for landscape (dismissible)
const rot = $('dc-rotate');
function checkOrientation(): void {
  const portrait = innerHeight > innerWidth * 1.15 && matchMedia('(pointer: coarse)').matches && !sessionStorage.getItem('oos-rot-dismissed');
  rot.style.display = portrait ? 'flex' : 'none';
}
$('dc-rotate-ok').onclick = () => { sessionStorage.setItem('oos-rot-dismissed', '1'); checkOrientation(); };
window.addEventListener('resize', checkOrientation); window.addEventListener('orientationchange', checkOrientation); checkOrientation();
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && GAMEPLAY.includes(flow.state) && !flow.snapshot().paused) flow.dispatch({ type: 'PAUSE' }); });

// ---- debug jumps: ?jump=FOREST_GAME&char=SAM  (drives the real flow events, never sets state directly) ----
function jump(target: string): void {
  const ch = (q.get('char') || 'JENSEN').toUpperCase() === 'SAM' ? 'SAM' : 'JENSEN';
  const toForest: FlowEvent[] = [{ type: 'START' }, { type: 'SKIP' }, { type: 'SELECT', character: ch }];
  const toOffice: FlowEvent[] = [...toForest, { type: 'FOREST_LOST' }, { type: 'SKIP' }, { type: 'SKIP' }];
  const plans: Record<string, FlowEvent[]> = {
    COSMIC_INTRO: [{ type: 'START' }], CHARACTER_SELECT: toForest.slice(0, 2), FOREST_GAME: toForest,
    FOREST_SUCCESS: [...toForest, { type: 'FOREST_WON' }], FOREST_FAILURE: [...toForest, { type: 'FOREST_LOST' }],
    ABDUCTION: [...toForest, { type: 'FOREST_LOST' }, { type: 'SKIP' }], TIME_MASTER_OFFICE: toOffice,
    SOUP_ENDING: [...toOffice, { type: 'REFUSE' }], THREAD_RUNNER: [...toOffice, { type: 'ACCEPT' }],
    RUNNER_SUCCESS: [...toOffice, { type: 'ACCEPT' }, { type: 'RUNNER_WON' }], RUNNER_FAILURE: [...toOffice, { type: 'ACCEPT' }, { type: 'RUNNER_LOST' }],
    REUNION_ENDING: [...toForest, { type: 'FOREST_WON' }, { type: 'SKIP' }], FINAL_ENDING: [...toOffice, { type: 'ACCEPT' }, { type: 'RUNNER_WON' }, { type: 'SKIP' }],
  };
  for (const e of plans[target] ?? []) flow.dispatch(e);
}

game.events.once('dc-ready', () => {
  started = true;
  const j = q.get('jump');
  if (j) jump(j);
  showState(flow.snapshot());
});

import { auditText } from './ui/fit';
(window as unknown as Record<string, unknown>).__dc = { flow, game, services, routeFor, auditText: () => auditText(game) };
