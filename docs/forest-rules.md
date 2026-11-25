# Game 1: Time-Lock Rooms (rules reference)

The rules of the isometric, turn-based record-and-replay forest puzzle, as implemented in `src/game/forest2/sim.ts`. When the code and this file disagree, the code (and its tests) win.

ForestScene runs at FlowState FOREST_GAME and ends by dispatching FOREST_WON (all 3 stages cleared) or FOREST_LOST (Thread charges exhausted). Sam = PAST shroom (blue cap, Builder). Jensen = FUTURE shroom (red cap, Scout).

## Loop
A run = 3 escalating rooms (stage 1: 6x6, stage 2: 7x7, stage 3: 8x8). Per stage the player chooses the ORDER: PAST_FIRST (begin as Sam) or FUTURE_FIRST (begin as Jensen); the choice screen pre-highlights the character picked at the character-select.
- Phase 1: control shroom #1 for a budget of 20 BEATS (relaxed: 26). Every move and every action (A, B) costs 1 beat; Peek (C) is free. A move costs 2 beats while the tether is strained (see below; only possible in phase 2). END_LOOP ends the phase early. The path + actions are RECORDED beat by beat.
- Time Lock: shroom #1 is locked. The world for phase 2 is derived (below).
- Phase 2: control shroom #2 for 20 beats. Shroom #1 replays its recording beat-for-beat as a translucent "Spore Ghost". A ghost holds its final position after its last recorded beat.
- DUAL IGNITION (win): the player's shroom stands on its Beacon Conduit at beat t while the ghost is on its own Conduit at that same beat t, and the root socket and charge socket are lit. Then the beacon (ignition socket) lights: stage cleared. Budget exhausted in phase 2 (or END_LOOP) without ignition = stage attempt FAILED.
- Thread charges: the run has 3 charges (relaxed: 5). A failed stage attempt costs 1 charge and restarts the same stage (same room, same seed variant, order may be re-chosen). 0 charges = FOREST_LOST. Within a phase the player may freely RESET the phase (key R) back to its start at no cost (it's just a puzzle). Stage clear never refunds charges.

## Grid and tiles (iso rendering, grid logic is plain orthogonal x,y; N=y-1, S=y+1, E=x+1, W=x-1; moves are 4-directional)
Two maps per room share coordinates: PAST (before) and FUTURE (after, weathered).
Common kinds: FLOOR (walkable), ROCK (blocked scenery), GAP (blocked in both layers unless bridged), BEACON (centre, blocked; its two Conduits are walkable pads: CONDUIT_P in the Past layer only, CONDUIT_F in the Future layer only).
PAST-only interactive: SOIL (fertile soil), ROOTED (soil after planting), VINE (a plant bridge over a former GAP; walkable), BARK (sap-fossilised vine = Crystal-Bark; walkable), SAP_WELL, ROOT_PLATE.
FUTURE-only interactive: DUST (weathered vine: blocked), RUIN (static-charge source), CONDUIT_PLATE (discharge target), RIFT (time rift), plus the loose CRATE object that can sit on a FLOOR tile (pushable).

## Actions (A = Channel/Interact, B = Symbiote Pulse; both cost 1 beat; always act on the tile the shroom stands on unless stated)
Past shroom (Sam):
- A on SOIL: plant roots -> ROOTED.
- A on SAP_WELL tile (stand ADJACENT to the well, facing it, i.e. the well is the tile in the last move direction; wells are blocked tiles): take 1 Mineral Sap if empty-handed (inventory max 1; the well has 2 uses per loop).
- A on a VINE tile while holding Sap: coat -> BARK, sap consumed.
- A on ROOT_PLATE: power the veins: lights the ROOT socket (permanent for this attempt, from that beat).
- B on a ROOTED tile: growth wave: every GAP tile orthogonally adjacent to this tile becomes VINE for the rest of the Past loop (walkable). (The pulse does nothing elsewhere.)
Future shroom (Jensen):
- A on a tile adjacent to (facing) a RUIN: absorb Static Charge if empty-handed (max 1; each RUIN gives 1 charge per loop).
- A on CONDUIT_PLATE while holding Charge: discharge -> lights the CHARGE socket.
- A facing a CRATE with the tile behind it free: push it one tile (cost 1); pushing a CRATE onto a RIFT sends it to the Past (see Rift). Crates cannot be pushed onto GAP/ROCK/BEACON.
- B on any FLOOR/BARK/ DUST-free tile: drop a Holographic Blueprint Pin on the current tile (max 3 pins per loop). Pins matter only in FUTURE_FIRST order (see Weathering).
Peek (C, hold, free): view-only overlay of the other timeline's geometry, weathering zones (tiles that will turn to DUST), floor veins and the twin's ghost trajectory. No state change, no beat.

## Weathering (Past -> Future) and the two orders
Future map = weather(final Past map): GAP->GAP, VINE->DUST (blocked), BARK->BARK (walkable), ROOTED->FLOOR, SOIL->FLOOR, others keep their kind; Future-only features (RUIN, CONDUIT_PLATE, RIFT, CRATE, CONDUIT_F, DUST pre-existing, extra ROCK pillars) are given by the room definition.
- PAST_FIRST: phase 1 = Past (Sam builds, blind foresight: he must guess which vines the Future route needs and coat only those). After the lock the Future map is weather(final Past) and Jensen plays it for real. Time Rifts are inert in this order. The ghost (Sam) replays.
- FUTURE_FIRST: phase 1 = Future (Jensen scouts) on the BASELINE future = weather(room's starting Past map with nothing built): gaps remain GAP. Jensen's PINS are PROMISES: a tile with a pin counts as BARK during his loop ("projected"), so he can plan the route as if the Past had bridged it. Phase 2 = Past (Sam builds; each pin shows as a bright Target Ring on that tile in the Past; the ghost of Jensen replays on the REAL future = weather(Sam's final Past)). PARADOX: if at any beat the ghost's recorded move/action is impossible on the real future map (stepping onto DUST/GAP, a discharge with no charge, a push that is blocked, ...), the ghost stops and the attempt FAILS immediately with a clear reason (e.g. "Paradox: the vine at (3,2) turned to dust before Jensen crossed it"). Rift: a crate pushed onto a RIFT at beat b of Jensen's loop makes a SAP appear in the Past at the paired RIFT_P tile (given in the room def) from beat b on during Sam's phase-2 loop (Sam picks it up with A, standing adjacent, like a well; max inventory 1). That is the "send tools backward" mechanic and a shortcut that saves beats.
Both orders must be solvable for every room and every seed variant (verified by reference solutions replayed through the sim).

## Tether (phase 2 only; phase 1 has no twin yet)
Distance = Manhattan distance between the active shroom and the ghost's position AT THE CURRENT BEAT. <= 4: normal. > 4: strained (crimson pulsing; a move costs 2 beats; A/B stay 1) until within 4. Adjacent (distance 1) at the end of an action: SYNC BOOST once per loop: +1 multiplier (max x3) and refund 1 beat.

## Scoring (per stage, summed over the run)
Base clear +1000. Efficiency +150 per unused beat of the second loop. Symbiosis +200 x multiplier per beat ended within 1 tile of the ghost (counted once per beat). PAST_FIRST base clear is x1.25 (harder foresight). Chrono-Mastery Star: a stage cleared once as PAST_FIRST and once as FUTURE_FIRST during the run (persisted in localStorage per stage id: `oos-dc-stars`). Medal thresholds on the run total: bronze >= 3500, silver >= 6500, gold >= 9500 (tunable constants in one place). Cosmetic unlocks (spore trail colours, banter) are stored in localStorage only; keep it small.

## Rooms (hand authored, escalating; each with a seeded VARIANT = one of 4 symmetric transforms: identity, flip-x, flip-y, rotate-180 chosen by seed; all verified solvable)
Stage 1 (6x6): one GAP between start and the Past conduit; one SOIL beside the gap; one SAP_WELL; one ROOT_PLATE; Future: one RUIN, one CONDUIT_PLATE, the future conduit reachable only over the bridge tile. Teaches: plant, pulse, coat, weathering. Budget 20/20.
Stage 2 (7x7): two gaps (one needed by Past, one needed by Future), two wells (one far), the first RIFT + CRATE (optional in PAST_FIRST, saves beats in FUTURE_FIRST). Tether can strain.
Stage 3 (8x8): three gaps, soil far from gaps, a pillar maze in the Future, the rift is needed to make FUTURE_FIRST fit the budget comfortably; PAST_FIRST requires careful sap economy. Budget 20/20 (relaxed +6).
Design rule: every room must be completable with >= 2 spare beats by the reference solution and fail under do-nothing / random play; difficulty rises, never an obscure dead end (RESET always available).

## Beacon visuals (shared Beacon class, src/game/shared/beacon.ts)
Central beacon with 3 crystal sockets = the 3 Beacon pips per side already in that class: use pips [root, charge, ignition]: amber pips (Past side) = root socket + ignition, cyan pips (Future side) = charge socket + ignition (the class has 3+3 pips; map: player-side pips [rootLit, ..], decide sensibly and document), floor veins: thin glowing polylines on the floor from each task tile to the beacon (gold in Past view, cyan in Future view; lit when that task is done).
## HUD (minimal arcade): top-left turn counter (e.g. "14 / 20 BEATS") + tether gauge (green -> crimson); top-right score + multiplier; bottom-centre three icons for A, B, C with the CURRENT contextual meaning (e.g. A: PLANT / COAT / TAKE SAP / ABSORB...), Thread charges as small pips; phase banner ("PHASE 1: SAM, THE BUILDER"). Controls: arrows or WASD move, Z / Space = A, X = B, C hold = Peek, R = reset phase, Enter = End Loop; touch: on-screen d-pad (bottom-left) and A / B / C (hold) buttons (bottom-right), all >= 44px at scaled size, plus tap-free END LOOP + RESET small buttons.
