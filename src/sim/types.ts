// SHARED CONTRACT (V3 causal model). No Phaser/DOM types here.
import type { Site } from '../world/topology';
export type { Site };

export type ActorId = 'player' | 'partner';
/** @deprecated V2 verbs. INTERACT.choice maps onto PhysicalAction (see engine.mapLegacyChoice). */
export type Choice = 'LET_GO' | 'SELF' | 'ECHO';
export type Goal = 'SURVIVE' | 'REACH_NEXT_SITE' | 'RESPOND_TO_CALL' | 'PREPARE_BEACON';
export type Intention = 'FIND_ME' | 'STAY_SAFE' | 'HELP_MY_WORLD'; // legacy: REQUEST_PARTNER now sends a CALL
export type WorldStat = 'light' | 'water' | 'structure' | 'signal' | 'growth';
export type AnchorId = 'LANTERN' | 'GREENHOUSE' | 'LIGHTHOUSE';
export type AnchorKind = 'HEAR' | 'FIND' | 'MEET';
export type PhysicalAction =
  | 'RELIGHT' | 'BRACE' | 'OPEN_SLUICE' | 'PROTECT' | 'HARVEST' | 'TUNE' | 'HOLD_SIGNAL' | 'OBSERVE' | 'BEACON'
  | 'GATHER' | 'REST' | 'DIVERT_WATER' | 'READ' | 'FOLLOW_ALTERNATE';
export type LinkState = 'CONNECTED' | 'FRAYING' | 'LAST_SIGNAL' | 'FADED';

export type Stats = Record<WorldStat, number> & { instability: number };
export type Delta = Partial<Record<keyof Stats, number>>;

export interface EventOutcome {
  id: 'A' | 'B'; text: string; delta: Delta; flags?: string[]; remove?: string[]; set?: Delta;
}
export interface EventTemplate {
  id: string; // lantern | bridge | radio | greenhouse | tide
  label: string;
  triggerObjectId: string;
  outcomes: [EventOutcome, EventOutcome];
}

/** Information only. Never matter, never an outcome. */
export interface ThreadMessage {
  from: ActorId; to: ActorId;
  kind: 'LOCATION' | 'WARNING' | 'TECHNIQUE' | 'CALL';
  site: Site; turn: number; clarity: number; // 0..1
  technique?: string;                         // TECHNIQUE only: 'open_sluice' | 'brace_bridge' | 'relight' | 'protect_garden'
  text?: string;
}

export interface EventRecord {
  eventInstanceId: string; // E0001...
  templateId: string;
  actorId: ActorId;
  parentNodeId: string;
  childNodeIds: [string, string]; // [A, B]
  activeChildNodeId: string;
  selectedOutcome: 'A' | 'B';     // == chosenOutcome
  choice: Choice;                 // @deprecated: always 'LET_GO' in V3
  effects: Delta;
  reason: string;                 // causal explanation (archive shows this)
  paid: string;                   // local cost, human readable
  driftAfter: number;
  strainAfter: number;
  turnNumber: number;
  // V3 required fork record
  sourceObject: string;
  priorState: string;
  playerAction: string;           // the actor's action (partner actions too)
  outcomeA: string;
  outcomeB: string;
  seededRoll: number;
  chosenOutcome: 'A' | 'B';
  localPhysicalEffect: string;
  evidenceShown: string;
  threadSignal?: string;
}

export interface BranchNode {
  id: string; // 'root' | 'N0001'...
  parentId: string | null;
  depth: number;
  eventInstanceId: string | null;
  outcomeId: 'A' | 'B' | null;
  world: Stats;
  flags: string[];
  visitState: 'POTENTIAL' | 'VISITED';
  children: string[];
  owner: ActorId;
}

export interface Inventory { fuel: number; plank: number }

export interface ActorState {
  id: ActorId; nodeId: string; x: number; y: number; stable: boolean;
  inventory: Inventory;
  taken: { wood: number; plank: number };   // pickups already used from the local piles
  // partner-only (undefined for the player)
  site?: Site;
  goal?: Goal;
  knowledge?: string[];     // techniques it can use: learned only from messages (or rare self-discovery)
  stuck?: number;           // consecutive partner ticks with no useful action
  crossed?: boolean;
  priority?: Site | null;   // a site the player told it about
  lastSeenMsg?: number;     // index into messages
  refusals?: number;
  plan?: string;            // partner: current plan key (plan changes emit a trace)
}

export interface AnchorState {
  id: AnchorId; kind: AnchorKind;
  playerReady: boolean; partnerReady: boolean; aligned: boolean;       // legacy names (WorldScene reads these)
  playerPhysical: boolean; partnerPhysical: boolean; coordinated: boolean; // contract names (always equal to the above)
}

export type Phase = 'BOOT' | 'EXPLORING' | 'FORK' | 'ARCHIVE' | 'ENDING' | 'FADE';

export interface LogEntry { turn: number; text: string; kind: 'event' | 'partner' | 'system' | 'hint'; uncertain?: boolean }

export interface ActorHistory {
  turn: number; actor: ActorId; nodeId: string; site: Site; action: string; outcome?: string; evidence?: string;
}

export interface SimulationState {
  version: 2;
  seed: number;
  turn: number;
  nodes: Record<string, BranchNode>;
  events: EventRecord[];
  player: ActorState;
  partner: ActorState;
  bondStrain: number;     // hidden
  realityDrift: number;   // hidden
  link: LinkState;
  messages: ThreadMessage[];
  history: ActorHistory[];
  anchors: AnchorState[];
  intention: Intention;   // legacy, unused
  phase: Phase;
  seenDialogueIds: string[];
  log: LogEntry[];
  occurrences: Record<string, number>;
  freeRetraceAvailable: boolean;
  pendingFork: null;      // legacy
  retraceCount: number;
  won: boolean;
  v2: V2State;
}

export type Identity = 'amber' | 'cyan';
export interface JourneyStep {
  seq: number;
  tick: number;
  actor: ActorId;
  fromNodeId: string;
  toNodeId: string;
  action: 'FORK' | 'ACT' | 'TRAVEL' | 'WAIT' | 'REFUSE' | 'LEARN' | 'RETRACE' | 'ANCHOR' | 'STABILISE' | 'REUNION';
  eventInstanceId?: string;
  cause?: string;
  effect?: string;
}
export type Ending = 'WIN' | 'FADE';
export interface V2State {
  tick: number;
  journey: JourneyStep[];       // never trimmed; includes EVERY partner action
  warningsIssued: number;       // 0..3 (FRAYING=1, LAST_SIGNAL=2, FADED=3)
  playerIdentity: Identity;
  examined: string[];
  realm: 'TOWN' | 'ALIEN';
  ending: Ending | null;
  gridX: number; gridY: number;
  calm?: number;                // temporary drift relief from resting at a safe site
  crossed: boolean;             // player has physically stood on the far bank
  dangerActions: number;        // meaningful actions taken while in danger
  dangerTicks: number;
  idleTicks: number;            // ticks since the last effective action
  ineffective: number;          // consecutive rejected / no-op interactions
  sig: string;                  // progress signature (idle detection)
  tuneMotif: ('A' | 'B')[];     // last radio outcomes (echo-stones easter egg)
  secretFound: boolean;
  learned: string[];            // techniques the player has learned (can be sent as TECHNIQUE)
  shared: string[];             // techniques already sent
  lastRecoveryTick: number;
  contact?: boolean;            // radio contact made (information; survives retrace)
}

export type Command =
  | { type: 'MOVE'; tx: number; ty: number }
  | { type: 'INTERACT'; objectId: string; action?: PhysicalAction; choice?: Choice /* deprecated alias */ }
  | { type: 'CALL'; kind?: ThreadMessage['kind']; technique?: string }
  | { type: 'SET_IDENTITY'; identity: Identity }
  | { type: 'BEGIN_FORK'; templateId: string }          // legacy: rejected
  | { type: 'CANCEL_FORK' }
  | { type: 'RESOLVE_FORK'; eventInstanceId: string; choice: Choice } // legacy: rejected
  | { type: 'REQUEST_PARTNER'; intention: Intention }   // legacy: same as CALL
  | { type: 'ADVANCE_PARTNER' }                         // let time pass (waiting)
  | { type: 'RETRACE'; targetNodeId: string }
  | { type: 'REST_AT_TERMINAL' }                        // legacy: use INTERACT thread_terminal
  | { type: 'ACTIVATE_ANCHOR'; anchorId: AnchorId; actor: ActorId } // legacy: interact anchor_*
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_POSITION'; x: number; y: number }
  | { type: 'MARK_SEEN'; dialogueId: string }
  | { type: 'RESTART'; seed: number };

export type VoiceCue =
  | 'boot' | 'find' | 'safe' | 'help' | 'echo_received' | 'divergence' | 'overstrain' | 'anchor' | 'final'
  | 'clear' | 'distant' | 'refusal';

export type DomainEvent =
  | { type: 'FORK_RESOLVED'; record: EventRecord }
  | { type: 'PARTNER_ACTED'; goal: Goal; text: string }
  | { type: 'VOICE'; cue: VoiceCue; text: string }
  | { type: 'RETRACED'; nodeId: string }
  | { type: 'ANCHOR_ALIGNED'; anchorId: AnchorId }
  | { type: 'STRAIN_RECOVERED' }
  | { type: 'WIN' }
  | { type: 'FADE' }
  | { type: 'WARNING'; level: 1 | 2 | 3; text: string }
  | { type: 'WORLD_CHANGED'; objectId: string; text: string }
  | { type: 'PARTNER_TRACE'; text: string; objectId?: string }
  | { type: 'REALM'; realm: 'TOWN' | 'ALIEN' }
  | { type: 'REJECTED'; reason: string };
