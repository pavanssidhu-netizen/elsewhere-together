// SHARED CONTRACT. Do not edit without lead approval. No Phaser/DOM types here.
export type ActorId = 'player' | 'partner';
export type Choice = 'LET_GO' | 'SELF' | 'ECHO';
export type Goal = 'SEEK' | 'STABILISE' | 'ASSIST' | 'ANCHOR';
export type Intention = 'FIND_ME' | 'STAY_SAFE' | 'HELP_MY_WORLD';
export type WorldStat = 'light' | 'water' | 'structure' | 'signal' | 'growth';
export type EchoKind = 'signal' | 'structure' | 'water' | 'growth';
export type AnchorId = 'LANTERN' | 'GREENHOUSE' | 'LIGHTHOUSE';

export type Stats = Record<WorldStat, number> & { instability: number };
export type Delta = Partial<Record<keyof Stats, number>>;

export interface EventOutcome { id: 'A' | 'B'; text: string; delta: Delta; flags?: string[] }
export interface EventTemplate {
  id: string; // lantern | bridge | radio | greenhouse | tide
  label: string;
  triggerObjectId: string;
  requires?: Partial<Record<WorldStat, { min?: number; max?: number }>>;
  outcomes: [EventOutcome, EventOutcome];
  selfPreferredOutcome: 'A' | 'B';
  echoKind: EchoKind;
}

export interface EventRecord {
  eventInstanceId: string; // E0001...
  templateId: string;
  actorId: ActorId;
  parentNodeId: string;
  childNodeIds: [string, string]; // [A, B]
  activeChildNodeId: string;
  selectedOutcome: 'A' | 'B';
  choice: Choice;
  effects: Delta;
  echoId?: string;
  reason: string; // human readable causal explanation (archive shows this)
  paid: string;   // who paid / what was sacrificed, human readable
  driftAfter: number;
  strainAfter: number;
  turnNumber: number;
}

export interface BranchNode {
  id: string; // 'root' | 'N0001'...
  parentId: string | null;
  depth: number;
  eventInstanceId: string | null; // event that created this node
  outcomeId: 'A' | 'B' | null;
  world: Stats;
  flags: string[]; // BRIDGE_OPEN, BRIDGE_CLOSED, COAST_OPEN, ...
  visitState: 'POTENTIAL' | 'VISITED';
  children: string[];
  owner: ActorId; // whose lineage created it
}

export interface EchoCredit {
  id: string; from: ActorId; to: ActorId; kind: EchoKind;
  strength: 1; createdTurn: number; consumed: boolean;
}

export interface ActorState {
  id: ActorId; nodeId: string; x: number; y: number; stable: boolean; lastGoal?: Goal;
}

export interface AnchorState {
  id: AnchorId; playerReady: boolean; partnerReady: boolean; aligned: boolean;
}

export type Phase = 'BOOT' | 'EXPLORING' | 'FORK' | 'ARCHIVE' | 'ENDING';

export interface LogEntry { turn: number; text: string; kind: 'event' | 'partner' | 'system' | 'hint'; uncertain?: boolean }

export interface SimulationState {
  version: 1;
  seed: number;
  turn: number;
  nodes: Record<string, BranchNode>;
  events: EventRecord[];
  player: ActorState;
  partner: ActorState;
  bondStrain: number;
  realityDrift: number;
  echoCredits: EchoCredit[];
  anchors: AnchorState[];
  intention: Intention;
  phase: Phase;
  seenDialogueIds: string[];
  log: LogEntry[];
  occurrences: Record<string, number>; // templateId -> times used
  freeRetraceAvailable: boolean;
  pendingFork: { eventInstanceId: string; templateId: string } | null;
  retraceCount: number;
  won: boolean;
}

export type Command =
  | { type: 'BEGIN_FORK'; templateId: string }          // player interacted with object; phase -> FORK
  | { type: 'CANCEL_FORK' }
  | { type: 'RESOLVE_FORK'; eventInstanceId: string; choice: Choice }
  | { type: 'REQUEST_PARTNER'; intention: Intention }
  | { type: 'ADVANCE_PARTNER' }
  | { type: 'RETRACE'; targetNodeId: string }
  | { type: 'REST_AT_TERMINAL' }
  | { type: 'ACTIVATE_ANCHOR'; anchorId: AnchorId; actor: ActorId }
  | { type: 'SET_PHASE'; phase: Phase }                 // ARCHIVE open/close
  | { type: 'SET_POSITION'; x: number; y: number }
  | { type: 'MARK_SEEN'; dialogueId: string }
  | { type: 'RESTART'; seed: number };

// Emitted by engine; UI/audio/game subscribe. Voice cue ids match public/assets/audio/voice_<id>.mp3
export type DomainEvent =
  | { type: 'FORK_RESOLVED'; record: EventRecord }
  | { type: 'PARTNER_ACTED'; goal: Goal; text: string }
  | { type: 'VOICE'; cue: VoiceCue; text: string }
  | { type: 'RETRACED'; nodeId: string }
  | { type: 'ANCHOR_ALIGNED'; anchorId: AnchorId }
  | { type: 'STRAIN_RECOVERED' }
  | { type: 'WIN' }
  | { type: 'REJECTED'; reason: string }; // actionable hint text

export type VoiceCue = 'boot' | 'find' | 'safe' | 'help' | 'echo_received' | 'divergence' | 'overstrain' | 'anchor' | 'final';
