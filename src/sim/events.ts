import type { Delta, EventOutcome, EventTemplate, SimulationState, Stats, WorldStat } from './types';
import { eventRoll } from './rng';

export const WORLD_STATS: WorldStat[] = ['light', 'water', 'structure', 'signal', 'growth'];

export const TEMPLATES: EventTemplate[] = [
  {
    id: 'lantern', label: 'The Lantern', triggerObjectId: 'lantern',
    selfPreferredOutcome: 'A', echoKind: 'signal',
    outcomes: [
      { id: 'A', text: 'The lamp survives the wind. Light and signal rise.', delta: { light: 1, signal: 1 }, flags: ['LANTERN_LIT'] },
      { id: 'B', text: 'The lamp breaks. The square goes dark.', delta: { light: -1, instability: 12 }, flags: ['LANTERN_BROKEN'] },
    ],
  },
  {
    id: 'bridge', label: 'The Bridge', triggerObjectId: 'bridge',
    selfPreferredOutcome: 'A', echoKind: 'structure',
    outcomes: [
      { id: 'A', text: 'The crossing holds. The route opens.', delta: { structure: 1 }, flags: ['BRIDGE_OPEN'] },
      { id: 'B', text: 'The crossing collapses. The route closes.', delta: { structure: -1, water: 1 }, flags: ['BRIDGE_CLOSED'] },
    ],
  },
  {
    id: 'radio', label: 'The Radio Tower', triggerObjectId: 'radio',
    selfPreferredOutcome: 'A', echoKind: 'signal',
    outcomes: [
      { id: 'A', text: 'The message arrives. Signal rises.', delta: { signal: 1 }, flags: ['RADIO_RECEIVED'] },
      { id: 'B', text: 'The message is lost in static.', delta: { signal: -1, instability: 8 }, flags: ['RADIO_LOST'] },
    ],
  },
  {
    id: 'greenhouse', label: 'The Greenhouse', triggerObjectId: 'greenhouse',
    selfPreferredOutcome: 'A', echoKind: 'growth',
    outcomes: [
      { id: 'A', text: 'The seedbed germinates. Growth rises, water falls.', delta: { growth: 1, water: -1 }, flags: ['GREENHOUSE_STABLE'] },
      { id: 'B', text: 'The seedbed withers. Growth falls, water pools.', delta: { growth: -1, water: 1 }, flags: ['GREENHOUSE_WITHERED'] },
    ],
  },
  {
    id: 'tide', label: 'The Tide', triggerObjectId: 'tide',
    selfPreferredOutcome: 'A', echoKind: 'water',
    outcomes: [
      { id: 'A', text: 'The surge recedes. The coast path opens.', delta: { water: -1 }, flags: ['COAST_OPEN'] },
      { id: 'B', text: 'The surge rises. The coast path closes.', delta: { water: 1 }, flags: ['COAST_CLOSED'] },
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, EventTemplate> = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

export function opposite(o: 'A' | 'B'): 'A' | 'B' { return o === 'A' ? 'B' : 'A'; }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Chance that LET GO resolves to outcome A, from the world it happens in (0.15..0.85). */
export function weightA(templateId: string, w: Stats): number {
  let p: number;
  switch (templateId) {
    case 'lantern': p = 0.5 + 0.05 * (w.structure - 1) - 0.1 * (w.water >= 2 ? 1 : 0); break;
    case 'bridge': p = 0.7 - 0.15 * w.water + 0.05 * w.structure; break;
    case 'radio': p = 0.35 + 0.15 * w.signal; break;
    case 'greenhouse': p = 0.3 + 0.15 * w.light - 0.05 * w.water; break;
    case 'tide': p = 0.6 - 0.1 * w.water; break;
    default: p = 0.5;
  }
  return clamp(p, 0.15, 0.85);
}

/** State-dependent text and consequences. Falls back to the template's own text. */
export function adaptOutcome(t: EventTemplate, id: 'A' | 'B', w: Stats): EventOutcome {
  const base = t.outcomes[id === 'A' ? 0 : 1];
  const out: EventOutcome = { id, text: base.text, delta: { ...base.delta }, flags: base.flags ? [...base.flags] : undefined };
  switch (t.id + id) {
    case 'lanternA':
      if (w.signal >= 2) out.text = 'The lamp holds, and its beam carries far down the strong signal.';
      else if (w.light <= 0) out.text = 'In the dark, the lamp flickers back. Light and signal rise.';
      break;
    case 'lanternB':
      if (w.water >= 2) { out.text = 'Rain-soaked glass bursts. The square goes dark and hissing.'; out.delta.instability = 16; }
      break;
    case 'bridgeA':
      if (w.water >= 2) out.text = 'The swollen river tugs at it, but the crossing holds.';
      break;
    case 'bridgeB':
      if (w.water >= 2) { out.text = 'The swollen river takes the crossing whole. The route closes.'; out.delta.instability = 10; }
      break;
    case 'radioA':
      if (w.signal <= 1) out.text = 'Through the static, the message resolves. Signal rises.';
      break;
    case 'radioB':
      if (w.signal <= 0) out.text = 'Nothing but noise. The line goes quiet.';
      break;
    case 'greenhouseA':
      if (w.water <= 0) out.text = 'The seedbed germinates on the last of the water. Growth rises.';
      break;
    case 'greenhouseB':
      if (w.water >= 2) out.text = 'Waterlogged, the seedbed withers. Growth falls.';
      break;
    case 'tideA':
      if (w.water >= 2) out.text = 'The heavy surge finally recedes. The coast path opens.';
      break;
    case 'tideB':
      if (w.structure <= 0) { out.text = 'The surge rises and finds no walls. The coast path closes.'; out.delta.instability = 6; }
      break;
  }
  return out;
}

export function outcomeFor(t: EventTemplate, id: 'A' | 'B', w: Stats): EventOutcome { return adaptOutcome(t, id, w); }

/** Deterministic default (LET GO) outcome for a world, template and occurrence index. */
export function defaultOutcomeFor(seed: number, nodeId: string, t: EventTemplate, w: Stats, occurrence: number): 'A' | 'B' {
  return eventRoll(seed, nodeId, t.id, occurrence) < weightA(t.id, w) ? 'A' : 'B';
}

export function previewFork(state: Readonly<SimulationState>, templateId: string):
  { A: EventOutcome; B: EventOutcome; selfPreferred: 'A' | 'B'; defaultOutcome: 'A' | 'B' } {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) throw new Error('unknown template ' + templateId);
  const node = state.nodes[state.player.nodeId];
  const w = node.world;
  return {
    A: adaptOutcome(t, 'A', w),
    B: adaptOutcome(t, 'B', w),
    selfPreferred: t.selfPreferredOutcome,
    defaultOutcome: defaultOutcomeFor(state.seed, node.id, t, w, state.occurrences[t.id] ?? 0),
  };
}

export function applyDelta(w: Stats, d: Delta): Stats {
  const n: Stats = { ...w };
  for (const k of Object.keys(d) as Array<keyof Stats>) {
    const v = n[k] + (d[k] ?? 0);
    n[k] = k === 'instability' ? clamp(v, 0, 100) : clamp(v, 0, 3);
  }
  return n;
}

export function mergeFlags(parent: string[], add: string[] | undefined): string[] {
  if (!add) return [...parent];
  const groups = new Set(add.map(f => f.split('_')[0]));
  return [...parent.filter(f => !groups.has(f.split('_')[0])), ...add];
}

export function deltaText(d: Delta): string {
  const parts = (Object.keys(d) as Array<keyof Stats>).filter(k => d[k]).map(k => `${k} ${d[k]! > 0 ? '+' : ''}${d[k]}`);
  return parts.length ? parts.join(', ') : 'no change';
}
