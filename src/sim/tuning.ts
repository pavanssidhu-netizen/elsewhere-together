// All balance constants in one place (tuned with scripts/bots.ts).
export const TUNING = {
  PARTNER_PERIOD: 12,      // partner acts every N ticks (plus after each fork)
  DRIFT_LINEAGE: 5,
  DRIFT_STATE: 2,
  DRIFT_ANCHOR: 12,
  SELF_STRAIN: 2,
  ECHO_STRAIN: 12,
  ASSIST_STRAIN: 3,
  // SELF picks that starve the partner: template -> delta applied to the partner's next event.
  SELF_DRAG: { radio: { signal: -1 }, greenhouse: { growth: -1 } } as Record<string, Record<string, number>>,
  PREP_BONUS: 0.3,         // LET_GO: chance for outcome A rises when the causal neighbour was examined first
  COHERENCE_RISE: 3,       // debt per tick while drift>=80 or strain>=85
  COHERENCE_DECAY: 1,
  WARN_AT: [30, 60, 85],
  STONES_RELIEF: 40,       // coherence debt removed by the stones
  STONES_CALM: 25,         // temporary drift relief
  CALM_MAX: 40,
  CALM_DECAY_EVERY: 6,     // ticks per 1 point of calm lost
  TERMINAL_RELIEF: 15,
  REST_STRAIN: 12,
};
// LET_GO preparation: looking at this object first makes the keyed template resolve better.
export const PREP: Record<string, string> = { lantern: 'radio', bridge: 'lantern', radio: 'stones', greenhouse: 'tide', tide: 'radio' };
