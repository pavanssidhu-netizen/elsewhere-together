import type { BranchNode } from './types';

type Nodes = Record<string, BranchNode>;

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

export function isOnPath(nodes: Nodes, id: string, target: string): boolean { return pathTo(nodes, target).includes(id); }
