import type { SimulationState, BranchNode, JourneyStep, EventRecord, Delta } from '../sim/types';
import { TEMPLATES } from '../sim/engine';
import { esc } from './dom';

// Post-game CAUSAL ARCHIVE: SVG DAG of every branch node, two chronological actor trails (from state.v2.journey),
// chosen vs unchosen styling, node detail, pan / zoom / focus-my-path.
const AMBER = '#e6b66e', CYAN = '#7be0df', PINK = '#e8a0b4';
const DX = 150, DY = 64, R = 15, PAD = 60;

const fmt = (d: Delta | undefined): string => {
  const e = Object.entries(d ?? {}).filter(([, v]) => v);
  return e.length ? e.map(([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`).join(', ') : 'no change';
};

export interface ArchiveHandlers { restart(): void; close(): void }

export class ArchiveView {
  private view = { x: 0, y: 0, k: 1 };
  private svg!: SVGSVGElement;
  private vp!: SVGGElement;
  private pos = new Map<string, { x: number; y: number }>();
  private bounds = { x0: 0, y0: 0, x1: 1, y1: 1 };
  private myNodes = new Set<string>();
  private focusing = false;
  selected = 'root';

  constructor(private host: HTMLElement, private s: Readonly<SimulationState>, private h: ArchiveHandlers) {
    this.layout();
    this.build();
  }

  private layout(): void {
    const nodes = this.s.nodes; let row = 0;
    const place = (id: string): number => {
      const n = nodes[id]; const kids = n.children.filter(c => nodes[c]);
      let y: number;
      if (!kids.length) y = row++ * DY;
      else { const ys = kids.map(place); y = (ys[0] + ys[ys.length - 1]) / 2; }
      this.pos.set(id, { x: n.depth * DX, y });
      return y;
    };
    if (nodes.root) place('root');
    for (const id of Object.keys(nodes)) if (!this.pos.has(id)) place(id); // orphans (defensive)
    const xs = [...this.pos.values()];
    this.bounds = {
      x0: Math.min(...xs.map(p => p.x)) - PAD, y0: Math.min(...xs.map(p => p.y)) - PAD,
      x1: Math.max(...xs.map(p => p.x)) + PAD, y1: Math.max(...xs.map(p => p.y)) + PAD,
    };
  }

  private colours(): { player: string; partner: string } {
    return this.s.v2.playerIdentity === 'cyan' ? { player: CYAN, partner: AMBER } : { player: AMBER, partner: CYAN };
  }

  private taken(): Set<string> {
    const t = new Set<string>(['root']);
    for (const n of Object.values(this.s.nodes)) if (n.visitState === 'VISITED') t.add(n.id);
    for (const j of this.s.v2.journey) { t.add(j.fromNodeId); t.add(j.toNodeId); }
    return t;
  }

  private build(): void {
    const s = this.s, c = this.colours(), taken = this.taken();
    const journey = [...s.v2.journey].sort((a, b) => a.seq - b.seq);
    for (const j of journey) if (j.actor === 'player') { this.myNodes.add(j.fromNodeId); this.myNodes.add(j.toNodeId); }
    this.myNodes.add('root');
    const b = this.bounds;
    // edges
    let edges = '';
    for (const n of Object.values(s.nodes)) {
      if (!n.parentId || !this.pos.has(n.parentId)) continue;
      const p = this.pos.get(n.parentId)!, q = this.pos.get(n.id)!;
      const ch = taken.has(n.id);
      const mx = (p.x + q.x) / 2;
      edges += `<path class="edge ${ch ? 'chosen' : 'unchosen'}" data-n="${esc(n.id)}" d="M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}" fill="none"/>`;
    }
    // trails: per step, a curve offset perpendicular so the two actors do not overlap
    let trails = '';
    for (const j of journey) {
      const p = this.pos.get(j.fromNodeId), q = this.pos.get(j.toNodeId); if (!p || !q) continue;
      const col = j.actor === 'player' ? c.player : c.partner;
      const off = j.actor === 'player' ? -5 : 5;
      const cls = `trail ${j.actor}`;
      if (j.fromNodeId === j.toNodeId) {
        trails += `<circle class="${cls} loop" data-actor="${j.actor}" cx="${p.x + off * 2}" cy="${p.y}" r="${R + 5}" stroke="${col}" fill="none"/>`;
      } else {
        const mx = (p.x + q.x) / 2;
        trails += `<path class="${cls}" data-actor="${j.actor}" d="M${p.x} ${p.y + off} C${mx} ${p.y + off} ${mx} ${q.y + off} ${q.x} ${q.y + off}" stroke="${col}" fill="none"/>`;
      }
      const mx = (p.x + q.x) / 2 + (j.fromNodeId === j.toNodeId ? off * 2 + R + 8 : 0), my = (p.y + q.y) / 2 + off * 2.2;
      trails += `<text class="seq ${j.actor}" x="${mx}" y="${my}" fill="${col}" data-actor="${j.actor}">${j.seq}</text>`;
    }
    // nodes
    let nodesSvg = '';
    const endIds = new Set(journey.filter(j => j.action === 'REUNION').map(j => j.toNodeId));
    for (const n of Object.values(s.nodes)) {
      const p = this.pos.get(n.id)!; const ch = taken.has(n.id);
      const here = n.id === s.player.nodeId, there = n.id === s.partner.nodeId;
      const label = n.id === 'root' ? 'ROOT' : n.id.replace(/^N0*/, '#');
      nodesSvg += `<g class="node ${ch ? 'chosen' : 'unchosen'} ${here ? 'p-here' : ''} ${there ? 'q-here' : ''} ${endIds.has(n.id) ? 'end' : ''}" data-id="${esc(n.id)}" data-chosen="${ch}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button" aria-label="Node ${esc(n.id)} ${ch ? 'chosen' : 'unchosen'}">
        <circle r="${R}" class="disc"/>${ch ? '' : `<path d="M-6 -6 L6 6 M6 -6 L-6 6" class="x"/>`}
        ${here ? `<circle r="${R + 4}" class="ring" stroke="${c.player}"/>` : ''}${there ? `<circle r="${R + 8}" class="ring" stroke="${c.partner}" stroke-dasharray="3 3"/>` : ''}
        <text y="${R + 14}" class="lbl">${esc(label)}${n.outcomeId ? ' ' + n.outcomeId : ''}</text></g>`;
    }
    const nm = (a: 'player' | 'partner') => (a === 'player' ? (s.v2.playerIdentity === 'cyan' ? 'CYAN' : 'AMBER') : (s.v2.playerIdentity === 'cyan' ? 'AMBER' : 'CYAN'));
    this.host.innerHTML = `
      <div class="ar-bar">
        <div class="ar-title">CAUSAL ARCHIVE <small>${s.v2.ending === 'FADE' ? 'THE THREAD FADED' : 'THE TWO WORLDS MET'}</small></div>
        <div class="ar-legend"><span><i style="background:${c.player}"></i>YOU (${nm('player')})</span><span><i style="background:${c.partner}"></i>PARTNER (${nm('partner')})</span>
          <span><i class="sw solid"></i>chosen</span><span><i class="sw dash"></i>unchosen</span></div>
        <div class="ar-tools">
          <button data-a="zin" aria-label="Zoom in">+</button><button data-a="zout" aria-label="Zoom out">−</button>
          <button data-a="fit">FIT</button><button data-a="focus" aria-pressed="false">FOCUS MY PATH</button>
          <button data-a="close">BACK</button><button data-a="restart" class="primary">PLAY AGAIN</button>
        </div>
      </div>
      <div class="ar-body">
        <svg class="ar-svg" role="img" aria-label="Causal archive graph" touch-action="none">
          <g class="vp">${edges}${trails}${nodesSvg}</g>
        </svg>
        <aside class="ar-detail" id="ar-detail" aria-live="polite"></aside>
      </div>`;
    this.svg = this.host.querySelector('.ar-svg')!;
    this.vp = this.svg.querySelector('.vp')!;
    this.wire();
    this.fit();
    this.select('root');
    void b;
  }

  private wire(): void {
    const q = (a: string) => this.host.querySelector<HTMLButtonElement>(`[data-a=${a}]`)!;
    q('zin').onclick = () => this.zoomAt(1.3); q('zout').onclick = () => this.zoomAt(1 / 1.3);
    q('fit').onclick = () => { this.setFocus(false); this.fit(); };
    q('focus').onclick = () => this.setFocus(!this.focusing);
    q('close').onclick = () => this.h.close(); q('restart').onclick = () => this.h.restart();
    this.svg.addEventListener('wheel', e => {
      e.preventDefault(); const r = this.svg.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // drag-to-pan; a pointer that barely moved counts as a click on a node
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean; id: number } | null = null;
    const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
    this.svg.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return; }
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false, id: e.pointerId };
    });
    this.svg.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) { const r = this.svg.getBoundingClientRect(); this.zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
        pinch = d; return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true; this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; this.apply();
    });
    const end = (e: PointerEvent) => {
      pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved) { const g = (e.target as Element).closest?.('.node'); if (g) this.select(g.getAttribute('data-id')!); }
        drag = null;
      }
    };
    this.svg.addEventListener('pointerup', end); this.svg.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = null; });
    this.svg.addEventListener('keydown', e => { const g = (e.target as Element).closest?.('.node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.select(g.getAttribute('data-id')!); } });
  }

  private apply(): void { this.vp.setAttribute('transform', `translate(${this.view.x} ${this.view.y}) scale(${this.view.k})`); }

  private zoomAt(f: number, cx?: number, cy?: number): void {
    const r = this.svg.getBoundingClientRect(); cx ??= r.width / 2; cy ??= r.height / 2;
    const k = Math.min(3, Math.max(0.2, this.view.k * f)); const real = k / this.view.k;
    this.view.x = cx - (cx - this.view.x) * real; this.view.y = cy - (cy - this.view.y) * real; this.view.k = k; this.apply();
  }

  private fitTo(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.svg.getBoundingClientRect(); const w = r.width || 800, h = r.height || 500;
    const k = Math.min(1.6, Math.max(0.2, Math.min(w / (x1 - x0), h / (y1 - y0))));
    this.view = { k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k }; this.apply();
  }
  fit(): void { const b = this.bounds; this.fitTo(b.x0, b.y0, b.x1, b.y1); }

  private setFocus(on: boolean): void {
    this.focusing = on;
    this.svg.classList.toggle('focus-me', on);
    this.host.querySelector('[data-a=focus]')!.setAttribute('aria-pressed', String(on));
    this.svg.querySelectorAll('.node').forEach(n => n.classList.toggle('mine', this.myNodes.has(n.getAttribute('data-id')!)));
    if (on) {
      const ps = [...this.myNodes].map(id => this.pos.get(id)).filter(Boolean) as { x: number; y: number }[];
      if (ps.length) this.fitTo(Math.min(...ps.map(p => p.x)) - PAD, Math.min(...ps.map(p => p.y)) - PAD, Math.max(...ps.map(p => p.x)) + PAD, Math.max(...ps.map(p => p.y)) + PAD);
    } else this.fit();
  }

  select(id: string): void {
    const n = this.s.nodes[id]; if (!n) return;
    this.selected = id;
    this.svg.querySelectorAll('.node').forEach(g => g.classList.toggle('sel', g.getAttribute('data-id') === id));
    this.host.querySelector('#ar-detail')!.innerHTML = this.detail(n);
  }

  private detail(n: BranchNode): string {
    const s = this.s, c = this.colours();
    const ev: EventRecord | undefined = n.eventInstanceId ? s.events.find(e => e.eventInstanceId === n.eventInstanceId) : undefined;
    const t = ev ? TEMPLATES.find(q => q.id === ev.templateId) : undefined;
    const taken = this.taken().has(n.id);
    const outcome = t?.outcomes.find(o => o.id === n.outcomeId);
    const steps = s.v2.journey.filter(j => j.fromNodeId === n.id || j.toNodeId === n.id);
    const who = (a: string) => `<b style="color:${a === 'player' ? c.player : c.partner}">${a === 'player' ? 'YOU' : 'PARTNER'}</b>`;
    const row = (k: string, v: string) => `<div class="d-row"><b>${k}</b> ${v}</div>`;
    const stepHtml = (j: JourneyStep) => `<li>${who(j.actor)} #${j.seq} t${j.tick} ${esc(j.action)}${j.cause ? ` · ${esc(j.cause)}` : ''}${j.effect ? ` → ${esc(j.effect)}` : ''}</li>`;
    return `<div class="d-title">${n.id === 'root' ? 'ROOT: where the two threads began' : esc((t?.label ?? 'Branch').toUpperCase()) + ` · branch ${esc(n.outcomeId ?? '')}`}</div>
      ${row('STATUS', taken ? '<span class="tag on">CHOSEN</span>' : '<span class="tag off">NOT CHOSEN (unrealised)</span>')}
      ${ev ? row('EVENT', esc(t?.label ?? ev.templateId) + ` (${esc(ev.choice)}) by ${who(ev.actorId)}`) : ''}
      ${outcome ? row('OUTCOME', esc(outcome.text)) : ''}
      ${ev ? row('CAUSE', esc(ev.reason)) : ''}
      ${ev ? row(taken ? 'EFFECT' : 'WOULD HAVE', esc(fmt(outcome?.delta ?? ev.effects))) : ''}
      ${ev ? row('WHO PAID', esc(ev.paid)) : ''}
      ${ev ? row('AFTER', `drift ${Math.round(ev.driftAfter)} · strain ${Math.round(ev.strainAfter)}`) : ''}
      ${row('WORLD', `light ${n.world.light} · water ${n.world.water} · structure ${n.world.structure} · signal ${n.world.signal} · growth ${n.world.growth}`)}
      ${steps.length ? `<div class="d-row"><b>TRAIL</b></div><ul class="d-steps">${steps.map(stepHtml).join('')}</ul>` : ''}`;
  }
}
