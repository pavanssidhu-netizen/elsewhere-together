# ELSEWHERE, TOGETHER — Implementation Specification

**Five-hour ElevenLabs symbiosis game jam | Web-only | Single-player first | Pixel art + meta-interface**

**Version:** 1.0 — execution brief for a coding agent or coding-agent team  
**Target:** A polished, complete, 5–8-minute browser game playable on a laptop and phone, with a memorable 30-second demo and one successful ending.  
**Recommended implementation:** **TypeScript + Phaser 3 + Vite + HTML/CSS**. Phaser owns the pixel-art playfield; DOM/CSS owns the OS-like shell, branch archive, dialogue, accessible controls, and responsive layout. Web Audio API owns adaptive effects and soundtrack mixing. No server is required at runtime.

## 0. Product definition and non-negotiables

### One-sentence pitch

Two small beings exist in diverging versions of the same place. You can bias the uncertain events that split reality, but helping yourself can hurt your symbiotic partner. Navigate a growing causal archive, keep the bond alive, and align three shared anchors to reach a world in which you can both survive.

### Core identity

This is **not** a combat platformer with a multiverse skin. It is a small, top-down exploration adventure presented as **an unstable computer interface** used to observe and communicate across branching worlds. The UI expresses the state of your character: when reality drift or symbiotic strain rises, the shell itself begins to feel unreliable. The underlying controls must remain reliable.

### Must ship

1. One directly controlled sprite, smoothly moving in one compact pixel-art town.
2. One autonomous, voiced symbiotic counterpart with comprehensible goal-directed decisions.
3. At least **five event templates** producing two alternative outcomes, with seeded reproducibility and persistent causal history.
4. Two actions at relevant forks: **SELF** (favour own outcome) and **ECHO** (send partner an advantage while personally accepting a disadvantage).
5. An accessible, useful **branch archive** with causal logs and ability to retrace visited nodes.
6. Two distinct risks: **reality drift** and **symbiotic strain**, visible primarily through audio/visual feedback and secondarily in diagnostics.
7. Three shared anchors and an achievable, narrated convergence ending; no unwinnable softlocks.
8. Adaptive ambient music, ElevenLabs-generated partner voice lines, and event sound effects.
9. Mobile/desktop responsive input, subtitles, mute, reduced-motion mode, browser refresh persistence.
10. Works from a **web build** with root `index.html`; no exposed API secrets, no live external dependency during gameplay.

### Do not build

Networked multiplayer; procedural art models at runtime; full quantum simulation; physics-based combat; live ElevenLabs calls from the published browser; giant map; comprehensive inventory; draggable overlapping windows on mobile; deeply autonomous LLM character; exponential rendering of complete alternate worlds; complicated breeding/genetics simulation.

## 1. Technology choice

| Option | Advantage | Risk in this particular five-hour jam | Decision |
|---|---|---|---|
| **Phaser 3 + DOM/CSS** | Tiny web package; pixel canvas; fast custom OS panels; straightforward responsive layout and browser audio | Need to manage game/DOM state separation | **Preferred** |
| Godot 4 web export | Strong 2D scene editor, tilemaps, animation, signal system | More overhead in project/export/UI integration if unfamiliar; separate web-export and browser checks | Use if builder already moves faster in Godot |
| Plain HTML Canvas + DOM | Few dependencies, complete interface control | Must author movement, animation, collisions and camera primitives | Emergency fallback |

If Godot is chosen, use the **Compatibility** renderer and **single-threaded web export**; test on the exact target mobile browser early, not in the last hour. Keep the same data contracts and design principles below. The spec defaults to Phaser so one builder can execute immediately.

## 2. Art direction and narrative

**Setting:** A rain-soaked coastal town at twilight, seen through an old branching-reality observation console. Familiar objects recur with differences: a lamp is lit or broken; a bridge is intact or flooded; a train signal receives a message or fails; a greenhouse lives or withers; a lighthouse shines or goes dark.

**Characters:** Two small, almost-human wanderers, both hosting halves of the same fictional symbiotic organism, **The Thread**. The player is amber; the partner is cyan. No obvious mushroom/algae aesthetic. Each is 12–16 pixels tall at base resolution, expressive through silhouette, eyes, idle animation, and colour. Their relationship has mutual benefit, loss of autonomy, and shared vulnerability. Avoid portraying this fictional organism as literal biology or cross-branch signalling as established physics.

**Palette:** Midnight navy `#111626`, deep blue `#1b263b`, faded teal `#4c8790`, pale mist `#b2c4ce`, amber `#e6b66e`, cyan `#7be0df`, violet `#a89bdb`, warning coral `#e47f7c`. Keep bright colours reserved for signals, anchors, beings and branch edges. Pixel nearest-neighbour sampling; no blurry upscale.

**Visual design:** Screen is a stylised old system, not a realistic Windows clone. Pixel-styled panels with tasteful modern legibility. A small `ECHO/OS` title bar, a main `WORLD_VIEW` viewport, a `THREAD_LINK` transceiver, `EVENT_LOG`, and `BRANCH_ARCHIVE` access. UI feels like an instrument for peering into another reality.

**Narrative beats:**
- Boot: `CONNECTING TO BRANCH 000... TWO SIGNATURES DETECTED.`
- First event: lantern outcome differs, player realises possible worlds have diverged.
- First ECHO: player knowingly sacrifices own route, partner gets safer route; bond speaks.
- Midgame: archive history grows, later events reference earlier ones, drift becomes tangible.
- Last anchor: the connection requires **both** beings to remain viable and neither to absorb all costs.
- Ending: two melodies resolve, the separate windows align into one scene, Thread forms a visible bridge between both sprites. Text: `WE DIDN'T FIND THE SAME WORLD. WE MADE ROOM FOR EACH OTHER.` (This is poetic fiction, not a physics claim.)

## 3. Presentation: hybrid pixel world + meta-interface

### Desktop layout (landscape, >= 850px)

```text
┌────────────────────── ECHO/OS   //  SESSION 07   [music] [help] ──────────────────────┐
│  WORLD_VIEW / BRANCH #A12                      │  THREAD_LINK / PARTNER: CYAN          │
│ ┌────────────────────────────────────────────┐ │  SIGNAL: faint / readable / broken      │
│ │                                            │ │  [CALL]  [FIND ME] [STAY SAFE] [HELP] │
│ │     320x180 BASE PIXEL ART GAME WORLD      │ │  "I can see your light..."             │
│ │       Player sprite, objects, anchors      │ │                                         │
│ │                                            │ ├─────────────────────────────────────────┤
│ └────────────────────────────────────────────┘ │  CAUSAL LOG                              │
│   [INTERACT E]   [MAP TAB]   [RETRACE R]      │  #12  Lantern / survived -> rain diverted│
│                                               │  #13  Radio / lost    -> signal weak     │
│                                               │  [OPEN ARCHIVE]                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
  Thin system status strip: environmental audio, three anchor glyphs, status warnings.
```

### Mobile layout (portrait ~360x740)

A single primary viewport (~320:180 aspect ratio), with compact title bar and accessible touch controls. Transceiver sits immediately below the game. `WORLD`, `ARCHIVE`, `LINK` are full-width tabs or a bottom navigation; no multiple overlapping OS windows. Touch D-pad or left-thumb virtual stick; dedicated `ACT`, `CALL`, and `ARCHIVE` buttons >=44 CSS px. Use larger pixel art and fewer text columns. The archive opens as a full-screen, vertically scrollable tree/list view with a clear Back button. Rotating the device must not corrupt game state.

### Meta-interface cues — driven by actual state

| Trigger | In-world cue | Meta-interface cue | Audio cue |
|---|---|---|---|
| Drift 0–29 | Coherent town | Stable window borders | Warm two-layer music |
| Drift 30–59 | Brief alternate-world ghost overlay | Occasional duplicate log entry marked `?` | Narrowed partner voice, slight low-pass |
| Drift 60–79 | Faraway lamps flicker, extra shadow traces | Decorative panel edge misalignment; alternative node ghost | Detuning and echoes, still intelligible |
| Drift 80–100 | Brief glimpse of impossible street layout | `UNCONFIRMED SIGNAL` text; branch map visual noise | Distinctly distant voice and tension |
| Strain 30–59 | Thread frays | Partner messages appear delayed | Second music layer out of sync |
| Strain 60–79 | Thread pulses unevenly | Two conflicting intentions shown side by side | Rhythmic heartbeat under music |
| Strain 80–100 | Thread looks dangerously thin | Warning panel reads `LINK OVERDRAWN` | Sharp low pulse, restrained melody |

**Accessibility invariant:** Never shift hitboxes; never change clickable button positions mid-interaction; no rapid strobing; all warnings also in text; never corrupt real save data or actual browser files; provide `Reduce visual distortion` and `Mute` controls. Keep dynamic text readable against background. All ambience starts only after a user gesture.

### Archive UX

Desktop: map overlay anchored to a dedicated panel, with zoom and pan if time permits; mobile: full-screen page. Each node shows its ID, event icon, branch tint, visited/available/unvisited state and speaker position. Clicking a node displays **event → outcome → causal reason → delta to world → who paid → drift/strain after action**. A marked `RETRACE` action is allowed for visited ancestors, paying a small stability/bond cost. Preserve the true history; retracing does not erase old outcomes. A user can see why the town changed.

## 4. Core simulation: small emergent branches, bounded implementation

### Fundamental rule

Worlds branch when an uncertain **event** resolves, not when the player chooses a colour-coded door. The player may intervene, favouring an outcome for self or partner. Five small event templates vary according to world properties and prior events, producing many understandable paths without generative LLM content.

### World properties

Integers clamped 0–3: `light`, `water`, `structure`, `signal`, `growth`; `instability` clamped 0–100; stable anchor IDs array. Visual scene overlays and interactables derive from these properties, so revisiting a node actually reconstructs its world.

### Deterministic generation

- Initial seed e.g. `48219`; seeded PRNG (`mulberry32` or `xorshift32`).
- Event instance seed = stable 32-bit hash of `(gameSeed, worldNodeId, eventTemplateId, occurrenceIndex)`.
- A fork produces exactly two immutable child outcomes. The engine creates/records both as potential nodes, renders only the active child, and marks the other as accessible from its parent through retracing/re-observation.
- Never call `Math.random()` inside simulation. Use `Date.now()` only for animation/UI, not resolving outcomes or agent decisions.
- A maximum of **32–48 archived nodes** in the hackathon version. When near cap, stop producing optional events; keep required anchor events available. The UI never needs to render all worlds simultaneously.
- World changes in 1–2 properties per event. Subsequent event text and consequences reference state, e.g., high water makes bridge collapse more consequential; low signal makes communication noisy. Use deterministic fallback text if a state combination is unsupported.

### Event catalogue (initial five)

| ID | Scene cue / uncertain event | Outcome A | Outcome B | Follow-on consequence |
|---|---|---|---|---|
| `lantern` | Suspended lamp swings in wind | Lamp survives, `light+1`, `signal+1` | Breaks, `light-1`, `instability+12` | Signal strength and route visibility |
| `bridge` | Rain-strained wooden crossing creaks | Holds, `structure+1`, route opens | Collapses, `structure-1`, `water+1`, route closes | Forces alternative route or ECHO |
| `radio` | Emergency tower transmission resolves | Message received, `signal+1` | Lost, `signal-1`, `instability+8` | Counterpart voice quality; archive trace |
| `greenhouse` | Seedbed germinates under uncertain weather | Grows, `growth+1`, `water-1` | Withers, `growth-1`, `water+1` | Anchor #2 environmental gating |
| `tide` | Storm surge rises or recedes | Recedes, `water-1`, coast path opens | Rises, `water+1`, coast path closes | Lighthouse access; altered backdrop |

Time-based atmospheric events can queue every 40–75 seconds but **must not interrupt archive or dialogue**, and must never make progress impossible. The minimum build may be interaction-driven only; 'spontaneity' comes from ambient staged events and cascading world effects, not endless random branching.

### Event interaction contract

1. Trigger event by approaching a marked object and pressing `ACT`, or by a non-blocking periodic atmospheric cue.
2. Show a short two-outcome preview as a **waveform**/probability haze, without guaranteed probabilities. Label choices according to impacts, not prophecy.
3. Default `LET IT RESOLVE`: sample an outcome using seeded PRNG. `BIAS FOR SELF`: choose the player-favourable outcome, incur small Thread cost. `ECHO TO PARTNER`: accept the less favourable local child, grant one partner echo credit targeting its next relevant action. There must always be a visible difference between these controls.
4. Write event log and child node states atomically; animate world transformation.
5. Advance counterpart action once after major event; evaluate anchor and win conditions.

For time constraints, the fork UI can offer just `SELF` and `ECHO`, plus `LET GO` as the neutral/default action if the third option is ready. **Never invent exact quantum probabilities**: it is a fictional game abstraction of uncertain outcomes.

### SELF versus ECHO — non-overlap and real trade-off

- **SELF:** player moves into the locally favourable outcome; player progress improves; partner's world is not directly altered; `strain +2`, drift recalculates.
- **ECHO:** player accepts the locally unfavourable outcome; one `EchoCredit` is queued for the partner with a target type (bridge, signal, resources); `strain +12` upfront and partner receives a +1 improvement on a matching future action or immediate recovery when needed. The agent cannot apply an echo more than once. It may change the partner's next branch/action, not teleport them into the player's child world.
- **Recover bond:** at designated safe points/anchor terminals spend a turn doing no event action, reducing strain 12 and optionally enabling partner to stabilise. This creates an explicit non-sacrifice choice; ECHO cannot be spammed as the always-best solution.
- If partner is already safe, ECHO should sometimes be inefficient. User sees what was sacrificed and gained.

### Drift and strain

Keep the risks independent and clamp to 0–100.

```
lineageDistance = depth(playerNode) + depth(partnerNode)
                  - 2 * depth(LCA(playerNode, partnerNode))
stateDifference = sum(abs(playerWorld[k] - partnerWorld[k]) for
                      k in [light,water,structure,signal,growth])
realityDrift = clamp(8*lineageDistance + 3*stateDifference
                     - 12*sharedAlignedAnchorCount, 0, 100)
```

`bondStrain` is a resource-like value changed by sacrifice, conflict and stabilisation; it does not equal drift. Agent/anchor actions may reduce drift via moving towards an ancestor, stabilising both world properties, and activating shared anchors. All costs and benefits displayed in short language; complex numbers can live in details panel.

**No unwinnable states:** At any time the player can access the archive, retrace to a visited ancestor, or stabilise at an accessible safe zone. Bond strain never permanently disables input or the story. If drift is 100, allow guaranteed ancestral retrace. At least one reachable path to an uncompleted anchor must remain open.

## 5. Counterpart agent (autonomous, not networked)

The partner exists in a **separate branch node**, with an internal position and goals, but does not require a second fully rendered physics simulation. Each significant player event advances the partner by one discrete action. Its movements appear through event log entries, dialogue, a mini silhouette/portrait and branch map nodes.

### Goals and preferences

Goal scores recomputed on each agent turn:

```
seek_player     = 45 + 0.45*drift - 0.2*strain
stabilise_self  = 25 + 0.75*strain + hazardScore
assist_player   = 20 + 0.25*drift + (playerBlocked ? 25 : 0)
advance_anchor  = 25 + (eligibleAnchor ? 45 : 0)
```

Add deterministic seeded tie-breaking within a small bound; choose maximum feasible action. Respect user intention (`FIND ME`, `STAY SAFE`, `HELP MY WORLD`) by adding 10–20 to corresponding score, **not** unconditional obedience. After a user request the partner should usually attempt the requested action, but can explicitly refuse when dangerous. The agent's action must write a log, visibly change either partner world, branch, anchor, or the link, and occasionally produce a voiced response.

**Failure mode:** If the agent cannot find a valid event, select `STABILISE`, lower strain and emit an explanatory line. Never stall anchor progression. Agent action consumes one pending ECHO credit only when there is a relevant benefit; otherwise carry credit up to the next valid turn. Cap queue at 2.

### Partner lines to pre-render through ElevenLabs

- Boot: “I can hear you. I don't know where you are.”
- Find: “I'll follow the strongest trace. Just keep the light on.”
- Safe: “I'm staying here for a moment. This world is holding.”
- Help: “I can reach towards your path. It'll cost me.”
- ECHO received: “You gave that up for me? I felt it.”
- Divergence: “There are too many versions of your voice.”
- Overstrain: “Please. We can't keep borrowing from tomorrow.”
- Anchor: “I found it. Something here remembers us both.”
- Final: “There you are.”

All lines also appear as subtitles. One voice suffices; optionally a whisper/reversed variant for instability. Avoid generating TTS in response to every movement. Throttle repeated lines and do not interrupt story-critical lines.

## 6. Three-anchor progression and completed demo

A **shared anchor** is a location/phenomenon present across branches whose condition can be stabilised cooperatively. Each anchor has local player task + partner task + maximum strain to lock, and must visually show progress.

| Anchor | Location | Player requirement | Partner requirement | Teaching moment |
|---|---|---|---|---|
| **1. The Lantern** | Town square | Restore a useful light/signal through a fork | Partner gets an echo or stabilises its matching signal | You cannot save every outcome; sacrifice can matter |
| **2. The Greenhouse** | Overgrown garden | Resolve water/growth conflict and restore plants | Partner contributes a stable route/resource | Shared strengths need both sides; over-helping creates strain |
| **3. The Lighthouse** | Coastal path | Reach beacon with manageable drift | Partner reaches compatible signal state | Together requires **both** world compatibility and a healthy bond |

Suggested final condition: all three anchor IDs `aligned`; `realityDrift <= 35`; `bondStrain <= 55`; partner `alive/stable` flag true; player at final beacon. If conditions are not met, give an exact actionable hint: `RETRACE TO AN EARLIER SIGNAL BRANCH` or `REST AT A THREAD TERMINAL TO LOWER STRAIN` — not generic `LOCK FAILED`.

**Expected happy-path loop:** boot → walk/interact lantern → self/echo decision → counterpart reply → archive reveals diverging traces → visit greenhouse & send resource → one bond recovery → lighthouse event → shared anchor convergence → short visual/audio ending → play again. The game is completable from starting seed in 5–8 minutes.

### Seeded tutorial sequence

To guarantee a compelling demo, script the **first three event opportunities** (template and position, not necessarily outcomes), then let subsequent events be drawn from seed. First anchor grants a free retrace to teach archive. The overall system is deterministic; a test harness can replay a known winning path.

## 7. State and TypeScript contracts

Define these types in `src/sim/types.ts` and do **not** let Phaser objects or DOM elements enter persistent simulation state.

```ts
type ActorId = 'player' | 'partner';
type Choice = 'LET_GO' | 'SELF' | 'ECHO';
type Goal = 'SEEK' | 'STABILISE' | 'ASSIST' | 'ANCHOR';
type Intention = 'FIND_ME' | 'STAY_SAFE' | 'HELP_MY_WORLD';
type WorldStat = 'light' | 'water' | 'structure' | 'signal' | 'growth';

type Stats = Record<WorldStat, number> & { instability: number };
type Delta = Partial<Record<keyof Stats, number>>;

interface EventTemplate {
  id: string;
  label: string;
  triggerObjectId: string;
  requires?: Partial<Record<WorldStat, { min?: number; max?: number }>>;
  outcomes: [
    { id: 'A'; text: string; delta: Delta; flags?: string[] },
    { id: 'B'; text: string; delta: Delta; flags?: string[] }
  ];
  selfPreferredOutcome: 'A' | 'B';
  echoKind: 'signal' | 'structure' | 'water' | 'growth';
}

interface EventRecord {
  eventInstanceId: string;
  templateId: string;
  actorId: ActorId;
  parentNodeId: string;
  childNodeIds: [string, string];
  activeChildNodeId: string;
  selectedOutcome: 'A' | 'B';
  choice: Choice;
  effects: Delta;
  echoId?: string;
  reason: string;
  turnNumber: number;
}

interface BranchNode {
  id: string;
  parentId: string | null;
  depth: number;
  eventInstanceId: string | null;
  outcomeId: 'A' | 'B' | null;
  world: Stats;
  flags: string[]; // e.g. BRIDGE_OPEN, GREENHOUSE_STABLE
  visitState: 'POTENTIAL' | 'VISITED';
  children: string[];
}

interface EchoCredit {
  id: string;
  from: ActorId;
  to: ActorId;
  kind: 'signal' | 'structure' | 'water' | 'growth';
  strength: 1;
  createdTurn: number;
  consumed: boolean;
}

interface ActorState {
  id: ActorId;
  nodeId: string;
  x: number;
  y: number;
  stable: boolean;
  lastGoal?: Goal;
}

interface AnchorState {
  id: 'LANTERN' | 'GREENHOUSE' | 'LIGHTHOUSE';
  playerReady: boolean;
  partnerReady: boolean;
  aligned: boolean;
}

interface SimulationState {
  version: 1;
  seed: number;
  turn: number;
  nodes: Record<string, BranchNode>;
  events: EventRecord[];
  player: ActorState;
  partner: ActorState;
  bondStrain: number;
  realityDrift: number; // recompute after every state change
  echoCredits: EchoCredit[];
  anchors: AnchorState[];
  intention: Intention;
  phase: 'BOOT' | 'EXPLORING' | 'FORK' | 'ARCHIVE' | 'ENDING';
  seenDialogueIds: string[];
}
```

### Reducer commands

All game changes go through a single pure-ish reducer receiving a seed-controlled RNG and returning `nextState` + emitted domain events:

```ts
type Command =
  | { type: 'RESOLVE_FORK'; eventInstanceId: string; choice: Choice }
  | { type: 'REQUEST_PARTNER'; intention: Intention }
  | { type: 'ADVANCE_PARTNER' }
  | { type: 'RETRACE'; targetNodeId: string }
  | { type: 'REST_AT_TERMINAL' }
  | { type: 'ACTIVATE_ANCHOR'; anchorId: AnchorState['id']; actor: ActorId }
  | { type: 'RESTART'; seed: number };
```

`SimEngine.dispatch(command)` validates invariants, appends atomic event records, recomputes drift and tests win state. UI subscribes to `stateChanged` and `domainEvents`. Persist JSON to localStorage after major actions; validate `version` on restore and offer new game if corrupted. Animation states do not go into save JSON.

### IDs and reproducibility

IDs must be deterministic within one save: `root`, then `${parentId}/${eventInstanceId}/A` and `/B`. To avoid recursive string growth, also assign a fixed counter ID (`N00012`) from an event sequence or stable hash. For tests, same seed + same series of commands must yield byte-for-byte equivalent normalized state excluding UI timestamps.

### Simulation invariants

- A branch node is immutable after creation; no deleting historical events when retracing.
- Exactly one parent except root; graph contains no cycles.
- Every event creates exactly two child outcomes; parent and active child are valid.
- `player.nodeId` and `partner.nodeId` always reference existing nodes.
- `0 <= bondStrain, realityDrift <= 100`; all environmental stats clamped.
- Echo credits are consumed at most once; prevent ECHO action at maximum queued capacity gracefully.
- Player position never loads inside blocked collision tiles; use spawn markers by branch state.
- Anchors never revert from aligned to unaligned; otherwise end condition can regress invisibly.
- No branch, agent decision or archive operation requires a network call.

## 8. Phaser scene and rendering

- Base virtual resolution: **320×180** world pixels (optional 384×216 if sprite readability needs room); integer upscale nearest-neighbour. Avoid camera zoom creating subpixel movement blur. Prefer landscape world canvas inside responsive aspect-ratio box even on portrait phone.
- World map: one compact 24×14 tile scene. Use a single source tile sheet for road, water, wall, fence, bridge, trees, lamp, greenhouse and lighthouse. World `Stats` toggle overlays, obstacles and hotspots. Do not build five separate maps.
- Character: 12×16 amber, idle (2 frames) and walk (4 frames). Counterpart: cyan silhouette shown in comms pane and briefly as transparent echo in world at anchor events; doesn't need second full scene.
- Controls: desktop WASD/arrows to move, E/Space to interact, Tab/M to archive, C to call, R to retrace when highlighted, Esc to close overlay. Avoid browser scroll interception when input isn't focused. Mobile D-pad/stick and large action buttons.
- Move speed: ~58 virtual px/s; collision with tilemap; interaction radius ~18 px; interactables visibly pulse. At most two active interactables at once, nearest gets focus.
- World redraw on branch traversal: **0.3–0.6 second crossfade** between pixel palettes and overlays; show event outcome label. Branch transitions have audio sting and archive node addition.
- Performance: no heavyweight particles or full-screen shader dependency. CSS overlays and Web Audio provide most meta effects. Aim 60 FPS desktop, >=30 FPS modest mobile, no game logic tied to frame rate.

## 9. Adaptive audio and ElevenLabs production

### Asset strategy

**Generate audio at build time** using the supplied private API key, save files in `public/assets/audio/`, then ship them locally. The browser must not contain `ELEVENLABS_API_KEY` or send privileged calls. Keep source WAV where convenient; convert/compress for web. Validate terms and attribution requirements for selected models/assets before submission. Do not hardcode secret values in git, bundle or screenshot.

### Exact ElevenLabs APIs (verify availability in account)

- Text to Speech: `POST /v1/text-to-speech/{voice_id}` for nine partner voice lines.
- Sound effects: `POST /v1/sound-generation` for five to eight short cues.
- Music: `POST /v1/music` for two instrumental themes; use composition controls / `force_instrumental` where supported by the selected API variant. No vocals in music.

Source docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert ; https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert ; https://elevenlabs.io/docs/api-reference/music/compose

### Music production prompt (original composition)

**Shared musical direction:** "Original instrumental minimalist pixel-adventure soundtrack, rainy coastal town at twilight, melancholic but hopeful, 84 BPM, D minor resolving to F major, gentle felt piano, glassy synthesized bell, restrained 8-bit pulse texture, subtle tape hiss, spacious game ambience, no percussion-heavy drop, no voice or lyrics, clear melody that could blend with a second complementary piece, loopable 25–45-second structure." Avoid referencing copyrighted songs or specific artists.

**Amber / player theme:** foreground felt piano melody, warm low synth bed, subtle rhythmic pulse.  
**Cyan / partner theme:** sparse glass bells with complementary harmony and roomy air, fewer low frequencies.  
**Convergence theme:** optional final 15-second resolved cue if time/credits permit; otherwise play both normal layers together at full harmony with an ending sting.

**Practical warning:** Two independently generated music tracks may *not* have compatible pitch, tempo or bars just because the prompts ask for them. Audition and manually align, or use a single generated loop plus stem-like filtering/doubled melodic elements. In the minimum build, use **one** strong music loop plus generated partner motif/stings instead of forcing incompatible loops.

### SFX prompts

1. `branch_split`: "Short delicate reality bifurcation, a single glassy bell cracking into two reversed shimmering echoes, 1.5 seconds, no music, no speech".
2. `echo_send`: "Soft warm energy pulse traveling through an organic thread, delicate synth shimmer and close resonant heartbeat, 1 second".
3. `archive_open`: "Low vintage computer interface wakeup tone and subtle paper-like digital flutter, 1 second".
4. `anchor_lock`: "Hopeful ascending three-note glass harmony, long luminous tail, 2 seconds, no speech".
5. `drift_warning`: "Distant radio signal falling out of tune, gentle tape warble, non-harsh, 2 seconds".
6. `final_merge`: "Warm resolved holographic chord rising and settling like a lighthouse beam, cinematic but intimate, 3 seconds".

### Audio graph

```
Ambient loop ─┬─ Gain(main) ─ Lowpass(drift) ─ master
Partner motif ├─ Gain(partner; reduce with drift) ─ Delay(drift) ─ master
Voice samples └─ Gain(voice) ─ Lowpass(drift) ─ master
SFX samples ─────────────────────────────────────── master
```

- `AudioContext` unlocks on Start / first touch; sound defaults on after opt-in.
- Crossfade mixing changes over 250–700 ms, never abrupt volume jumps.
- Drift filters partner VO moderately while **subtitles remain pristine**. At extreme drift, don't make an important instruction unintelligible; play a shorter line and provide log transcript.
- Strain affects harmonic interference/heartbeat rhythm rather than sounding identical to drift.
- Cap voices one at a time; prioritise anchor and narrative lines over incidental calls.
- Provide volume and mute controls. If any assets are missing, synthesise simple bleeps via Web Audio and fall back to on-screen text; the game remains playable.

## 10. Project structure and subagent assignment

```text
elsewhere-together/
  index.html
  package.json
  vite.config.ts
  src/
    main.ts                 # app bootstrap, service wiring
    sim/
      types.ts
      engine.ts             # state reducer, commands, events, saves
      events.ts             # five event templates
      rng.ts                # seeded random + deterministic ids
      branches.ts           # lineage, LCA, archive, retrace
      agent.ts              # partner utility policy
      anchors.ts            # progression, gates, victory
      tests/                # deterministic simulation tests
    game/
      GameScene.ts          # Phaser scene, map, movement, interactables
      worldRenderer.ts      # visual variants from world state
      sprites.ts            # sprites/atlas references
    ui/
      shell.ts              # DOM shell and navigation
      archive.ts            # causal tree and node detail
      comms.ts              # intentions, transcript, dialogue
      metaEffects.ts        # CSS state-driven distortion
      input.ts              # keyboard + touch bindings
      styles.css
    audio/
      audioEngine.ts        # Web Audio mixer / caching / voice events
    content/
      dialogue.ts
      tutorial.ts
  public/assets/
    sprites/                # original PNGs
    audio/                  # pre-rendered ElevenLabs files
  scripts/
    generate_audio.py       # local build-time only, reads env
  README.md
```

Suggested parallel work **after interfaces are fixed**:

- **Agent A (simulation lead):** types, deterministic world forking, archive graph, partner policy, progression, unit tests. Own public state contract.
- **Agent B (presentation):** Phaser movement/scene and DOM responsive shell, archive UI, meta effects. Mock engine state allowed before merge.
- **Agent C (audio/assets):** ElevenLabs asset script, original pixel-art sprites/tiles, audio mixing/fallbacks and build compression.
- **Integrator (primary agent):** app boot, game/DOM/engine integration, end-to-end tests, performance, deployment.

No agent may independently redefine types; share the single `src/sim/types.ts` before parallel implementation. Each agent makes changes in its own files; avoid multiple simultaneous edits to `main.ts` or `styles.css`. If only one coding agent is available, complete vertical slices: a working boot/move/interact/archive before polishing art/audio.

## 11. Five-hour build schedule (hard gates)

| Time elapsed | Required outcome | Gate / what to cut if late |
|---|---|---|
| **00:00–00:30** | Vite boot, Phaser visible, shell responsive, mock character moves with keyboard and touch | If this fails, simplify to plain Canvas + DOM |
| **00:30–01:30** | State engine, five event templates, actual two-outcome forks, persistent log, branch tree + retrace | Prioritise actual causal history over visual tree polish |
| **01:30–02:30** | Partner agent actions, SELF/ECHO costs, drift/strain, three anchor checks, finishable win sequence | If late, script partner action sequences and reduce event count to three |
| **02:30–03:30** | Original pixel art and ElevenLabs voice/SFX/music assets imported; audio responsive to state | One loop, five voice lines, three SFX still satisfies essentials |
| **03:30–04:15** | Meta-effects, responsive UI, branching archive node details, complete tutorial | Avoid adding features; focus on readability and dramatic cues |
| **04:15–05:00** | Play complete seed, mobile browser test, sound-on test, save/reload, zip, submit | Stop features; fix blockers; verify package contents |

**Critical rule:** A playable build with a valid ending must exist by ~02:30. The last 45 minutes are for testing and packaging, not new mechanics. Prioritise reliable flow over breadth. This clock is relative to build start, not a promise that work will finish automatically.

## 12. Automated and manual testing

### Unit tests (Vitest or equivalent)

1. **Determinism:** Same seed and same ordered commands produce identical state and branch archive.
2. **Fork correctness:** Each event creates two different children, one active, with valid parent pointers and clamped stats.
3. **History persistence:** Retrace does not delete old node, change historical event, or create graph cycles.
4. **Distinct risks:** ECHO raises strain without necessarily reducing drift; SELF can reduce local obstacle but doesn't directly grant echo.
5. **ECHO conservation:** one echo consumed at most once; queue capacity protected.
6. **Agent progress:** every valid partner turn either changes its state or logs an intentional stabilise action; no infinite loop.
7. **Softlock prevention:** A critical-drift state can retrace; a critical-strain state can recover; each anchor remains achievable.
8. **Win gating:** early victory rejected; all anchors + drift/strain limits + final beacon lead to ending.
9. **Save/restore:** round trip maintains active branches, event log, aligned anchors, seed and turn number.
10. **UI purity:** no gameplay outcome depends on wall clock, CSS animation or audio availability.

### Manual acceptance on laptop and phone

- Start screen, at least one visible sprite, no blank screen or uncaught error.
- Move, interact, choose SELF, watch the world change; archive shows both potential outcomes.
- Choose ECHO, witness **measurable advantage for partner** and cost for player; hear or read partner response.
- Open archive, inspect why a branch happened, retrace, return to world with correct appearance.
- Experience mid/high drift and strain without text becoming unreadable or inputs shifting.
- Complete all three anchors and see ending with two sprites/melodies uniting.
- Toggle mute, reduce motion, touch buttons, portrait layout and reload persisted run.
- Disable internet after page load: game continues. Missing sound file: text and visual feedback still function.
- Mobile iOS Safari and Android Chrome if available; otherwise test Chrome mobile emulation plus one physical phone and state limitation honestly.
- `npm run build` succeeds, root `index.html` found, assets resolve with relative paths in a static host, no API key in built files, total package stays comfortably under event file-size limits.

### Demo test (30 seconds)

Open on player near lantern, rain and two character signatures visible. Player resolves `ECHO`, the lantern splits into one intact and one shattered possibility, player remains in darker world, partner receives a path. Archive visibly forks. Partner whispers, "You gave that up for me? I felt it." Fast-forward or demo seed shows lighthouse and convergence. This clip should communicate **symbiosis, reality branching, meta-interface, and ElevenLabs** without needing a lengthy explanation.

## 13. Implementation-order pseudocode

```ts
function resolveFork(state: SimulationState, template: EventTemplate, choice: Choice) {
  assert(state.phase === 'FORK');
  const parent = state.nodes[state.player.nodeId];
  const deterministicRoll = roll(state.seed, parent.id, template.id, state.turn);
  const defaultOutcome = deterministicRoll < getOutcomeWeight(parent.world, template) ? 'A' : 'B';
  const selectedOutcome =
    choice === 'SELF' ? template.selfPreferredOutcome :
    choice === 'ECHO' ? opposite(template.selfPreferredOutcome) : defaultOutcome;

  const [childA, childB] = makeImmutableChildren(parent, template, state.turn);
  const next = appendChildrenAndEvent(state, childA, childB, selectedOutcome, choice);
  next.player.nodeId = selectedOutcome === 'A' ? childA.id : childB.id;

  if (choice === 'SELF') next.bondStrain += 2;
  if (choice === 'ECHO') {
    next.bondStrain += 12;
    next.echoCredits.push(makeEcho(template, state.turn));
  }

  stepPartnerOnce(next);        // consumes eligible echo and writes a meaningful log
  alignEligibleAnchors(next);   // deterministic finite progression
  next.realityDrift = calculateDrift(next);
  evaluateEnding(next);
  return sanitiseAndPersist(next);
}
```

**Important implementation nuance:** The `SELF` and `ECHO` outcomes may not always both be physically favourable, particularly after world conditions change. The event should define a `playerUtility` per outcome dynamically or use `selfPreferredOutcome` only where the first five authored events guarantee it. Avoid claiming a loss if the delta actually benefits the player. Likewise, archive potential child nodes created by the player must not silently imply that the partner lives in those same nodes; the partner's own branch moves via its own events or designated echo effects.

## 14. Science and theme framing

- Branching is **inspired by** quantum many-worlds and decoherence, which are interpretations of physical theory. The game does not simulate quantum mechanics, predict probabilities, or claim that humans can select branches.
- The Thread is an explicitly fictional cross-reality mechanism. The ability to send an echo to another branch is not real quantum communication.
- Mutual benefit, partner dependency, conflicting interests and the possibility that cooperation becomes costly are the legitimate conceptual connections to biological symbiosis.
- Small causal events affecting later options illustrate compounding counterfactual histories, not a scientific proof of alternate realities.
- Optional one-sentence end card: "Inspired by biological mutualism: two organisms can gain abilities together while becoming dependent on one another. The cross-reality Thread is fictional."

## 15. Build-agent instructions (paste below this spec)

**You are the lead engineer. Build a complete working web game from this specification, not a mock-up or static design. You may spawn subagents, but establish the shared simulation contracts first and own final integration.**

1. Create project files, install minimal dependencies, start a local dev server and confirm it actually serves a visible game.
2. Build the mandatory playable vertical slice in this order: player movement → event interaction → two-outcome branch state → archive/retrace → SELF/ECHO partner effect → three-anchor ending → audio → visual polish.
3. Do not ask clarification questions for noncritical issues; use sensible defaults. Keep a build log and do not abandon functionality to perfect visuals.
4. Ask for the ElevenLabs API key **privately in the local coding environment if needed**; store it only in `.env.local` or environment variables; never paste it into source code, UI or any public browser payload. If unavailable, continue with placeholder audio and include one script that generates/replaces audio assets once the key is supplied. Do not block the playable game on audio API access.
5. Use original assets and no unlicensed art/music. Build simple sprites programmatically if asset generation blocks progress.
6. Write tests for determinism and core game logic; run them, fix errors and report remaining limitations.
7. Confirm the web build and mobile interaction. Do not report a feature complete until it is present in the actual playable build.
8. Package a static publishable folder with `index.html` at its root; include a README explaining controls, running locally, and how ElevenLabs audio was integrated.

### Essential implementation priority

**A complete playable seven-minute experience with one excellent self/echo fork, a convincing reactive interface, real partner response, a retraceable archive and a finished ending beats an impressive-looking but incomplete simulation.**

---

## 16. Official technical references

- Phaser config and pixel-art: https://docs.phaser.io/api-documentation/typedef/types-core
- Godot web exporting (single-threaded options): https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- ElevenLabs TTS: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- ElevenLabs sound effects: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- ElevenLabs music composition: https://elevenlabs.io/docs/api-reference/music/compose
