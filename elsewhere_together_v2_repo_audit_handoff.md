# Elsewhere, Together — ZIP repository audit and V2 build handoff

**Basis:** user-supplied `elsewhere-together-main.zip`, inspected 21 November 2026. This is a review and implementation plan, not a patch. Prioritise the experience before adding more procedural content.

## 1. Current project verified

- Phaser 3 + TypeScript + Vite + DOM/CSS OS shell.
- Pure deterministic sim in `src/sim/` with five templates: lantern, bridge, radio, greenhouse, tide; each creates two nodes and selects one.
- `SimEngine.dispatch` commands, seed, serialisation, state, branch archive, echo credits, five world stats plus instability, drift, strain, partner utility policy, three-anchor victory.
- Procedural browser audio; ElevenLabs generator is opt-in/dry-run and no generated MP3s exist in this ZIP.
- Built-in E2E screenshot archive (12 PNGs) and Vitest source tests (27 documented tests; Vitest itself was not runnable in this environment due to dependency fetching).
- A compiled JS copy of `src/sim/*.ts` was exercised headlessly. On 100 seeds the SELF-first scripted solver won every time in 4 sim turns/12 commands; ECHO-first won 100/100 in 7 sim turns/17 commands. A random unguided policy produced 0 wins in 40 runs of 60 commands, while a separate recovery test recovered 40/40 random initial states via the planner. These are synthetic policies, NOT human completion rates or gameplay tests.

## 2. Key defects and mismatches

1. `src/sim/engine.ts`: `TUTORIAL_ORDER = ['lantern','greenhouse','radio']` blocks meaningful free exploration (lines ~18 and ~99–135). Replace with discovery-based, stateful introductory design; no arbitrary forbidden interactions.
2. `src/sim/agent.ts`: `SEEK` uses `stepToward` and can enter the player's selected child world immediately, nullifying separation. Separate progress towards an echo/location from actually joining the same branch. A genuine reunion must require convergence conditions.
3. `src/sim/planner.ts`: trivial four-fork SELF sequence solves all three anchors. `SELF` always selects universally favourable outcome A for only +2 strain; `ECHO` has little necessity. Rework consequences so self-preservation does not always maximise reunion. Allow alternative paths to succeed.
4. `src/game/layout.ts`: `isBlockedPx` is static. `src/game/WorldScene.ts` renders state-dependent destroyed bridge and floods, but blocking never changes. Bridge passability, water, obstruction, gate routes must be driven by state and checked in the shared topology.
5. `src/main.ts`: simulation commands `BEGIN_FORK`, `REST`, `ACTIVATE_ANCHOR` have no actual proximity validation in the sim, only the UI (`focusId`). A CLI bot can interact with anything from anywhere; use shared world topology + actions to test real human-accessible paths.
6. `src/sim/types.ts` and `engine.ts`: there is WIN/ENDING but no fade/death terminal result, even at drift/strain 100. Introduce a recoverable warning window and a deliberate FADE outcome that cannot be forced by one unlucky random roll.
7. `src/ui/shell.ts` and `src/ui/panels.ts`: always-visible right-side log, meters, LINK panel, archive, and expository fork modal conflict with a predominantly meta/diegetic experience. Keep the logs in an optional post-game analysis view and ensure narration through visuals/audio.
8. `src/sim/types.ts`: `EventRecord` only stores forks; partner SEEK moves, retraces and other actions are not permanently journalled. Needed: `JourneyStep` history for each actor (every node transition) to draw the two post-game animated paths.
9. `src/game/sprites.ts`: programmatically generated 16x16 pixel tiles rather than the desired loose ink-sketch style. Existing `VIEW_W=320/VIEW_H=180` may be too low to retain ink detail.
10. `src/main.ts` / `src/ui/shell.ts`: missing character choice, intermediate facts/loading page, always-on pink fork-border animation, final-only causal archive and alternate fade ending.
11. No Easter-egg / alien realm triggers in the five templates or game scene.
12. One drawback: `save/restore` checks only structural fields and source tests do not cover world geometry, human discovery or asset loading. Validate no unreachable critical objects after a branch.

## 3. New intended complete flow

1. Title/logo. Buttons Play, Sound, optional Restart/Continue.
2. Very short, skippable loading sequence containing 2–4 scientifically careful statements about many-worlds as an *interpretation*, not proven literal travel, and about mutualism/dependency in symbiosis. Each statement should have a concise attribution in an optional credits/about screen.
3. Both humanoid symbiotes briefly appear together, then a branch separates them; player chooses Amber or Cyan. Persist `playerIdentity` and invert art/voice mappings, not core simulation `player`/`partner` roles.
4. Immediately walk in a coherent sketched forest hamlet (landmarks: old lamp, bridge, flooded nursery, signal mast, tidal gate). Show movement tutorial with subtle on-world prompt. First interaction should visibly change the environment; **every fork gets a brief pink screen-edge bloom** (~400–700ms, non-strobing), a soft audio crack, and a meaningful persistent aftermath.
5. During play: no archive/map view, permanent meters, sidebar action logs or SELF/ECHO selection screen. Discovery, physical consequences, faint partner echoes, voice and soundtrack are the navigation tools. Transient text for essential context only. Partner is never physically present in main play apart from clearly labelled **VARIANT / ECHO** apparitions.
6. A win comes from creating a compatible route, restored communication and mutual stability; a fade comes from sustained incompatible separation / overdrawn bond after fair warnings. Both endings open the **same** comprehensive causal archive.
7. Post-game tree/DAG screen: event nodes, two chronological actor trails, branch conditions, chosen/unchosen outcomes, objective changes, who sacrificed, and reasons. Inspect node details, replay/restart. Full tree may be larger than viewport; pan/zoom/focus path.
8. Easter egg: e.g. at the mast, if light is absent, signal broken and old stones were examined, a rare seeded side branch opens an alien-overgrown variant of the same map. Must be discoverable by causal clues and never lock out the main goal.

## 4. Engine changes in minimal sequence

### 4a. Shared spatial core

Extract `src/game/layout.ts` topology into a pure module e.g. `src/world/topology.ts` exposing:

```ts
getWalkability(world: Stats, flags: string[]): boolean[][];
canWalk(world: Stats, flags: string[], from: GridCell, to: GridCell): boolean;
getReachableObjects(world: Stats, flags: string[], origin: GridCell): string[];
getNearbyInteractables(world: Stats, flags: string[], origin: GridCell): string[];
```

Rules must affect actual traversal: `BRIDGE_CLOSED` disables bridge; `BRIDGE_OPEN` enables it; high tide floods low paths; `COAST_OPEN` opens a navigable path. Ensure fallback routes so a bad branch is difficult, not dead. Add a test BFS/A* for every critical win state.

Replace trivial `SET_POSITION` for headless play with `MOVE` on grid/canonical continuous topology and `INTERACT` by object id. UI can still animate smoothly; the game engine must reject impossible interaction, not rely on a DOM proximity hook. Do NOT dispatch full state clones per animation frame.

### 4b. Consequences and emergent steps

Remove `TUTORIAL_ORDER` guard, but use a first-observation sequence with prompts that react to *whatever object the user discovers*. Keep first environmental change legible. Per object support multiple *causal preparations* e.g. brace bridge using retrieved timber, listen to radio with repaired antenna, divert water before planting; each biases seeded outcome probabilities rather than directly choosing better world from a modal. The major act should be a meaningful object interaction.

ECHO sacrifice should grant a durable counterpart benefit in the next turn and a visible local disadvantage. SELF should sometimes undermine a later shared condition, so it cannot be the universal winning strategy. LET_GO is a low-control option, not just a free best-outcome lottery.

### 4c. Truly independent counterpart

Tick the counterpart on deterministic milestones: player meaningful action, travel distance threshold, or bounded in-world elapsed time represented as deterministic simulation ticks; do not rely on unseeded wall-clock calls in the sim. Preserve agency by goal weights (survive, seek, assist, investigate, stabilise), memory of recent actions, occasional refusal, audible lines and permanent journey journal. Counterpart cannot simply `stepToward` into player's unique child branch. Convergence requires appropriate shared-anchor conditions / special reunion edge. Partial progress becomes visible as distant changes: a bridge stabilises on one shore, a lamp pulses in their rhythm, echo variant moves across scenery.

### 4d. Risk and ending

Track `realityDrift` and `bondStrain` invisibly as simulation state. Introduce `consecutiveCriticalTicks` or `coherenceDebt` to make fade achievable only after sustained risk and repeated warnings. Baseline thresholds are tunable by scripted sweeps; don't make one random event instantly kill. Retracing via in-world 'echo stones' should reduce divergence with a nontrivial cost and without opening a big mid-game archive.

Do NOT infer a reliable human win/loss balance from random bots. Bot policies test possibility, fairness, softlocks, and exploit strategies; a human playtest tests clarity and fun.

### 4e. Complete causal journey archive

Add:

```ts
interface JourneyStep {
  seq: number;
  tick: number;
  actor: 'player' | 'partner';
  fromNodeId: string;
  toNodeId: string;
  action: 'FORK' | 'SEEK' | 'RETRACE' | 'ECHO' | 'ANCHOR' | 'STABILISE';
  eventInstanceId?: string;
  cause?: string;
  effect?: string;
}
```

Append for every actor movement and key action; don't trim permanently (bound overall game max nodes, but not the final causal log). `nodes.owner` is insufficient for cross-actor traversal. At game end render paths in turn order, make each node clickable for factual causal explanations, show each actor's branch divergence/reconvergence, distinguish unchosen possible outcomes from visited worlds.

## 5. Art and audio

**Recommended primary style:** Kenney's **Scribble Dungeons**, 64x64 top-down drawings, 256 PNGs + vector sources + tilesheets, CC0. https://kenney.nl/assets/scribble-dungeons ; https://opengameart.org/content/scribble-dungeons . Alternative outdoor backgrounds: **Ink hand drawn forest tileset** by GaidamakUA (CC0) https://opengameart.org/content/ink-hand-drawn-forest-tileset . For exterior town props, **Sketch Town** https://kenney.nl/assets/sketch-town is CC0 but ISOMETRIC, so don't mix into a top-down scene without adapting camera and collision.

GatlingArt **100 Dwarf RPG Faces** is a grayscale portrait pack, not walk-cycle sprites. It is CC BY 4.0 with credit required: https://gatlingart.itch.io/100dwarffaces . Good portrait style reference, not a complete RPG world/character set. Do not lift copyrighted graphics from an existing commercial RPG. Use one style language (warm paper, graphite/ink outlines, dusty pink branch bloom, cyan/amber tiny signature accent); preserve hand-drawn strokes and avoid nearest-neighbour downscaling that ruins texture. Prefer a 640x360 or higher drawing surface with predictable scale and hit tests.

ElevenLabs voice + SFX pipeline already present in `scripts/generate_audio.py` but generated audio assets are absent. Create/finalise (a) separate partner voice lines/voice mappings for chosen character; (b) split, sacrifice, warning, convergence cues; (c) a dry-run asset manifest. Keep API key out of public JS. Audio language should communicate true drift/strain while essential clues remain available via accessible captions. The current synthesized music is useful as a fallback; don't discard it during art/UI refactor.

## 6. Test harness requirement — three levels

1. **Unit/invariants** (Vitest): identical seed/action history => same state; branches always exactly two children; no cycles; outcomes clamp; all actor moves journalled; echo resource conservation; honest distances; win/fade reachability; restart/save/restore.
2. **Headless CLI actors:** runs across >=500 fixed seeds and several policies: SELF-only, ECHO-heavy, LET_GO-heavy, curiosity/random interaction, goal-seeking planner, 'malicious' excessive drift, and clue-following novice bot. Execute legal world `MOVE`/`INTERACT` actions (BFS) rather than dispatching events at arbitrary distances. Output JSONL replay per run, deterministic event trace, win/fade/timeout/softlock rates, median turns, echoes donated/consumed, highest drift/strain, anchor path variety, Easter-egg rate. For each failure, provide a minimal reproducible seed + command replay.
3. **Real browser UX:** keyboard to each visible object, pointer/touch hit areas, landscape/portrait, audio-on test, cinematic intro, every route blocked appropriately by world flags, border flash on every fork, no UI clutter, ending -> full archive -> restart. At least two human cold-start sessions to check whether player understands what an interaction *means* without opening help.

**Required target properties before polish:** at least one winning replay, one fading replay, one alien-world replay (all fixed seed + exact actions), no unintended softlocks in explored state-space, multiple different winning strategies, meaningful difference between SELF and ECHO paths. Define empirical targets only once new rules exist; do not overinterpret the old random-run 0% win.

## 7. Work allocation and priority

P0 (gameplay): remove forced fork order; build dynamic walkability; real causal interaction feedback; prevent counterpart instant same-branch join; ensure one understandable win path AND fade path.

P1 (presentation): title/loading/character choice; remove dashboard/log; pink edge-bloom on fork; sketch assets and world-change rendering; transient hints + ambient dialogue; final archive with twin complete journeys.

P2 (research/polish): scientifically careful loading fact cards; alien Easter egg; ElevenLabs voice/SFX assets; music layer tuning; QA balance; mobile accessibility.

**Do not rewrite the simulator into a Godot project.** Phaser is already working, and the existing pure sim is an excellent basis for CLI tests. Refactor to keep simulation and UI separate; spend the remaining time on physical causality, player orientation and meaningful audio/visual consequences.
