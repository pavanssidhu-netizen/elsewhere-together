import type { SimulationState, Intention } from '../sim/types';
import { $, esc } from './dom';
import { renderFork, renderArchive, tpl, type PanelHandlers } from './panels';
import { applyMeta, band, signalQuality } from './metaEffects';
import { ART_INK, toggleArtStyle } from '../game/artStyle';
import { portrait, type Expr } from '../game/ink';

export interface Handlers extends PanelHandlers {
  act(): void; call(): void; openArchive(): void; retraceSelected(): void;
  intention(i: Intention): void; rest(): void;
  start(): void; newGame(): void; demo(): void; playAgain(): void;
  toggleMute(): void; toggleReduce(): void;
  dir(x: number, y: number): void;
  tab(t: 'world' | 'archive' | 'link'): void;
}

const ANCHORS: { id: string; name: string }[] = [
  { id: 'LANTERN', name: 'LANTERN' }, { id: 'GREENHOUSE', name: 'GREENHOUSE' }, { id: 'LIGHTHOUSE', name: 'LIGHTHOUSE' },
];

export class Shell {
  readonly root: HTMLElement;
  selected = 'root';
  private h: Handlers;
  private subText = 'CONNECTING TO BRANCH 000... TWO SIGNATURES DETECTED.';
  private subTimer = 0;
  private toastTimer = 0;
  private lastLogKey = '';
  private lastExpr = '';
  private lastState: Readonly<SimulationState> | null = null;
  reduce = false;
  muted = false;

  constructor(host: HTMLElement, h: Handlers) {
    this.h = h;
    host.innerHTML = TEMPLATE;
    this.root = $(host, '#os');
    const on = (sel: string, fn: () => void) => { const b = $(this.root, sel); b.onclick = () => fn(); return b; };
    on('#b-mute', () => h.toggleMute()); on('#b-reduce', () => h.toggleReduce()); on('#b-help', () => this.help(true)); on('#b-style', () => toggleArtStyle());
    on('#help-close', () => this.help(false));
    on('#btn-act', () => h.act()); on('#btn-map', () => h.openArchive()); on('#btn-retrace', () => h.retraceSelected());
    on('#btn-call', () => h.call()); on('#btn-call2', () => h.call());
    on('#btn-archive2', () => h.openArchive()); on('#btn-act2', () => h.act());
    on('#btn-open-archive', () => h.openArchive());
    on('#i-find', () => h.intention('FIND_ME')); on('#i-safe', () => h.intention('STAY_SAFE')); on('#i-help', () => h.intention('HELP_MY_WORLD'));
    on('#i-rest', () => h.rest());
    on('#s-start', () => h.start()); on('#s-new', () => h.newGame()); on('#s-demo', () => h.demo());
    on('#e-again', () => h.playAgain());
    this.root.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.onclick = () => h.tab(b.dataset.tab as 'world' | 'archive' | 'link'));
    // d-pad (pointer events so touch + mouse both work)
    const vec: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    this.root.querySelectorAll<HTMLButtonElement>('.dpad button').forEach(b => {
      const [x, y] = vec[b.dataset.d!];
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); h.dir(x, y); });
      const up = () => h.dir(0, 0);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  get viewport(): HTMLElement { return $(this.root, '#game'); }

  help(open: boolean): void { $(this.root, '#help').classList.toggle('open', open); }
  helpOpen(): boolean { return $(this.root, '#help').classList.contains('open'); }

  showStart(open: boolean, opts?: { hasSave?: boolean; corrupt?: boolean }): void {
    const st = $(this.root, '#start'); st.classList.toggle('open', open);
    if (!opts) return;
    $(this.root, '#s-start').textContent = opts.hasSave ? 'CONTINUE' : 'START';
    ($(this.root, '#s-start') as HTMLButtonElement).hidden = !!opts.corrupt;
    ($(this.root, '#s-new') as HTMLButtonElement).hidden = !(opts.hasSave || opts.corrupt);
    $(this.root, '#s-corrupt').hidden = !opts.corrupt;
  }
  startOpen(): boolean { return $(this.root, '#start').classList.contains('open'); }

  setFocus(label: string | null): void {
    $(this.root, '#focus').textContent = label ? `[E] ${label}` : '';
    for (const id of ['#btn-act', '#btn-act2']) ($(this.root, id) as HTMLButtonElement).classList.toggle('ready', !!label);
  }

  toast(text: string, ms = 4200): void {
    const t = $(this.root, '#toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  setSubtitle(text: string, st: Readonly<SimulationState>): void {
    const strainBand = band(st.bondStrain);
    const delay = strainBand >= 2 ? 1400 : strainBand === 1 ? 700 : 0; // strain: messages arrive late
    clearTimeout(this.subTimer);
    const q = $(this.root, '#sig');
    if (delay) q.textContent = `${q.dataset.q ?? ''} · INCOMING DELAYED…`;
    this.subTimer = window.setTimeout(() => { this.subText = text; this.renderSub(this.lastState ?? st); }, delay);
  }

  private renderSub(s: Readonly<SimulationState>): void {
    const q = signalQuality(s.nodes[s.player.nodeId]?.world.signal ?? 2, s.bondStrain);
    const el = $(this.root, '#sig'); el.dataset.q = q; el.textContent = `SIGNAL: ${q}`; el.className = `sig ${q}`;
    const shown = this.subText; // subtitles are always pristine; only the signal label reflects state
    $(this.root, '#sub').textContent = `"${shown}"`; $(this.root, '#subline').textContent = `CYAN: "${shown}"`;
    $(this.root, '#sub').className = `sub ${q}`;
  }

  render(s: Readonly<SimulationState>): void {
    this.lastState = s;
    applyMeta(this.root, s.realityDrift, s.bondStrain, this.reduce);
    $(this.root, '#b-mute').textContent = this.muted ? 'MUSIC OFF' : 'MUSIC ON';
    $(this.root, '#b-reduce').textContent = this.reduce ? 'DISTORTION: LOW' : 'DISTORTION: FULL';
    $(this.root, '#b-style').textContent = ART_INK ? 'STYLE: INK' : 'STYLE: PIXEL';
    $(this.root, '#b-mute').setAttribute('aria-pressed', String(this.muted));
    $(this.root, '#b-reduce').setAttribute('aria-pressed', String(this.reduce));
    $(this.root, '#branch').textContent = s.player.nodeId === 'root' ? '000' : s.player.nodeId.replace(/^N/, '');
    // meters
    const d = s.realityDrift, st = s.bondStrain;
    ($(this.root, '#m-drift') as HTMLElement).style.setProperty('--v', d + '%');
    ($(this.root, '#m-strain') as HTMLElement).style.setProperty('--v', st + '%');
    $(this.root, '#t-drift').textContent = `DRIFT ${Math.round(d)}${d >= 80 ? ' · UNCONFIRMED SIGNAL' : d >= 60 ? ' · HIGH' : d >= 30 ? ' · RISING' : ''}`;
    $(this.root, '#t-strain').textContent = `STRAIN ${Math.round(st)}${st >= 80 ? ' · LINK OVERDRAWN' : st >= 60 ? ' · STRAINED' : st >= 30 ? ' · FRAYING' : ''}`;
    $(this.root, '#warn').textContent = st >= 80 ? 'LINK OVERDRAWN: REST AT THE THREAD TERMINAL' : d >= 80 ? 'UNCONFIRMED SIGNAL: RETRACE TO AN EARLIER BRANCH' : st >= 60 ? 'LINK STRAINED: ECHO COSTS MORE THAN YOU CAN SPARE' : d >= 60 ? 'DRIFT HIGH: WORLDS ARE DIVERGING' : '';
    $(this.root, '#anchors').innerHTML = ANCHORS.map(a => {
      const x = s.anchors.find(q => q.id === a.id);
      const g = x?.aligned ? '◆' : x?.playerReady || x?.partnerReady ? '◈' : '◇';
      const t = x?.aligned ? 'aligned' : `${x?.playerReady ? 'you ready' : 'you not ready'}, ${x?.partnerReady ? 'partner ready' : 'partner not ready'}`;
      return `<span class="anchor ${x?.aligned ? 'on' : ''}" title="${a.name}: ${t}"><i>${g}</i> ${a.name}<small>${x?.aligned ? 'ALIGNED' : x?.playerReady && x?.partnerReady ? 'READY' : x?.playerReady ? 'YOU' : x?.partnerReady ? 'PARTNER' : '—'}</small></span>`;
    }).join('');
    // intention + conflict display
    for (const [id, i] of [['#i-find', 'FIND_ME'], ['#i-safe', 'STAY_SAFE'], ['#i-help', 'HELP_MY_WORLD']] as const) {
      $(this.root, id).classList.toggle('active', s.intention === i); $(this.root, id).setAttribute('aria-pressed', String(s.intention === i));
    }
    const goalText: Record<string, string> = { SEEK: 'seeking you', STABILISE: 'stabilising own world', ASSIST: 'assisting', ANCHOR: 'moving to an anchor' };
    $(this.root, '#conflict').textContent = `YOU ASKED: ${s.intention.replace(/_/g, ' ')}   |   PARTNER DOING: ${goalText[s.partner.lastGoal ?? 'SEEK'] ?? '—'}`;
    // log
    const entries = s.log.slice(-40);
    let html = entries.map((e, i) => `<li class="k-${e.kind} ${e.uncertain ? 'unc' : ''}"><b>#${e.turn}</b> ${e.uncertain ? '? ' : ''}${esc(e.text)}</li>`).reverse().join('');
    if (band(s.realityDrift) >= 1 && entries.length > 1) { // drift cue: a display-only duplicate marked '?'
      const e = entries[entries.length - 2];
      html = `<li class="ghost">? #${e.turn} ${esc(e.text)} <i>(unconfirmed duplicate)</i></li>` + html;
    }
    const key = html; if (key !== this.lastLogKey) { $(this.root, '#log').innerHTML = html; this.lastLogKey = key; }
    if (this.subText.startsWith('CONNECTING') ) { const lp = [...s.log].reverse().find(l => l.kind === 'partner'); if (lp && s.turn > 0) this.subText = lp.text; }
    this.renderSub(s);
    this.renderPortraits(s);
    // overlays
    renderFork($(this.root, '#fork'), s, this.h);
    if (!s.nodes[this.selected]) this.selected = s.player.nodeId;
    renderArchive($(this.root, '#archive'), s, this.selected, this.h);
    const arch = s.phase === 'ARCHIVE';
    this.root.classList.toggle('archive-open', arch);
    this.root.dataset.tab = arch ? 'archive' : this.root.dataset.tab === 'archive' ? 'world' : (this.root.dataset.tab ?? 'world');
    this.root.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === this.root.dataset.tab));
    const retraceBtn = $(this.root, '#btn-retrace') as HTMLButtonElement;
    retraceBtn.classList.toggle('ready', arch);
    // ending
    const ending = s.won || s.phase === 'ENDING';
    if (!ending) $(this.root, '#ending').classList.remove('open');
    $(this.root, '#e-stats').textContent = `TURNS ${s.turn} · BRANCHES ${Object.keys(s.nodes).length} · DRIFT ${Math.round(d)} · STRAIN ${Math.round(st)} · RETRACES ${s.retraceCount}`;
  }

  /** INK style only: hand-inked busts. Partner expression follows signal quality and strain. */
  private renderPortraits(s: Readonly<SimulationState>): void {
    if (!ART_INK) return;
    const q = signalQuality(s.nodes[s.player.nodeId]?.world.signal ?? 2, s.bondStrain);
    const expr: Expr = q === 'broken' ? 'faint' : q === 'faint' || s.bondStrain >= 30 ? 'strained' : 'calm';
    if (expr === this.lastExpr) return;
    this.lastExpr = expr;
    const paint = (id: string, src: HTMLCanvasElement) => {
      const cv = $(this.root, id) as HTMLCanvasElement, c = cv.getContext('2d')!;
      c.clearRect(0, 0, cv.width, cv.height); c.drawImage(src, 0, 0);
    };
    paint('#ptn-portrait', portrait('partner', expr));
    paint('#pl-portrait', portrait('player', s.bondStrain >= 60 ? 'strained' : 'calm'));
    $(this.root, '#ptn-portrait').dataset.expr = expr;
  }

  showEnding(): void { $(this.root, '#ending').classList.add('open'); }

  setTab(t: 'world' | 'archive' | 'link'): void {
    this.root.dataset.tab = t;
    this.root.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  }

  forkTitle(templateId: string): string { return tpl(templateId)?.label ?? templateId; }
}

const TEMPLATE = `
<svg class="ink-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <filter id="ink-rough" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
</defs></svg>
<div id="os" class="os" data-tab="world">
  <header class="titlebar">
    <span class="logo">ECHO/OS</span><span class="sess">// SESSION 07</span><span class="spacer"></span>
    <button id="b-style" title="Switch art style (reloads)">STYLE: PIXEL</button>
    <button id="b-mute" aria-pressed="false">MUSIC ON</button>
    <button id="b-reduce" aria-pressed="false">DISTORTION: FULL</button>
    <button id="b-help">HELP</button>
  </header>
  <nav class="tabs" aria-label="Views">
    <button data-tab="world" class="active">WORLD</button><button data-tab="archive">ARCHIVE</button><button data-tab="link">LINK</button>
  </nav>
  <main class="cols">
    <section class="col-world panel">
      <div class="panel-h"><span>WORLD_VIEW / BRANCH #<span id="branch">000</span></span><span class="unc-tag">UNCONFIRMED SIGNAL</span></div>
      <div class="viewport" id="viewport">
        <div id="game"></div>
        <div class="focus-label" id="focus" aria-live="polite"></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
      <div class="subline" id="subline" aria-hidden="true"></div>
      <div class="actions">
        <button id="btn-act">INTERACT <kbd>E</kbd></button>
        <button id="btn-map">MAP <kbd>TAB</kbd></button>
        <button id="btn-retrace">RETRACE <kbd>R</kbd></button>
      </div>
      <div class="touch">
        <div class="dpad" aria-label="Move">
          <button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="right" aria-label="Right">▶</button><button data-d="down" aria-label="Down">▼</button>
        </div>
        <div class="tbtns"><button id="btn-act2" class="big">ACT</button><button id="btn-call2" class="big">CALL</button><button id="btn-archive2" class="big">ARCHIVE</button></div>
      </div>
      <div id="archive" class="archive"></div>
    </section>
    <section class="col-link">
      <div class="panel comms">
        <div class="panel-h"><span>THREAD_LINK / PARTNER: CYAN</span><span id="sig" class="sig">SIGNAL: readable</span></div>
        <div class="talk"><canvas id="ptn-portrait" class="portrait" width="320" height="320" role="img" aria-label="Partner portrait"></canvas><div class="sub" id="sub">"..."</div></div>
        <div class="conflict" id="conflict"></div>
        <div class="btns">
          <button id="btn-call">CALL <kbd>C</kbd></button>
          <button id="i-find" aria-pressed="false">FIND ME</button>
          <button id="i-safe" aria-pressed="false">STAY SAFE</button>
          <button id="i-help" aria-pressed="false">HELP</button>
          <button id="i-rest">REST</button>
        </div>
        <div class="warn" id="warn" role="alert"></div>
      </div>
      <div class="panel logp">
        <div class="panel-h"><span>CAUSAL LOG</span><button id="btn-open-archive" class="mini">OPEN ARCHIVE</button></div>
        <ul id="log" class="log"></ul>
      </div>
    </section>
  </main>
  <footer class="status">
    <canvas id="pl-portrait" class="portrait-sm" width="320" height="320" role="img" aria-label="Your portrait"></canvas>
    <div class="meter" id="m-drift"><span id="t-drift">DRIFT 0</span><div class="bar"><i></i></div></div>
    <div class="meter strain" id="m-strain"><span id="t-strain">STRAIN 0</span><div class="bar"><i></i></div></div>
    <div class="anchors" id="anchors"></div>
  </footer>

  <div id="fork" class="fork"></div>

  <div id="help" class="overlay"><div class="card">
    <div class="card-h">HELP</div>
    <p>Two beings, one Thread. Walk to a glowing object and interact. Each event splits into two possible branches. You decide who carries the cost.</p>
    <ul>
      <li><b>LET GO</b>: chance decides, no cost.</li><li><b>SELF</b>: take the branch better for you, small strain.</li>
      <li><b>ECHO</b>: take the worse branch so your partner benefits. Big strain.</li>
      <li><b>REST</b> at the violet THREAD TERMINAL lowers strain.</li>
      <li>Activate the three anchors (lantern, greenhouse, lighthouse). Lighthouse last, with drift ≤ 35 and strain ≤ 55.</li>
    </ul>
    <p class="keys"><b>Keys:</b> WASD / arrows move · E / Space interact · Tab or M archive · C call · R retrace · Esc close.<br>Mobile: D-pad, ACT, CALL, ARCHIVE. Reduce distortion and mute are in the title bar.</p>
    <button id="help-close">CLOSE</button>
  </div></div>

  <div id="start" class="overlay open start"><div class="card">
    <div class="logo big">ELSEWHERE, TOGETHER</div>
    <p class="boot">CONNECTING TO BRANCH 000... TWO SIGNATURES DETECTED.</p>
    <p>A rain-soaked town seen through a branching-reality console. You and a distant partner share one Thread. Make room for each other.</p>
    <p id="s-corrupt" hidden class="warn-t">YOUR SAVE COULD NOT BE READ. START A NEW GAME (the old save is left untouched until then).</p>
    <div class="start-btns"><button id="s-start" class="primary">START</button><button id="s-new" hidden>NEW GAME</button><button id="s-demo">DEMO PATH</button></div>
    <p class="small">Sound starts after you press a button. Headphones recommended.</p>
  </div></div>

  <div id="ending" class="overlay ending"><div class="card">
    <p class="endcard">WE DIDN'T FIND THE SAME WORLD.<br>WE MADE ROOM FOR EACH OTHER.</p>
    <p class="small" id="e-stats"></p>
    <button id="e-again" class="primary">PLAY AGAIN</button>
  </div></div>
</div>`;
