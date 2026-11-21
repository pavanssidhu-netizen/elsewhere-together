// All balance constants in one place.
export const TUNING = {
  PARTNER_PERIOD: 8,        // partner also acts every N ticks of the player walking
  DRIFT_LINEAGE: 3,         // per fork-distance step (capped)
  DRIFT_LINEAGE_CAP: 10,
  DRIFT_MISMATCH: 6,        // per key world fact that one side has and the other lacks
  DRIFT_WATER: 3,
  DRIFT_ANCHOR: 10,         // relief per aligned anchor
  CALL_STRAIN: 7,
  HOLD_STRAIN: 4,
  RETRY_STRAIN: 3,          // visible cost of repeating a failed fork
  FAIL_STRAIN: 2,
  STRAIN_DECAY_EVERY: 12,   // ticks per 1 point of natural strain relief
  REST_STRAIN: 30,
  REST_CALM: 25,
  CALM_MAX: 60,
  CALM_DECAY_EVERY: 3,
  PARTNER_REST_STRAIN: 18,
  FRAY_DRIFT: 58,
  COMBO_DRIFT: 40,          // together with COMBO_STRAIN: both elevated at once also frays the Thread
  COMBO_STRAIN: 30,
  FRAY_STRAIN: 60,
  PARTNER_REFUSE_STRAIN: 70,
  PARTNER_SAFE_STRAIN: 62,
  IDLE_DANGER: 90,          // ticks without an effective action count as danger (nothing strands the player)
  DANGER_ACTIONS: 2,        // meaningful actions while in danger before the next stage
  DANGER_TICKS: 30,
  WIN_STRAIN_MAX: 80,
  WOOD_RESTOCK_EVERY: 20,   // driftwood washes up: one pickup returns to each woodpile (no fuel softlock)
  PILE: 3,                  // pickups per wood / plank pile
  FIRE_DRIFT: 14,           // drift while a fire spreads on the player's side
  PROPAGATE_DRIFT: 10,
  SPREAD_DRY: 0.65, SPREAD_WET: 0.15, // chance a lit signal fire spreads
  RAIN_DIVERTED: 0.1, RAIN_FLOWING: 0.4, // chance per weather tick that rain puts the fire out
  WEATHER_EVERY: 6,
  ALT_COST: 5,              // strain to follow the other history
  SELF_DISCOVER: 0.01,      // chance per stuck partner tick (after 6) that it works out the sluice by trial
};
