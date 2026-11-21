import type { SimulationState, Delta, BranchNode, EventTemplate, Choice } from '../sim/types';
import { TEMPLATES, previewFork } from '../sim/engine';
import { outcomeFor } from '../sim/events';
import { esc } from './dom';

export const tpl = (id: string): EventTemplate | undefined => TEMPLATES.find(t => t.id === id);

export function fmtDelta(d: Delta | undefined): string {
  const e = Object.entries(d ?? {}).filter(([, v]) => v);
  return e.length ? e.map(([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`).join(', ') : 'no change';
}

export interface PanelHandlers {
  forkChoice(c: Choice): void;
  cancelFork(): void;
  retraceTo(id: string): void;
  select(id: string): void;
  closeArchive(): void;
}

// ---------- fork panel ----------
export function renderFork(el: HTMLElement, s: Readonly<SimulationState>, h: PanelHandlers): void {
  const pf = s.pendingFork;
  if (s.phase !== 'FORK' || !pf) { el.classList.remove('open'); el.innerHTML = ''; el.dataset.key = ''; return; }
  if (el.dataset.key === pf.eventInstanceId) return; // keep buttons stable while open
  el.dataset.key = pf.eventInstanceId;
  const t = tpl(pf.templateId);
  const p = previewFork(s, pf.templateId);
  const out = (o: typeof p.A, key: 'A' | 'B') => `
    <div class="outcome ${key === p.selfPreferred ? 'pref' : ''}">
      <div class="o-h">POSSIBLE BRANCH ${key}${key === p.selfPreferred ? ' · better for you' : ' · better for partner'}</div>
      <div class="o-t">${esc(o.text)}</div>
      <div class="o-d">${esc(fmtDelta(o.delta))}</div>
    </div>`;
  const other = p.selfPreferred === 'A' ? 'B' : 'A';
  el.classList.add('open');
  el.innerHTML = `
    <div class="card" role="dialog" aria-modal="true" aria-label="Fork">
      <div class="card-h">${esc((t?.label ?? pf.templateId).toUpperCase())} · UNRESOLVED</div>
      <div class="haze" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="outcomes">${out(p.A, 'A')}${out(p.B, 'B')}</div>
      <div class="choices">
        <button data-c="LET_GO" class="ch"><b>LET GO</b><span>Let it resolve by chance. No Thread cost.</span></button>
        <button data-c="SELF" class="ch self"><b>SELF</b><span>Take branch ${p.selfPreferred} (${esc(fmtDelta(p[p.selfPreferred].delta))}). Thread strain +2. Partner unaffected.</span></button>
        <button data-c="ECHO" class="ch echo"><b>ECHO</b><span>Accept branch ${other} (${esc(fmtDelta(p[other as 'A' | 'B'].delta))}). Strain +12. Partner gets one echo credit.</span></button>
      </div>
      <button class="cancel" data-c="CANCEL">BACK AWAY (Esc)</button>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach(b => b.onclick = () => {
    const c = b.dataset.c!; if (c === 'CANCEL') h.cancelFork(); else h.forkChoice(c as Choice);
  });
  (el.querySelector('button.ch') as HTMLButtonElement | null)?.focus();
}

// ---------- archive ----------
export function ancestors(s: Readonly<SimulationState>, id: string): string[] {
  const out: string[] = []; let n: BranchNode | undefined = s.nodes[id];
  while (n && n.parentId) { out.push(n.parentId); n = s.nodes[n.parentId]; }
  return out;
}

export function renderArchive(el: HTMLElement, s: Readonly<SimulationState>, sel: string, h: PanelHandlers): void {
  if (s.phase !== 'ARCHIVE') { el.classList.remove('open'); return; }
  el.classList.add('open');
  const prevScroll = el.querySelector('.a-tree')?.scrollTop ?? 0;
  const anc = new Set(ancestors(s, s.player.nodeId));
  const rows: string[] = [];
  const walk = (id: string, depth: number) => {
    const n = s.nodes[id]; if (!n) return;
    const ev = s.events.find(e => e.eventInstanceId === n.eventInstanceId);
    const t = ev ? tpl(ev.templateId) : undefined;
    const parentVisited = n.parentId ? s.nodes[n.parentId]?.visitState === 'VISITED' : true;
    const st = id === s.player.nodeId ? 'CURRENT' : n.visitState === 'VISITED' ? 'VISITED' : parentVisited ? 'AVAILABLE' : 'UNVISITED';
    const marks = `${id === s.player.nodeId ? '<em class="you">YOU</em>' : ''}${id === s.partner.nodeId ? '<em class="ptn">PARTNER</em>' : ''}`;
    rows.push(`<button class="node st-${st.toLowerCase()} out-${n.outcomeId ?? 'R'} ${id === sel ? 'sel' : ''}" data-id="${esc(id)}" style="--d:${depth}">
      <span class="tw">${depth ? '└' : '◉'}</span><span class="ic">${esc((t?.label ?? 'Root').replace(/^The /, '').slice(0, 1))}</span>
      <span class="nid">${esc(id)}</span><span class="nl">${esc(t?.label ?? 'Start')}${n.outcomeId ? ' · ' + n.outcomeId : ''}</span>${marks}<span class="chip">${st}</span></button>`);
    n.children.forEach(c => walk(c, depth + 1));
  };
  walk('root', 0);

  const n = s.nodes[sel] ?? s.nodes[s.player.nodeId];
  const ev = s.events.find(e => e.eventInstanceId === n.eventInstanceId);
  const t = ev ? tpl(ev.templateId) : undefined;
  const pw = n.parentId ? s.nodes[n.parentId]?.world : undefined;
  const oc = t && n.outcomeId ? (pw ? outcomeFor(t, n.outcomeId, pw) : t.outcomes.find(o => o.id === n.outcomeId)) : undefined;
  let detail: string;
  if (!ev) detail = `<div class="d-row"><b>BRANCH 000</b> Where the two signatures first connected.</div>`;
  else {
    const taken = ev.activeChildNodeId === n.id;
    detail = `
      <div class="d-row"><b>EVENT</b> ${esc(t?.label ?? ev.templateId)} (turn ${ev.turnNumber}, ${esc(ev.eventInstanceId)})</div>
      <div class="d-row"><b>OUTCOME</b> ${esc(oc?.text ?? n.outcomeId ?? '')} ${taken ? '' : '<i>(not taken: this branch stayed unobserved)</i>'}</div>
      <div class="d-row"><b>WHY</b> ${taken ? esc(ev.reason) : 'The other outcome was the one that resolved.'}</div>
      <div class="d-row"><b>WORLD DELTA</b> ${esc(fmtDelta(oc?.delta))}</div>
      <div class="d-row"><b>WHO PAID</b> ${taken ? esc(ev.paid) : 'Nobody: this branch was never lived.'}</div>
      <div class="d-row"><b>AFTER</b> ${taken ? `drift ${ev.driftAfter} · strain ${ev.strainAfter}` : 'n/a'}</div>
      <div class="d-row"><b>CHOICE</b> ${esc(ev.choice)}</div>`;
  }
  const canRetrace = anc.has(n.id) && n.visitState === 'VISITED';
  const why = n.id === s.player.nodeId ? 'You are here.' : canRetrace ? (s.freeRetraceAvailable ? 'Free retrace available. History is kept.' : 'Costs a little bond strain. History is kept.') : 'Only visited ancestors of your branch.';
  el.innerHTML = `
    <div class="a-head"><b>BRANCH_ARCHIVE</b> <span class="a-note">${s.nodes && Object.keys(s.nodes).length} nodes</span>
      <span class="unc">UNCONFIRMED SIGNAL</span><button class="a-back" data-act="back">BACK (Esc)</button></div>
    <div class="a-body">
      <div class="a-tree">${rows.join('')}</div>
      <div class="a-detail">
        <div class="d-title">${esc(n.id)} · ${esc(n.visitState)}</div>${detail}
        <div class="d-actions"><button class="retrace" data-act="retrace" ${canRetrace ? '' : 'disabled'}>RETRACE (R)</button><span class="d-why">${esc(why)}</span></div>
      </div>
    </div>`;
  const tree = el.querySelector('.a-tree'); if (tree) tree.scrollTop = prevScroll;
  el.querySelectorAll<HTMLButtonElement>('.node').forEach(b => b.onclick = () => h.select(b.dataset.id!));
  (el.querySelector('[data-act=back]') as HTMLButtonElement).onclick = () => h.closeArchive();
  (el.querySelector('[data-act=retrace]') as HTMLButtonElement).onclick = () => { if (canRetrace) h.retraceTo(n.id); };
}
