# OUT OF SYNC — V3 controlled build contract

**Mission:** Finish a coherent, beautiful, 5–8-minute browser game from the existing `elsewhere-together-main` Phaser/TypeScript repository, under **60 minutes of development + 15 minutes reserved for final edits/submission**. This document OVERRIDES the earlier V1/V2 presentation and ambiguous mechanics, but retains valuable deterministic simulation infrastructure.

**Execution mode: HUMAN-APPROVED.** Coding agents may use subagents, but MUST stop at each visual gate. The agent must present real in-browser screenshots, say exactly what is implemented, and ask the user to reply `APPROVE G#` or provide targeted corrections. Do not interpret silence as approval. No long speculative redesigns, no asset substitution, and no proceeding to the next gate before sign-off. Avoid bundling multiple gates in a single approval request.

**Top priorities:** (1) the player understands the world and motivations without a guide; (2) visual assets are **actually imported from licensed hand-drawn packs**; (3) choices have visible local consequences and coherent cross-world meaning; (4) start-to-end game loop works; (5) ElevenLabs audio makes connection/disconnection audible; (6) archive reveals both full journeys after either ending.

## 0. Read these files before editing

- `src/sim/types.ts`: existing `Choice = LET_GO | SELF | ECHO`, `SimulationState`, `DomainEvent`, actor states.
- `src/sim/engine.ts`: forced `TUTORIAL_ORDER`, fork resolution, anchor calls, retrace, win; remove the lock.
- `src/sim/agent.ts`: the autonomous counterpart currently uses `SEEK` / `STABILISE` / `ASSIST` / `ANCHOR`; `SEEK` can move into the player node. **Forbid** this.
- `src/sim/events.ts`: lantern, bridge, radio, greenhouse, tide event templates; keep deterministic seeded outcome function, change semantics.
- `src/sim/anchors.ts`: `LANTERN`, `GREENHOUSE`, `LIGHTHOUSE` readiness rules; retain three milestones but replace opaque stat-based explanation and activation with grounded world conditions.
- `src/sim/core.ts`, `src/sim/branches.ts`: existing causal nodes and drift. Extend rather than discard.
- `src/game/layout.ts`, `src/game/WorldScene.ts`, `src/game/sprites.ts`: old 20×11 map, procedural sprites; **replace renderer and collision causality**, not the entire simulation.
- `src/ui/shell.ts`, `src/ui/panels.ts`, `src/ui/styles.css`: dashboard / fork modal / logs / archive visible in active play; strip main UI to immersive scene.
- `src/audio/audioEngine.ts`, `scripts/generate_audio.py`: audio integration; make verified imported/generative assets audible, gracefully fallback if no API access.
- `src/main.ts`: orchestrates UX states. `package.json` exposes `build`, `test`, `dev`.

**Baseline limitations from inspected ZIP:** artificial tutorial order; generic `SELF/ECHO/LET_GO` choice; EchoCredits give counterpart magic resources; partner follows node toward player; lighthouse checks hidden world stats; static collision ignores some visual state; game archive doesn't reliably store all agent journey steps. Newer branch may differ: re-audit local current checkout before editing and preserve valid improvements.

## 1. Canonical narrative (must be visible and never contradicted)

**Setting:** A small, hand-drawn forest settlement, with a shared clearing, a stream crossing, a greenhouse/garden, and a distant lighthouse/lookout beacon. Two young, vaguely humanoid symbiotes bear the two halves of a **living Thread**: a fictional, mutually dependent sensory organism.

**Opening:** The two stand physically together. A chance event (a falling tree / lightning / broken light) branches their histories. The player sees the edge flash pink, awakens alone, and hears the other only faintly. Their bodies remain **in separate, independent versions of the same forest**; player never sees the actual partner in the playable world. Clearly labelled spectral *variants* are allowed later, and cannot be confused with the real partner.

**Goal:** Restore enough correspondence at three real landmarks to hear, navigate and finally overlap with the other symbiote at the beacon. Preserve **both beings** and the living connection. The finale is explicitly fictional *Thread-mediated overlap*, not a scientific prediction of many-worlds physics.

**Six absolutely fixed world rules:**
1. Each being physically acts **only in their own timeline**. Physical objects, energy packets and inventory can NEVER be transported between timelines.
2. Every important local action can tip a seeded uncertain event toward one of **two environmental outcomes**; chosen outcomes change the terrain, nearby objects, access, light, growth or signal in that actor's world. Record both potential outcomes in history.
3. The Thread can communicate **sensations/information**, not matter. A sustained call consumes **only the caller's local lantern fuel or other clearly shown material** and increases **bond strain**; the autonomous partner may act on the information but has its own priorities. No magical `EchoCredit` that alters unrelated physical objects.
4. The two worlds do not automatically merge or share branches. The counterpart never teleports to `player.nodeId` via `SEEK` or any other goal. An anchor can coordinate two already-local physical actions at corresponding sites.
5. Reality drift = incompatible histories/world states; bond strain = cost of sustaining the Thread. These are hidden mechanical values, communicated through sound, ambient visuals and dialogue, **not permanently shown as meters**.
6. Win when both beings independently reach/readied the three corresponding landmarks, preserve a viable Thread, and coordinate the final beacon event. Fade occurs when disconnection becomes unrecoverable, with progressively obvious warning signs and a recovery opportunity. Both endings show archive then Restart.

**Not physics claims:** The many-worlds interpretation and decoherence motivate the divergent histories; cross-branch signals and reunion are speculative fiction. Loading facts distinguish real science from game fiction. Symbiosis encompasses different relationships; this particular living Thread is a *fictional mutualistic bond* with reciprocal benefit and risk.

## 2. Player verbs and causality — exactly what the user does

The player controls **one character** (chosen after seeing both) with WASD/arrows or touch. At all times: move, inspect nearby object, interact (`E` / tap), optionally call (`C` / tap) when the Thread is reachable. NO permanent panels or maps. Contextual verbs are short and specific to the object, never `SELF`, `ECHO`, `LET_GO`.

| Object / region | Reason it matters | Local actions (world verbs) | Local, visible two-outcome fork | Counterpart effect (allowed) |
|---|---|---|---|---|
| Clearing lantern | Lost signal, darkness | `Relight` using nearby fuel / `Leave it` | Flame holds vs glass breaks; visible illumination, passable forest path | Once player relights it, a weak Thread signal can be heard. A call tells partner where a corresponding lantern might be; **doesn't light theirs** |
| Broken bridge & stream sluice | Route to garden/coast | `Brace bridge` using local plank / `Open sluice` to lower water, or choose to leave | Bridge holds vs collapses; water high vs low. Collision/pathfinding immediately matches image | Partner must deal with its own crossing. Your call can tell it which mechanism is working on your side; agent decides independently |
| Garden / greenhouse | Limited materials / safe resting place | `Protect seedlings` / `Harvest dry fibre` | Garden grows and provides safe recovery vs withers and frees building material | Player gains or loses **local** resources. Partner benefits only if it hears the discovered technique and can apply it in its world |
| Old radio / resonant stones | Information exchange | `Tune` / `Hold signal` | Clear call vs distorted call, depending on environment and seeded chance | A sustained call explicitly costs player warmth/fuel/strain and unlocks a *hint* for agent policy, not a better outcome forced by code |
| Final lighthouse/lookout | Last meeting opportunity | `Light beacon` when the first two landmarks are coordinated | Beacon synchronises if both sides ready, or delays/flickers with clue | Agent must physically reach and operate its matching beacon before reunion |

**Example trade-off the player can reason about:** The garden contains dry fibre. Burning it keeps the lantern and Thread call alive long enough for the partner to repair its signal tower, but costs the player garden growth/safe recovery. Preserving the fibre helps the player cross flooded terrain, but the partner receives no instructions. Both can be useful, depending on current world conditions.

**Do not implement** 'take worse version of my bridge to give partner a structure echo.' Delete/migrate that behaviour. Do not replace it with a differently named magical token.

**Never require hidden exact stat thresholds to discover what to do.** For each blocked interaction, produce a factual environmental clue: `The lantern has no fuel. The dry fibre in the garden could catch.` Not `SIGNAL < 2` / `STRAIN > 55`.

## 3. Three landmark progression beats, but no forced sequence of interaction

1. **HEAR (Clearing/Lantern):** Characters first recognise each other's voice via their matching lit or resonant clearing landmarks. The partner can respond if the agent also achieves its side. Ambient sound goes from unilateral distant notes to an intelligible response. Not a modal or checklist.
2. **FIND (Crossing/Garden):** They independently make traversable routes to matching second landmark; both can prove location with environmental signals (e.g., two distant bell notes). Preserve at least two plausible player approaches, such as bridge repair OR lowering water and using a shallow crossing. The world makes the choice obvious and shows physical consequences.
3. **MEET (Lighthouse/Lookout):** Both have prepared the beacon, both are there, the link remains viable. Their voices and motifs align; a brief overlap manifests the real partner for the **first time since separation**. Cut to ending. If readiness lacks, give plain, specific voice clue from corresponding physical site.

- The *object order is free*. Future landmarks may be visited early. An early lighthouse encounter should show an inactive beacon and a helpful physical clue, not say 'do tutorial #2 first'.
- Readiness is based on **eventual physical landmark flags, actor arrival and a viable link**. Don't simply set `partnerReady = true` when a player clicks an anchor.
- Partner acts autonomously on its own branch and coordinates by receiving information. It cannot perform physical actions that are inaccessible in its world.
- The player can retrace a fork by returning to its source object or a nearby Thread stone. Show a short, optional diegetic interaction; do not expose the archive during normal play. Retrying must have a visible cost and preserve history.

### The exact completion logic (no hidden puzzle)

**Enum mapping (preserve old IDs, change their meaning):**

| Existing `AnchorId` | Scene marker | Player physical evidence | Partner physical evidence | What it unlocks |
|---|---|---|---|---|
| `LANTERN` | Shared clearing | Lantern lit/tuned, character physically at clearing | Partner independently achieves corresponding clearing signal | First intelligible two-way voice; both know the other remains alive |
| `GREENHOUSE` | Garden beyond crossing | Player can physically reach garden via repaired bridge **or** safe lowered-water path and marks the shared Thread symbol there | Partner independently reaches and marks its garden by any viable local route | Common point of reference; counterpart can describe the final beacon direction |
| `LIGHTHOUSE` | Coastal beacon/lookout | Player at beacon, with enough local fuel to light it | Partner at its beacon and lights it through independent actions | Thread-mediated overlap for final reunion, provided bond remains viable |

The first two `aligned` bits represent established correspondence, **not literal world merging**. The final beacon is the only fictional inter-world overlap. This takes the place of stat thresholds in `anchors.ts`. `playerReady` and `partnerReady` are independently earned facts; only set `aligned` once both have occurred. No click can set both readiness flags. There is no need to visit the objects in strict order, but the second and final consequences depend naturally on discovering an earlier shared signal.

**Fade state machine:** `CONNECTED -> FRAYING -> LAST_SIGNAL -> FADED`. The transition to `FRAYING` requires high drift **or** strain, emits audible/visible warning, and still allows recovery. If high danger persists across at least two meaningful actions, enter `LAST_SIGNAL`, allowing one clear *recover or withdraw* action near an available safe site. Only fade if the player continues escalating/ignoring the danger or irreversibly exhausts reachable safe sites. There is no arbitrary timeout that strands players at `EXPLORING` forever. Preserve all branch history in the fade ending.

**Visible local feedback** must accompany stage changes: lantern visibly burns or breaks; bridge physically spans/open or blocks; garden has leaf/ink growth or barren beds; beacon shows two separate pulses before the final combined pulse. A player never needs to decode hidden `signal = 2` or `growth = 2` values to explain what happened.

## 4. Explicit branching/agent rules for engineering

### Branch core
- Preserve seeded RNG (`seed`, parent node, event template, occurrence), child A/B nodes, outcome causal record, `reason`, `actorId`, and turn.
- Do not render infinite worlds; render only current player state; branch archive stores compressed actor-specific snapshots and unchosen possibilities.
- Every branch event has `sourceObject`, `priorState`, `playerAction`, `outcomeA`, `outcomeB`, `seededRoll`, `chosenOutcome`, `localPhysicalEffect`, `evidenceShown`, and optional `threadSignal`.
- Probability can depend on physical variables (rain raises chance bridge collapses), but show clues (water high, supports visibly loose). **Interventions BIAS a probability, they do not guarantee the preferred outcome**. Seed makes the resolution reproducible, not arbitrarily controllable. No event may be completely untelegraphed when its effect can end the run.
- No multiplication of gameplay complexity: use 5 existing event templates and 1 Easter egg.
- Every visual state-changing flag must affect local collision or interaction when relevant. Broken bridges block crossings; floods alter traversal; doors match interactability.
- Fix starting spawn and recovery so dynamically blocked tiles cannot trap player.

### Counterpart goal agent
- Agent goals: `SURVIVE`, `REACH_NEXT_SITE`, `RESPOND_TO_CALL`, `PREPARE_BEACON`.
- Agent keeps its own `(branchNodeId, location, flags, resources, recentKnowledge, sequenceOfActions)` and selects available actions with seeded tie-breaking; it cannot observe the player's unseen private environment except through explicit Thread messages.
- Tick agent on committed world actions and occasional bounded exploration milestones; avoid fast idle simulation. If there's no possible action, it waits and emits a specific situation clue on next call.
- Agent may reject requests when endangered; no unlimited obedience. If agent picks a path that becomes impossible, permit its own retrace/repair where the world rules allow.
- Every meaningful partner action adds a timestamped history record **even when it doesn't create a fork**, so final playback is accurate.
- Partner dialogue should report observed world facts, not game math: `The river rose again. I can't cross from this bank.`

### Outcome and danger
- **Win** if both progressed through Hear/Find and completed final coordinated Meet, with noncritical strain and both alive/reachable.
- **Fading** occurs after clear warnings and a short recoverable grace window; ordinary failed gameplay should fade or recover rather than run out of actions forever.
- **No false conclusion:** do not record a win solely because the agent's branch node equals the player's branch node.
- World drift warns by visuals, spectral variants and increasingly discordant/filtered audio; no big visible pink corruption except on a branch event, when the *outer border flashes pink for 400–700 ms*.
- Excessive sacrifice can cause overstrain. Insufficient help can cause partner isolation. Both overhelp and selfish-only have viable but non-dominant paths; no one strategy automatically wins.

### Suggested data model (adapt exact file structure rather than wholesale rewrite)

```ts
type PhysicalAction = 'RELIGHT'|'BRACE'|'OPEN_SLUICE'|'PROTECT'|'HARVEST'|'TUNE'|'HOLD_SIGNAL'|'OBSERVE'|'BEACON';
type Site = 'CLEARING'|'CROSSING'|'GARDEN'|'TOWER'|'BEACON';
type ThreadMessage = {from:'player'|'partner';to:'player'|'partner'; kind:'LOCATION'|'WARNING'|'TECHNIQUE'|'CALL'; site:Site; turn:number; clarity:number};
type ActorHistory = {turn:number; actor:'player'|'partner'; nodeId:string; site:Site; action:string; outcome?:string; evidence?:string};
type SiteReadiness = {playerPhysical:boolean; partnerPhysical:boolean; coordinated:boolean};
type AssetManifestEntry = {key:string; sourcePack:string; sourcePath:string; outputPath:string; license:'CC0'|'CC-BY-4.0'};
```

No cargo-cult introduction of more statistics. Prefer 2 hidden numeric health dimensions + a small number of flags. Archive shows **causal explanation** rather than stat dumps.

## 5. Visuals: hard licensed-asset contract; NO agent freestyling

**Target appearance:** intentionally hand-drawn black/charcoal ink linework on soft parchment and muted moss/sage forest backgrounds; light warm amber accents, partner pale cyan, **pink exclusively for branching/critical visual signals**. Resembles the *characterful sketch* quality in the GatlingArt reference, but do not copy/recreate those particular faces unless separately downloaded with proper attribution and explicitly user-approved.

**Verified candidate SOURCE PACKS** (the agent must download assets and import actual local files into the project; linking to a source is insufficient):

A. PRIMARY: **Kenney — Scribble Dungeons**, top-down hand-drawn tile/object/character pack, CC0, 64×64 tiles and 256+ sprites: https://kenney.nl/assets/scribble-dungeons ; alternate download https://kenney-assets.itch.io/scribble-dungeons . Includes tile sheets and vector sources; choose actual art after inspecting pack.

B. TERRAIN ONLY if visually compatible: **GaidamakUA — Ink hand drawn forest tileset**, CC0, single `forest.png` sprite sheet: https://opengameart.org/content/ink-hand-drawn-forest-tileset . This is a terrain source, NOT proof that it contains a bridge/lighthouse/tree object. Verify contents.

C. OPTIONAL CHARACTERS ONLY if perspective works: **Kenney — Scribble Platformer**, CC0: https://kenney.nl/assets/scribble-platformer ; note SIDE-ON perspective may conflict with top-down setting. Never import it automatically as an incoherent mix.

The relevant licence is CC0 as published on source pages. Create `ASSET_CREDITS.md` listing URL, author, licence and filenames, even when attribution isn't required. For non-CC0 assets, require explicit review of applicable terms. Do not take assets from an existing commercial RPG without a redistribution licence.

**FAIL-CLOSED RULE:** If primary assets cannot be downloaded, halt and ask user for local pack upload. **DO NOT** replace assets with procedural tiles, generated SVG icons, glowing scribbles, emoji, circles, placeholders or code-generated pseudo-ink. A fully rendered procedural remake fails the objective. Use generated drawings only for invisible collision/particles and the pink edge effect; visible scene objects MUST resolve to verified imported files. Exceptions require specific user approval.

**Source-of-truth art manifest:**
- `public/assets/imported/`: local original PNG files or extracted approved frames.
- `src/assets/manifest.ts` or `public/assets/manifest.json` lists every used source filename, dimensions, logical object role, download URL, licence, and any transformation.
- Mandatory **asset-role sheet** with roles: (1) floor/grass, (2) path, (3) tree trunk/canopy, (4) boulder/bush, (5) water edge, (6) bridge planks, (7) small lantern, (8) garden/greenhouse walls, (9) tower/beacon silhouette, (10) two player silhouettes, (11) foreground detail. Map only to **real files found in the downloaded pack**. If any roles are absent, STOP at Gate A with missing-role list and 1–2 compatible CC0 options. Never invent a filename.
- Composition may reuse, crop, tint or scale licensed sprites but cannot invent key recognisable objects out of geometric shapes. Document crops/frames and show them in the contact sheet.
- Image smoothing: test both `pixelArt` true/false to preserve clarity at displayed scale; do not use a pixelated upscale that ruins hand-drawn ink. Keep texture sampling consistent.

**Level composition:** One legible, purposeful forest rather than a random arena. Calm clearing in left foreground; path snakes to central stream; a bridge and sluice near river; a garden near upper bank; beacon just beyond crossing. Avoid giant repeated wall tiles, noisy dot carpets, floating diamonds, glowing outline strokes, cyan diagonals and impossible clusters of disconnected objects. Camera should centre on player and reveal local areas naturally; no debug overlays. Foreground important objects larger and more readable than decorative foliage.

**Scene output validation:** Submit 1 desktop screenshot and 1 phone screenshot **from a running browser**, plus a crop of one player next to each important object. For each, report the manifest entries actually used. Never report a placeholder or reference image as an implemented screenshot.

## 6. Screen flow and meta UI

1. **TITLE:** `OUT OF SYNC` logo / `Elsewhere, Together` subtitle; Play, Audio toggle. Sketch forest visible behind title, not a debug menu.
2. **LOADING / FACT CARDS:** short, accurate, skippable facts, no more than ~2 seconds each; do not delay for network. Facts:
   - 'In the many-worlds interpretation, different outcomes are described as different branches.'
   - 'Decoherence helps explain why different macroscopic alternatives do not normally interfere.'
   - 'Symbiotic relationships can provide advantages, but also create dependencies.'
   - 'The Thread and reunion across realities are fictional mechanics in this game.'
   Cite sources internally in `docs/SCIENCE.md` (Stanford Encyclopedia of Philosophy many-worlds and decoherence; National Geographic symbiosis).
3. **CHOOSE:** Show both symbiotes *together* and user picks amber or blue/teal through two large portrait panels. Once selected the other runs agent code; same abilities for first build to avoid dual balancing. Single-player only. The true other symbiote cannot appear physically in-game post-separation until the ending.
4. **FIRST 30–45 SECONDS:** brief together moment, split event with pink glow, alone, environmental clue to nearest actionable lantern, subtle partner voice. Teach `move`/`interact` diegetically. No long tutorial, no numeric objective UI.
5. **EXPLORE:** only scene, tiny interaction caption, sound/touch controls; optional Call icon visible only when relevant; no archive, action logs, DRIFT/STRAIN bars, side columns, top 6-button toolbar, floating markers or fork modal. On each branch: ~0.5 second pink **screen edge** effect, a short sound, and visibly changed world state.
6. **ENDING:** success and fade have distinct ~8–15-second audiovisual resolutions. Both reveal the **post-game interactive archive**, where the player's path and counterpart's path are distinctly coloured, node details list observed cause/action/consequence, and click opens snapshot/event explanation. Then `RESTART` returns title or character choice.
7. **EASTER EGG:** One optional alien/uncanny reality: discoverable via the old echo stones after observing an intentionally repeated visual/sonic motif and interacting with a specific spot. Seeded, headlessly reachable and compatible with eventual normal endings. User approval for gating clue design at Gate C. Don't add 10 secrets.

**Meta effects:** clear UI = stable; slightly duplicated leaves/patterns or faint alternate silhouettes = moderate drift; desaturation, distant sound, mild abstraction = deep drift; ink bleed/ghost sounds = strain. Visual distortion must never erase navigational affordances, make text illegible, cause photosensitivity or block accessible controls. Set reduced distortion toggle in unobtrusive settings, default non-flashing except the single branch-edge pulse; no auto-blinking wall.

## 7. Sound (ElevenLabs-first but safe)

Required audible cues, with actual audio files bundled locally: `title_theme`, `partner_motif`, `fork_crack`, `lamp_lit`, `bridge_collapse`, `call_clear`, `call_distant`, `strain_warning`, `ending_converge`, `ending_fade`; short counterpart voice responses for clear/distant/help/refusal/final. Generate with ElevenLabs API *only through local developer tooling/server or build scripts; never expose API key in shipped JavaScript or commit it.* Pre-generate and cache assets; no high-latency live TTS required.

**Narrative audio:** partner motif attenuates as drift rises; connection attempts filter voice and overlay harmonics, not just volume changes. As players approach convergence the two motifs become musically compatible, then combine at reunion. At fade, the motif disappears first; silence is a deliberate warning. Provide subtitles for every voice line and independently adjustable music/SFX.

**No copyright-protected soundtrack imitation or unlicensed game samples.** If API credits cannot be accessed, agent must report unavailable assets and request a local generated file; may use clearly labelled temporary silence for a gate, but cannot claim final audio complete.

## 8. Mandatory HUMAN APPROVAL gates — stop, don't freestyle

Use a shared `docs/V3_APPROVALS.md` log with screenshots, implementation status and explicit user approvals. The agent cannot fill in the user's approval itself. A subagent can work on tests while visual work awaits response, but **cannot merge or ship an unapproved visual redesign**.

### Gate A — Asset choice and object inventory (~0–8 min)
Produce: sources and licences; actual imported file tree; contact sheet with 12–20 real assets as they would appear at game scale; asset-role table (forest, path, tree, lantern, bridge, greenhouse, beacon, characters); two *small* mock compositions if useful. **Show missing roles**, with explicit licensed replacements; never invent art. Ask: `Does this imported ink art family and set of objects look right? Reply APPROVE A or say what to change.`

### Gate B — One beautiful **playable** clearing (~8–25 min)
Produce: actual in-browser screenshot desktop and mobile; character moving in coherent forest, nearest lantern object clear; proper depth/collision; no extra UI clutter. Show exact asset count loaded. Ask: `Does this forest/character art, scale and composition pass? APPROVE B or corrections.` **Do not implement five additional zones while Gate B fails.**

### Gate C — One causal interaction and symbiotic feedback (~25–43 min)
Produce: 20–30 second screen recording or before/after screenshots of same seeded run. Need: lantern or bridge action -> pink edge flash -> local physical state changes -> player understands what changed -> partner voice responds only with information grounded in its local history -> explain actual cost. Demonstrate player cannot see real partner and bridge collision matches art. Show one sample archive record in dev diagnostics (not main UI). Ask: `Does this fork make sense without a mechanics menu? APPROVE C or corrections.`

### Gate D — Actual full story loop (~43–58 min)
Produce: start -> skippable facts -> choice -> separate -> two independent paths -> three landmarks -> convergence *or fade* -> interactive final archive -> restart, with at least one victory and one fade demonstrated using reproducible seeds. Show real screenshots of starting screens, later drift, ending and archive. Report audio files that actually played. Ask: `Does the full loop and difficulty feel right? APPROVE D or critical fixes.`

### Freeze (~58–60 min)
`npm run build`, `npm test`, run headless smoke, package browser build. Commit explicit known issues and approved final design; do not undertake new features. **Reserve 15 minutes after this for user-directed final edits and submission.**

If a gate is rejected, fix that gate rather than starting the next workstream. If deadline forces triage, user chooses between finishing with an approved simpler scene or cutting features, but the agent must not silently take a visual shortcut.

## 9. Test harness and balancing (do not game the percentages)

Create or update a CLI game simulator that invokes the **same reducer/engine** as Phaser, not a separate fake simulation. Add deterministic policies (`planner`, `guided_novice`, `mostly_calls`, `cautious_self`, `random_interactor`, `reckless`) with action availability driven by **locations, inventory and local observations**, never hidden state privileged to a novice. Multiple seeds (at least 100 for quick smoke, 500 only if fast enough). Log win, fade, timed-out, reachable next step, partner site readiness, anchor sequence, strategic action mix, and secret found. Add seed-specific replay files and event traces.

**Hard invariants:**
- The actual counterpart's `nodeId` never equals player's merely because `SEEK` fired, absent the final explicit overlap event.
- All cross-world effects are `ThreadMessage`/limited communication, not matter, resources or outcome forcing.
- An event flag changing traversal must change `isBlockedPx` / world nav constraints in both display and engine.
- No infinite stalling in reachable nonterminal states; 2–3 consecutive ineffective actions trigger meaningful hint/escalation/recovery. No softlock.
- Win requires independent partner progress at all 3 sites; no single-side instant 4-turn victory.
- Fade is reachable through normal non-reckless poor strategy after visible escalating warnings; no surprise insta-fade.
- An Easter egg is reproducibly reachable and doesn't prevent completion.
- Same seed + same actions produce same event records, archive paths, and ending.
- Archive player and partner trajectories are complete and nodes expand with actual causes.

**Quality targets, not blind optimisation:** planner >= 95% wins; guided novice high but needs multiple decisions; no single 'always assist' action wins every state; majority of uncompleted runs should fade or have an obvious recovery path instead of timing out; a real human should understand first useful action within ~30 seconds without reading Help. Do not modify scoring merely to make numbers attractive. Capture a short actual browser test for desktop and touch mobile, since CLI can't prove usability or art quality.

**Quick trace samples:**
- Opening lantern relight -> helpful call -> independently prepared garden -> bridge alternate path -> both reach beacon -> win.
- Self-first behaviour starves Thread -> explicit 2-stage warning -> failed call -> optional recovery -> fade if repeatedly ignored.
- Player loses bridge -> backtrack to source, retry different physical intervention -> new local route, still able to win.
- Partner declines dangerous request, stabilises itself, resumes when environment improves.
- Hidden alien branch reachable via old echo stones from an ordinary playthrough.

## 10. Implementation sequencing / parallel team discipline

**Lead agent** owns contracts, integration, gates, user confirmations, screenshots and final packaging. Subagents do NOT independently invent visuals/gameplay.

- **Art subagent:** download approved packs, inspect licence and filenames, import/manifests, contact sheet; cannot generate replacement art. Owns `public/assets/imported` + `src/assets/manifest.*`.
- **World/UX subagent:** `WorldScene.ts`, layout/collision, title/choice/end flows, tiny contextual controls; must use manifest sources, cannot edit sim rules.
- **Simulation subagent:** `src/sim/` causal rewrite, partner policy and history; no art edits.
- **Test/audio subagent:** CLI tests, deterministic traces, ElevenLabs cache, accessibility, browser smoke.

Start all agents on narrow tasks **after** lead explicitly fixes file ownership. Gate approval is lead-only; an approved screenshot must come from integrated code, not an isolated subagent mockup. Avoid file conflicts. Reuse existing repo to preserve Vite/Phaser build and tests. No Godot migration. No newly proposed framework.

## 11. Hard failure / scope cut order

If time is short, cut in this order: (1) advanced distortion, (2) secret alien branch, (3) background variants beyond two or three, (4) intricate archive animations, (5) multiple ElevenLabs voice variants. **Never cut:** imported approved sketch assets, understandable interaction, real local cause/effect and collision, title/choose/separation, actual independent partner, two endings, archive at end, browser test and packaging.

## 12. Final acceptance checklist

- [ ] Asset licenses verified; actual imported files in repo and manifest; user approved Gate A.
- [ ] One clean coherent forest, recognisable landmarks, no procedural 'chalk' substitute; user approved Gate B.
- [ ] Physical local choice and understandable consequence, no resource teleport, no direct partner sight; user approved Gate C.
- [ ] Title, facts, choose, explore, pink flash, win/fade, final clickable archive, restart; Gate D approved.
- [ ] Partner history complete and independent; world appearance and collision agree.
- [ ] CLI smoke tests run and results preserved; seed for win, fade and secret recorded.
- [ ] Actual browser desktop and mobile tested; all core interactions discoverable.
- [ ] ElevenLabs assets pre-generated and audible if configured, secrets not in frontend.
- [ ] `npm run build` and `npm test` pass; static web package has `index.html` at root; submission prepared.

## Sources and fact-checking

- Licensed art: https://kenney.nl/assets/scribble-dungeons ; https://opengameart.org/content/ink-hand-drawn-forest-tileset ; https://kenney.nl/assets/scribble-platformer
- Quantum interpretation and decoherence: https://plato.stanford.edu/entries/qm-manyworlds/ ; https://plato.stanford.edu/entries/qm-decoherence/
- Symbiosis: https://education.nationalgeographic.org/resource/symbiosis-art-living-together/
- Art inspiration ONLY, not direct game asset license: https://gatlingart.itch.io/100dwarffaces

**V3 sign-off principle:** If the user says 'it still looks like a debug screen', 'I don't understand what I'm doing' or 'that sacrifice makes no sense', the gate is **not approved**, regardless of passing unit tests. Beautiful, coherent, and playable beats theoretically sophisticated but unintelligible.
