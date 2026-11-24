// Seeded puzzle configuration (Director's Cut). Pure data: the RULES never change, only the starting facts.
// A candidate is only used after src/sim/verify.ts has shown the planner can win it as BOTH characters.
import type { PuzzleConfig, WorldStart } from './types';
import { hash32, mulberry32 } from './rng';

type Rng = () => number;
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];

const BASE: WorldStart = { bridgeBroken: true, waterHigh: true, smokeRoad: false, dryBrush: false, fire: false, woodTaken: 0, plankTaken: 0 };
const w = (o: Partial<WorldStart>): WorldStart => ({ ...BASE, ...o });

export const TEMPLATE_IDS = ['BROKEN_SPAN', 'LOW_RIVER', 'EMBERS', 'STUCK_GATE', 'FAR_SHORE', 'DRY_SUMMER'] as const;
type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Starting facts per template. `past` and `future` are the two worlds; who plays which depends on the character. */
function build(t: TemplateId, r: Rng): Pick<PuzzleConfig, 'past' | 'future' | 'sluiceStuck' | 'layout'> {
  const layouts = ['A', 'B', 'C', 'D'] as const;
  const lay = pick(r, layouts);
  const wood = r() < 0.35 ? 1 : 0;
  switch (t) {
    case 'BROKEN_SPAN': // the classic: a broken span and a high river in both worlds, planks only in the past
      return { layout: lay, sluiceStuck: false, past: w({ woodTaken: wood }), future: w({ plankTaken: 3, woodTaken: wood }) };
    case 'LOW_RIVER': // the river is already low in the past (ford open, no planks); the future has planks but a flooded ford
      return { layout: lay, sluiceStuck: false, past: w({ waterHigh: false, plankTaken: 3, woodTaken: wood }), future: w({ woodTaken: wood }) };
    case 'EMBERS': // smoke over the road in the past; in the future the brush is already burning and the set is smoky
      return { layout: lay === 'A' ? 'B' : lay, sluiceStuck: false, past: w({ smokeRoad: true, dryBrush: true }), future: w({ fire: true, dryBrush: true, plankTaken: r() < 0.5 ? 3 : 0 }) };
    case 'STUCK_GATE': // the sluice is pinned until the wheel has been looked at; fuel is scarce
      return { layout: lay, sluiceStuck: true, past: w({ woodTaken: 1 }), future: w({ woodTaken: 2, plankTaken: r() < 0.5 ? 3 : 0 }) };
    case 'FAR_SHORE': // everything is far apart
      return { layout: r() < 0.5 ? 'C' : 'D', sluiceStuck: false, past: w({ woodTaken: wood }), future: w({ plankTaken: 3, woodTaken: wood }) };
    case 'DRY_SUMMER': // the brush is dry on both sides: a lit beacon may start a fire
      return { layout: lay, sluiceStuck: false, past: w({ dryBrush: true, woodTaken: wood }), future: w({ dryBrush: true, smokeRoad: r() < 0.5, plankTaken: r() < 0.5 ? 3 : 0 }) };
  }
}

export function configSig(c: Omit<PuzzleConfig, 'sig'>): string {
  const f = (x: WorldStart) => [x.bridgeBroken, x.waterHigh, x.smokeRoad, x.dryBrush, x.fire].map(b => (b ? 1 : 0)).join('') + x.woodTaken + x.plankTaken;
  return `${c.template}|${c.character[0]}|${c.layout}|${f(c.past)}|${f(c.future)}|${c.sluiceStuck ? 'S' : '-'}|${c.partnerClue}`;
}

/** The `attempt`-th candidate for a seed. attempt 0 is the natural choice; later attempts are the deterministic resamples. */
export function candidateConfig(seed: number, attempt: number, character: 'SAM' | 'JENSEN'): PuzzleConfig {
  const r = mulberry32(hash32(seed, 'puzzle', attempt));
  const template = pick(r, TEMPLATE_IDS);
  const b = build(template, r);
  const partnerClue = pick(r, ['none', 'bridge', 'sluice', 'garden'] as const);
  const c = { template, character, ...b, partnerClue };
  return { ...c, sig: configSig(c) };
}

/** Knowledge the autonomous brother starts with. */
export function partnerKnowledge(c: PuzzleConfig | undefined): string[] {
  const base = ['relight', 'brace_bridge', 'protect_garden'];
  if (!c) return base;
  if (c.partnerClue === 'sluice') return [...base, 'open_sluice'];
  if (c.partnerClue === 'garden') return [...base, 'caution'];
  return base;
}

/** Node flags + water level of one world from its starting facts. */
export function startWorld(st: WorldStart, layout: PuzzleConfig['layout']): { flags: string[]; water: number } {
  const flags = ['WHEEL_TURNING'];
  if (st.bridgeBroken) flags.push('BRIDGE_CLOSED');
  if (st.smokeRoad || st.fire) flags.push('SMOKE');
  if (st.dryBrush || st.fire) flags.push('DRY');
  if (st.fire) flags.push('FIRE_SPREAD', 'RADIO_SMOKE');
  if (layout !== 'A') flags.push('LAYOUT_' + layout);
  return { flags, water: st.waterHigh ? 2 : 1 };
}
