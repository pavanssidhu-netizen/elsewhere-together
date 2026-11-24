import type { Order, RoomInfo, Stage, StageView } from '../api';
import type { ForestSummary } from '../../contracts';

/** What the scene needs from the run progression (adapter over ForestRun in run.ts). */
export interface RunPort {
  readonly charges: number;
  readonly maxCharges: number;
  /** 0-based index of the room being played */
  readonly roomIndex: number;
  readonly room: RoomInfo;
  readonly total: number;
  /** a new attempt of the current room */
  begin(order: Order): Stage;
  /** the stage reached CLEARED: bank it. `stars` = Chrono-Mastery state */
  cleared(stage: Stage): { starEarned: boolean; hasStar: boolean; needOther: Order | null; lastRoom: boolean };
  /** the stage reached FAILED: costs one charge */
  failed(stage: Stage): void;
  advance(): void;
  readonly result: 'WON' | 'LOST' | null;
  medal(): 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD';
  summary(): ForestSummary;
  raw: unknown;
}
export type { StageView };
