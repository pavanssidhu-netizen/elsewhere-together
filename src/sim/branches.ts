import type { BranchNode, SimulationState, WorldStat } from './types';

type Nodes = Record<string, BranchNode>;
const STATS: WorldStat[] = ['light', 'water', 'structure', 'signal', 'growth'];

/** root..id inclusive. */
export function pathTo(nodes: Nodes, id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur) { out.push(cur); cur = nodes[cur].parentId; }
  return out.reverse();
}

export function lca(nodes: Nodes, a: string, b: string): string {
  const pa = pathTo(nodes, a);
  const pb = pathTo(nodes, b);
  let r = pa[0];
  for (let i = 0; i < Math.min(pa.length, pb.length) && pa[i] === pb[i]; i++) r = pa[i];
  return r;
}

export function lineageDistance(nodes: Nodes, a: string, b: string): number {
  return nodes[a].depth + nodes[b].depth - 2 * nodes[lca(nodes, a, b)].depth;
}

export function stateDifference(nodes: Nodes, a: string, b: string): number {
  return STATS.reduce((s, k) => s + Math.abs(nodes[a].world[k] - nodes[b].world[k]), 0);
}

export function calculateDrift(s: Pick<SimulationState, 'nodes' | 'player' | 'partner' | 'anchors'>): number {
  const aligned = s.anchors.filter(a => a.aligned).length;
  const d = 8 * lineageDistance(s.nodes, s.player.nodeId, s.partner.nodeId)
    + 3 * stateDifference(s.nodes, s.player.nodeId, s.partner.nodeId)
    - 12 * aligned;
  return Math.max(0, Math.min(100, d));
}

/** One step from `from` toward `to` along the tree (up to parent, or down to the child on to's path). */
export function stepToward(nodes: Nodes, from: string, to: string): string {
  if (from === to) return from;
  const toPath = pathTo(nodes, to);
  const idx = toPath.indexOf(from);
  if (idx >= 0) return toPath[idx + 1];
  return nodes[from].parentId ?? from;
}

/** Nodes the actor may retrace to: any ancestor, or an unchosen sibling hanging off its path (excluding current). */
export function retraceTargets(nodes: Nodes, nodeId: string): string[] {
  const path = pathTo(nodes, nodeId);
  const out = new Set<string>();
  for (const id of path) {
    if (id !== nodeId) out.add(id);
    for (const c of nodes[id].children) if (c !== nodeId && !path.includes(c)) out.add(c);
  }
  return [...out];
}

export function isValidRetrace(nodes: Nodes, from: string, target: string): boolean {
  return !!nodes[target] && retraceTargets(nodes, from).includes(target);
}
