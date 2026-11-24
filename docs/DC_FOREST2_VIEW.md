# Forest 2 view (iso Time-Lock Rooms)

Scene: `src/dc/scenes/ForestScene.ts`. Helpers: `src/dc/forest2/view/` (`isoTex`, `tileLayer`, `actor`, `hud`, `cards`, `runAdapter`, `runPort`).
The scene renders `StageView` from `api.ts` and sends keys/buttons to the `Stage`. Progression, charges, scores, stars and medals come from `ForestRun` (`run.ts`) through `runAdapter.ts`.
Flow: intro card, order chooser, phase 1, Time-Lock, phase 2, cleared or failed card, next room or retry, final medal card, then `FOREST_WON` / `FOREST_LOST` (after `session.forestSummary = run.toForestSummary()` and `session.forestState = null`).

## Derived iso floor textures
`isoTex.ts` builds every floor diamond at runtime from the imported 32x32 square tiles (`tiles/front_lawn`, `garden_gravel_path`, `flower_bed_soil`, `wood_planks_light`):
canvas affine transform `x' = u - v + 32, y' = (u + v) / 2` (rotate 45 deg + squash 2:1), image smoothing off (nearest neighbour), after a multiply tint on a temp canvas. Eight stacked, darkened copies of the same transformed tile form the side faces.
Result: 64x32 diamonds (plus 8 px side). This is a transformation of imported art, not new art. No new image files.

## Asset to tile mapping
| Kind | Rendering |
|---|---|
| FLOOR | Past: lawn (two-tone checker, warm tint). Future: gravel tinted stone-grey (checker) |
| ROCK | apple tree / lilac bush / shed / greenhouse (hash by cell; lilac at the apex so it never hits the banner); Future tinted cold |
| SOIL / ROOTED | soil diamond; ROOTED adds a `garden/potted_daisy` sprout |
| GAP | near-black diamond, no side faces |
| VINE | bright-green lawn diamond + two `home/potted_fern` leaf sprites |
| BARK | gold-tinted gravel + rising `p_star_01` sparkles |
| DUST | grey crumbling gravel + `p_smoke_08` puffs |
| SAP_WELL | rain barrel tinted amber |
| ROOT_PLATE / CONDUIT_PLATE | `portals/tide_rune_circle` flat on the tile, gold / cyan (additive, dim until `lit`) |
| CONDUIT_P / CONDUIT_F | larger rune circle + ring, gold / cyan |
| RUIN | gnome statue tinted stone-grey |
| RIFT | `portals/tide_idle` loop squashed flat on the tile (additive) |
| CRATE | `garden/bag_of_soil` |
| sap on the Past rift tile | amber glow orb |
| BEACON | shared `Beacon`. Amber pips = [root, -, ignition]; cyan pips = [-, charge, ignition]; harmony pulse on ignition. Not edited, used as is |
| Pins | `p_circle_05` + `p_star_01` additive target ring (both views) |
| Veins | thin gold (Past) / cyan (Future) Graphics polylines from root plate, conduit plate and rift to the beacon (L-shaped along the grid, lit when the socket is lit, ruin->plate link faint) |
| Tether | glowing line shroom<->ghost with moving beads; green -> yellow-green by distance, crimson pulsing when strained |
| Shrooms | `myconid/blue` (Sam) / `myconid/red` (Jensen), 8-direction idle/walk/hit, 140 ms step tween. Grid N/E/S/W map to screen NE/SE/SW/NW |
| Ghost | other colour, 45% alpha tint, plus a colour-coded diamond outline + fill under it; its recorded path is drawn only while Peeking |

Peek (hold C): a second `TileLayer` with the other layer's map is drawn above the live one, with that layer's veins, weathering flags (red outline + "!") and the ghost path.
Depth sorting is by screen y (`100 + y` for objects and actors), floors sit below (-1000).

## Controls
Arrows / WASD, Z or Space = A, X = B, C hold = Peek, R = reset phase, Enter = End Loop. Chooser: 1/2 or arrows, Enter. Touch: d-pad bottom-left, A/B/C bottom-right (C is hold), END LOOP / RESET buttons. Key auto-repeat is ignored (every press costs a beat).

## Test hooks
`window.__forest2 = { stage(), run(), scene, mode() }`. With `?f2debug=1` also `solve(room, order)` (reference solution for the current stage seed, loaded via a dynamic import).
