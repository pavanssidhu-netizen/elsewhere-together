import type { SimulationState, Identity } from '../sim/types';
import { $, esc } from './dom';
import { applyMeta } from './metaEffects';
import { ART_LABEL, toggleArtStyle } from '../game/artStyle';
import { ArchiveView } from './archive';

export type Screen = 'title' | 'facts' | 'intro' | 'play' | 'ending' | 'archive';
export type Verb = 'SELF' | 'ECHO' | 'LET_GO' | 'USE';
export type CaptionKind = 'world' | 'warning' | 'trace' | 'voice' | 'system';

export interface Handlers {
  play(): void; cont(): void; newGame(): void; demo(): void;
  identity(i: Identity): void;
  verb(v: Verb): void;
  dir(x: number, y: number): void;
  toggleMute(): void; toggleReduce(): void;
  openArchive(): void; restart(): void;
}

const FACTS: { text: string; src: string }[] = [
  { text: 'The many-worlds idea is one interpretation of quantum mechanics. It is a way of reading the maths, not an established way to travel between worlds.', src: 'Everett 1957; DeWitt' },
  { text: 'Mutualism means both partners benefit. It can also leave each of them dependent on the other.', src: 'Bronstein 2015, "Mutualism"' },
  { text: 'Decoherence explains why branches stop interfering with each other. Once they have separated, they no longer meet.', src: 'Zurek' },
];

export class Shell {
  readonly root: HTMLElement;
  private h: Handlers;
  private capTimers = new Set<number>();
  private history: { text: string; kind: CaptionKind }[] = [];
  private bloomTimer = 0;
  private factTimer = 0;
  private factIdx = 0;
  private factDone: (() => void) | null = null;
  private archive: ArchiveView | null = null;
  reduce = false;
  muted = false;
  screen: Screen = 'title';

  constructor(host: HTMLElement, h: Handlers) {
    this.h = h;
    host.innerHTML = TEMPLATE;
    this.root = $(host, '#os');
    const on = (sel: string, fn: () => void) => { $(this.root, sel).onclick = () => fn(); };
    on('#b-mute', () => h.toggleMute()); on('#b-reduce', () => h.toggleReduce());
    on('#b-cog', () => $(this.root, '#settings').classList.toggle('open')); on('#b-style', () => toggleArtStyle());
    on('#help-close', () => this.help(false));
    on('#b-call', () => (window as any).__etCall?.());
    on('#t-play', () => h.play()); on('#t-new', () => h.newGame()); on('#t-demo', () => h.demo());
    on('#t-mute', () => h.toggleMute());
    on('#t-about', () => this.about(true)); on('#about-close', () => this.about(false));
    on('#f-skip', () => this.endFacts()); on('#f-next', () => this.nextFact());
    on('#id-amber', () => h.identity('amber')); on('#id-cyan', () => h.identity('cyan'));
    on('#e-archive', () => h.openArchive()); on('#e-again', () => h.restart());
    on('#v-self', () => h.verb('SELF')); on('#v-echo', () => h.verb('ECHO')); on('#v-let', () => h.verb('LET_GO')); on('#v-use', () => h.verb('USE'));
    const vec: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    this.root.querySelectorAll<HTMLButtonElement>('.dpad button').forEach(b => {
      const [x, y] = vec[b.dataset.d!];
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); h.dir(x, y); });
      const up = () => h.dir(0, 0);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    this.setScreen('title');
  }

  get viewport(): HTMLElement { return $(this.root, '#game'); }

  setScreen(s: Screen): void {
    this.screen = s; this.root.dataset.screen = s;
    for (const id of ['title', 'facts', 'intro', 'ending', 'archive']) $(this.root, '#' + id).classList.toggle('open', id === s);
  }
  overlayOpen(): boolean { return this.screen !== 'play' || this.helpOpen() || this.aboutOpen(); }

  help(open: boolean): void { $(this.root, '#help').classList.toggle('open', open); }
  helpOpen(): boolean { return $(this.root, '#help').classList.contains('open'); }
  about(open: boolean): void { $(this.root, '#about').classList.toggle('open', open); }
  aboutOpen(): boolean { return $(this.root, '#about').classList.contains('open'); }

  // ---- title ----
  showTitle(opts: { hasSave: boolean; stale: boolean }): void {
    this.setScreen('title');
    ($(this.root, '#t-play') as HTMLButtonElement).textContent = opts.hasSave ? 'CONTINUE' : 'PLAY';
    $(this.root, '#t-new').hidden = !opts.hasSave && !opts.stale;
    $(this.root, '#t-stale').hidden = !opts.stale;
    $(this.root, '#t-play').hidden = opts.stale;
  }
  titleMute(): void { $(this.root, '#t-mute').textContent = this.muted ? 'SOUND: OFF' : 'SOUND: ON'; }

  // ---- loading facts (skippable) ----
  showFacts(done: () => void): void {
    this.setScreen('facts'); this.factDone = done; this.factIdx = -1; this.nextFact();
  }
  private nextFact(): void {
    clearTimeout(this.factTimer);
    this.factIdx++;
    if (this.factIdx >= FACTS.length) { this.endFacts(); return; }
    const f = FACTS[this.factIdx];
    $(this.root, '#f-text').textContent = f.text; $(this.root, '#f-src').textContent = f.src;
    $(this.root, '#f-n').textContent = `${this.factIdx + 1} / ${FACTS.length}`;
    this.factTimer = window.setTimeout(() => this.nextFact(), 5200);
  }
  skipFacts(): void { this.endFacts(); }
  private endFacts(): void {
    clearTimeout(this.factTimer);
    const d = this.factDone; this.factDone = null; if (d) d();
  }

  // ---- intro: together, then split, then choose ----
  showIntro(): void {
    const el = $(this.root, '#intro'); el.classList.remove('go'); this.setScreen('intro');
    void el.offsetWidth; el.classList.add('go');
  }

  // ---- play ----
  showPlay(): void { this.setScreen('play'); }

  setVerbs(kind: 'fork' | 'use' | null, label?: string, actions: string[] = []): void {
    const bar = $(this.root, '#verbs'); bar.dataset.kind = kind ? 'ctx' : 'none';
    bar.classList.toggle('on', !!kind);
    $(this.root, '#v-target').textContent = label ?? '';
    const ids = ['#v-self', '#v-echo', '#v-let'], keys = ['E', 'Q', 'F'];
    ids.forEach((id, i) => {
      const b = $(this.root, id) as HTMLButtonElement;
      const a = actions[i] ?? (i === 0 && kind ? 'Look' : '');
      b.style.display = a ? '' : 'none';
      b.innerHTML = `${a} <kbd>${keys[i]}</kbd>`;
    });
    ($(this.root, '#v-use') as HTMLElement).style.display = 'none';
  }

  caption(text: string, kind: CaptionKind = 'world', ms = 4200): void {
    this.history.push({ text, kind }); if (this.history.length > 40) this.history.shift();
    this.showCaption(text, kind, ms);
  }
  private showCaption(text: string, kind: CaptionKind, ms: number): void {
    const box = $(this.root, '#caps');
    while (box.children.length >= 3) box.firstElementChild!.remove();
    const li = document.createElement('div'); li.className = `cap k-${kind}`; li.textContent = text; box.appendChild(li);
    const t = window.setTimeout(() => { li.classList.add('out'); window.setTimeout(() => li.remove(), 500); this.capTimers.delete(t); }, ms);
    this.capTimers.add(t);
  }
  /** L: show the most recent caption again. */
  replay(): void {
    const last = this.history[this.history.length - 1];
    if (last) { $(this.root, '#caps').innerHTML = ''; this.showCaption(last.text, last.kind, 6000); }
  }
  clearCaptions(): void { $(this.root, '#caps').innerHTML = ''; this.history = []; }

  /** Dusty pink screen-edge bloom on every fork. Reduced motion: static tint, no pulse. */
  bloom(): void {
    const b = $(this.root, '#bloom');
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(this.bloomTimer);
    this.bloomTimer = window.setTimeout(() => b.classList.remove('on'), 800);
  }
  bloomActive(): boolean { return $(this.root, '#bloom').classList.contains('on'); }

  render(s: Readonly<SimulationState>): void {
    applyMeta(this.root, s.realityDrift, s.bondStrain, this.reduce);
    this.root.classList.toggle('id-cyan', s.v2?.playerIdentity === 'cyan');
    $(this.root, '#b-mute').textContent = this.muted ? 'MUTED' : 'SND';
    $(this.root, '#b-reduce').textContent = this.reduce ? 'DISTORTION: LOW' : 'DISTORTION: FULL';
    $(this.root, '#b-style').textContent = `STYLE: ${ART_LABEL}`;
    $(this.root, '#b-mute').setAttribute('aria-pressed', String(this.muted));
    $(this.root, '#b-reduce').setAttribute('aria-pressed', String(this.reduce));
    this.titleMute();
  }

  // ---- ending + archive ----
  showEnding(s: Readonly<SimulationState>): void {
    const fade = s.v2.ending === 'FADE' || s.phase === 'FADE';
    const card = $(this.root, '#ending');
    card.dataset.end = fade ? 'FADE' : 'WIN';
    $(this.root, '#e-title').textContent = fade ? 'THE THREAD FADED' : 'WE MADE ROOM FOR EACH OTHER';
    $(this.root, '#e-text').innerHTML = fade
      ? 'Too far apart, too strained, for too long. The link thinned until neither of you could hear the other.<br>The worlds were never wrong. They simply stopped reaching.'
      : 'We didn\'t find the same world.<br>We made one where both of us could stay.';
    $(this.root, '#e-stats').textContent = `TICKS ${s.v2.tick} · BRANCHES ${Object.keys(s.nodes).length} · DRIFT ${Math.round(s.realityDrift)} · STRAIN ${Math.round(s.bondStrain)}`;
    this.setScreen('ending');
  }
  openArchive(s: Readonly<SimulationState>): void {
    this.setScreen('archive');
    this.archive = new ArchiveView($(this.root, '#archive'), s, { restart: () => this.h.restart(), close: () => this.showEnding(s) });
    this.archive.fit();
  }
  archiveView(): ArchiveView | null { return this.archive; }
  closeAll(): void { this.archive = null; $(this.root, '#archive').innerHTML = ''; }
}

const blob = (cls: string): string => `<svg class="blob ${cls}" viewBox="0 0 64 64" aria-hidden="true"><ellipse class="b-body" cx="32" cy="38" rx="20" ry="18"/><circle class="b-eye" cx="25" cy="34" r="3"/><circle class="b-eye" cx="39" cy="34" r="3"/><path class="b-ear" d="M16 26 L12 10 L26 20 Z M48 26 L52 10 L38 20 Z"/></svg>`;

const TEMPLATE = `
<div id="os" class="os" data-screen="title">
  <header class="topbar" aria-label="Game controls">
    <button id="b-mute" aria-pressed="false" title="Sound" aria-label="Sound">SND</button>
    <button id="b-cog" title="Settings" aria-label="Settings">&#9881;</button>
    <div id="settings" class="settings"><button id="b-reduce" aria-pressed="false">DISTORTION: FULL</button><button id="b-style">STYLE</button></div>
  </header>
  <button id="b-call" class="callbtn" title="Call through the Thread (C). Costs one load of fuel and strains the Thread.">CALL THROUGH THE THREAD <kbd>C</kbd> <small>uses 1 fuel</small></button>
  <main class="stage">
    <div class="viewport" id="viewport"><div id="game"></div><div id="caps" class="caps" role="status" aria-live="polite"></div></div>
    <div id="verbs" class="verbs" data-kind="none">
      <span id="v-target" class="v-target"></span>
      <button id="v-self" class="verb v-fork">KEEP <kbd>E</kbd></button>
      <button id="v-echo" class="verb v-fork">SEND <kbd>Q</kbd></button>
      <button id="v-let" class="verb v-fork">LET BE <kbd>F</kbd></button>
      <button id="v-use" class="verb v-use">USE <kbd>E</kbd></button>
    </div>
    <div class="dpad" aria-label="Move">
      <button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="right" aria-label="Right">▶</button><button data-d="down" aria-label="Down">▼</button>
    </div>
  </main>
  <div id="bloom" class="bloom" aria-hidden="true"></div>

  <section id="title" class="screen title open"><div class="card">
    <h1>OUT OF<br>SYNC</h1>
    <p class="tag">Two of you. One thread. A world that splits whenever you choose.</p>
    <p id="t-stale" class="warn-t" hidden>YOUR SAVE IS FROM AN EARLIER VERSION OR COULD NOT BE READ. START A NEW GAME (the old save stays untouched until then).</p>
    <div class="btns"><button id="t-play" class="primary">PLAY</button><button id="t-new" hidden>NEW GAME</button><button id="t-demo">DEMO</button><button id="t-mute">SOUND: ON</button><button id="t-about">ABOUT</button></div>
    <p class="small">Sound starts after you press a button. Headphones recommended.</p>
  </div></section>

  <section id="facts" class="screen facts"><div class="card">
    <p class="small" id="f-n"></p><p id="f-text" class="fact"></p><p id="f-src" class="small"></p>
    <div class="btns"><button id="f-next">NEXT</button><button id="f-skip" class="primary">SKIP</button></div>
  </div></section>

  <section id="intro" class="screen intro"><div class="card wide">
    <div class="stage-intro" aria-hidden="true">
      <div class="pair"><div class="who a">${blob('amber')}</div><div class="who c">${blob('cyan')}</div></div>
      <div class="split-line"></div>
    </div>
    <p class="i-1">Two of you, side by side.</p>
    <p class="i-2">Then the beacon between you flares, and splits the world in two.</p>
    <p class="i-3">Which one of them are you?</p>
    <div class="btns choose"><button id="id-amber" class="idbtn amber">${blob('amber')}<span>JENSEN</span></button><button id="id-cyan" class="idbtn cyan">${blob('cyan')}<span>SAM</span></button></div>
  </div></section>

  <section id="ending" class="screen ending" data-end="WIN"><div class="card">
    <p id="e-title" class="e-title"></p><p id="e-text" class="endcard"></p><p class="small" id="e-stats"></p>
    <div class="btns"><button id="e-archive" class="primary">CAUSAL ARCHIVE</button><button id="e-again">PLAY AGAIN</button></div>
  </div></section>

  <section id="archive" class="screen archive" aria-label="Causal archive"></section>

  <div id="help" class="overlay"><div class="card">
    <div class="card-h">HELP</div>
    <p>The beacon that split you still exists in both worlds. Relight yours. Help them relight theirs. Bring the two flames into sync. Uncertain events split the world again as you go; a pink edge means a new branch.</p>
    <ul>
      <li><b>E / Q / F</b>: the actions shown next to the object you are standing by.</li>
      <li><b>C</b>: call through the Thread. Tell your partner something you learned. It burns one load of fuel.</li>
      <li>The beacon in the clearing shows both of you: amber is your side, cyan is theirs. When both are complete, stand beside it.</li>
      <li>Warnings tell you where to go if the thread frays. The old stones and the thread terminal help.</li>
    </ul>
    <p class="keys"><b>Keys:</b> WASD / arrows move · E Q F act · L last caption · Esc close.<br>Mobile: D-pad and the verb buttons.</p>
    <button id="help-close">CLOSE</button>
  </div></div>

  <div id="about" class="overlay"><div class="card">
    <div class="card-h">ABOUT AND CREDITS</div>
    <p><b>Art:</b> Scribble Dungeons by Kenney (kenney.nl), CC0.</p>
    <p><b>Voices:</b> generated with ElevenLabs. Music and effects: synthesised in-browser.</p>
    <p><b>Science:</b> this is a story, not physics.</p>
    <ul>
      <li>Everett, H. (1957). "Relative State" formulation of quantum mechanics.</li>
      <li>DeWitt, B. (1970s). Popularisation of the many-worlds interpretation.</li>
      <li>Zurek, W. H. on decoherence (Reviews of Modern Physics, 2003).</li>
      <li>Bronstein, J. L. (2015). Mutualism. Oxford University Press.</li>
    </ul>
    <button id="about-close">CLOSE</button>
  </div></div>
</div>`;
void esc;
