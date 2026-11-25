// SHARED CONTRACT between the forest2 SIM (src/game/forest2/sim.ts, rooms.ts) and the iso VIEW (src/game/scenes/ForestScene.ts, src/game/forest2/view/*).
// Owned by the coordinator. The pure sim has no Phaser/DOM/wall-clock; same (room, order, seed, inputs) => identical results.
export type Layer = 'PAST' | 'FUTURE';
export type Order = 'PAST_FIRST' | 'FUTURE_FIRST';
export type Dir = 'N' | 'E' | 'S' | 'W';            // N = y-1, S = y+1, E = x+1, W = x-1
export type RoomId = 1 | 2 | 3;
export interface Pt { x: number; y: number }

export type TileKind =
  | 'FLOOR' | 'ROCK' | 'GAP' | 'BEACON' | 'CONDUIT_P' | 'CONDUIT_F'
  | 'SOIL' | 'ROOTED' | 'VINE' | 'BARK' | 'SAP_WELL' | 'ROOT_PLATE'          // past-side
  | 'DUST' | 'RUIN' | 'CONDUIT_PLATE' | 'RIFT';                              // future-side

export type Input =
  | { t: 'MOVE'; dir: Dir }
  | { t: 'A' }
  | { t: 'B' }
  | { t: 'END_LOOP' };

export type Carry = 'NONE' | 'SAP' | 'CHARGE';

export interface TileView {
  kind: TileKind;
  pinned?: boolean;            // Blueprint Pin present (future-first promise); shown as a Target Ring in the Past
  crate?: boolean;             // loose crate standing on this tile (future layer)
  lit?: boolean;               // task tile already used (root plate powered / conduit plate discharged)
  weathering?: boolean;        // (peek) this VINE tile will turn to DUST in the future
}

export interface ActorView { pos: Pt; carry: Carry; facing: Dir; onConduit: boolean }

export type SfxHint = 'step' | 'plant' | 'pulse' | 'sap' | 'coat' | 'root' | 'charge' | 'discharge' | 'pin' | 'push' | 'rift' | 'sync' | 'strain' | 'paradox' | 'ignite' | 'lock';

export interface ViewEvent {
  kind: 'MOVED' | 'BLOCKED' | 'PLANTED' | 'PULSED' | 'VINE_GREW' | 'SAP_TAKEN' | 'COATED' | 'ROOT_LIT' | 'CHARGE_TAKEN' | 'CHARGE_LIT' | 'PIN_DROPPED'
      | 'CRATE_PUSHED' | 'RIFT_SENT' | 'SAP_ARRIVED' | 'SYNC_BOOST' | 'STRAINED' | 'RELAXED' | 'IGNITION' | 'PARADOX' | 'PHASE_DONE' | 'NOTHING' | 'BUDGET_OUT';
  at?: Pt; beat: number; text?: string; sfx?: SfxHint;
}

export interface Sockets { root: boolean; charge: boolean; ignition: boolean }

export interface ScoreView { total: number; base: number; efficiency: number; symbiosis: number; multiplier: number }

export type StageStatus = 'PLAYING' | 'PHASE1_DONE' | 'CLEARED' | 'FAILED';
export type FailReason = 'BUDGET' | 'PARADOX' | 'NO_IGNITION';

export interface StageView {
  room: { id: RoomId; w: number; h: number; name: string };
  order: Order;
  phase: 1 | 2;
  /** Which shroom the player controls NOW: PAST = Sam (blue builder), FUTURE = Jensen (red scout). */
  role: Layer;
  status: StageStatus;
  failReason?: FailReason; failText?: string;
  beat: number; budget: number;                    // beats used / budget in the CURRENT phase
  map: TileView[][];                                // [y][x] the layer the player is on right now (current state)
  other: TileView[][];                              // [y][x] the other layer (Peek overlay): predicted/baseline/real depending on phase
  me: ActorView;
  ghost: (ActorView & { path: Pt[]; beatIndex: number }) | null;   // phase 2 only; path = position at each beat of the recording
  sockets: Sockets;
  tether: { dist: number; strained: boolean; adjacent: boolean } | null;
  pins: Pt[];
  syncBoostUsed: boolean;
  score: ScoreView;
  /** Context for the A / B / C icons (short caps labels, e.g. 'PLANT', 'COAT', 'TAKE SAP', 'ABSORB', 'DISCHARGE', 'PUSH'); '' = nothing useful here. */
  hints: { a: string; b: string };
  /** Events produced by the LAST input (for FX / sfx / captions). Cleared on the next input. */
  events: ViewEvent[];
  /** True when the attempt can no longer be won given recorded state (e.g. paradox). */
  doomed: boolean;
}

export interface StageOptions { relaxed: boolean }

/** One stage attempt. Implemented in sim.ts by createStage(). */
export interface Stage {
  view(): StageView;
  /** Apply one player input. Never throws; illegal inputs return events with kind BLOCKED/NOTHING and cost 0 beats unless stated in the spec. */
  input(i: Input): StageView;
  /** Free: restart the CURRENT phase from its beginning (phase 2 keeps the phase-1 recording). */
  resetPhase(): StageView;
  /** Called by the scene after the Time-Lock animation when status === 'PHASE1_DONE'. */
  beginPhase2(): StageView;
  /** Recorded inputs per phase (for replay tests / debugging). */
  recording(): { phase1: Input[]; phase2: Input[] };
}

export interface RoomInfo { id: RoomId; name: string; w: number; h: number; budget: number }
