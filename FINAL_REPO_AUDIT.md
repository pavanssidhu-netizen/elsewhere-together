# OUT OF SYNC: final repository audit

Read-only audit of the current working tree. No game code was edited for this audit. Evidence comes from the source, the test runs, the headless bot runs and the replay traces. Two temporary scripts were created and deleted: `scripts/_audit_trace.ts` and `/tmp/trace.ts`.

## Executive summary

1. **Winning.** `checkWin()` (`src/sim/engine.ts:472-488`) requires all of:
   - all three anchors `aligned` (LANTERN, GREENHOUSE, LIGHTHOUSE);
   - link `CONNECTED` or `FRAYING`;
   - `BEACON_LIT` on **both** the player's node and the partner's node;
   - `partner.site === 'BEACON'`;
   - the player within 1 tile of `anchor_LIGHTHOUSE` (16,7);
   - `bondStrain <= 80`.

   Each anchor has a player flag and a partner flag, earned separately:
   - LANTERN: player needs a lit lantern **and** radio contact.
   - GREENHOUSE: player must have stood on column x ≤ 4 with the route open.
   - LIGHTHOUSE: player must have lit the beacon.

   The game ends at the separate "lighthouse" beacon at the coast, not at the clearing fire.
2. **Fading.** The state machine is `evalLink()` (`src/sim/core.ts:109-136`): CONNECTED → FRAYING → LAST_SIGNAL → FADED.
   - **Danger** (`inDanger`, `core.ts:93-95`) means any of: drift ≥ 58, strain ≥ 60, drift ≥ 40 together with strain ≥ 30, or **90 ticks without progress**.
   - **Escalation:** each stage escalates after 2 meaningful actions or 30 ticks while in danger.
   - **Main cause in practice:** in the bot runs, fading is mostly caused by **idleness or ineffective actions** (the `IDLE_DANGER` route), not by drift.
3. **ElevenLabs soundtrack: not installed.** `public/assets/audio/` and `dist/assets/audio/` are **empty**. Music is 100% Web Audio synthesis (`src/audio/audioEngine.ts:4-11`). `scripts/generate_music.py` exists but its only run failed with HTTP 400: `api_keys/elevenlabskey` holds an API key *ID*, not an `sk_` secret. No voice or SFX files exist either; all audio is synthesized fallback.
4. **Largest disconnect.** The player cannot actively use the Thread in the browser. `CALL` exists in the sim (`engine.ts:510-528`), but **no key or button dispatches it** (no `CALL` in `src/main.ts` or `src/ui/shell.ts`). Telling the partner how to open the sluice, which it needs to cross and reach its beacon, is reachable only through the obscure "Hold the signal" action at the radio, or through the partner's 1%-per-stuck-turn self-discovery (`partner.ts:196`). A second problem: the partner only acts on player actions or every 8 ticks of walking, so **standing at the beacon waiting does nothing**. The final win needs the player to keep moving while the partner walks to and lights its beacon (replay `win.json` uses 4× `ADVANCE_PARTNER`, which the UI also does not expose).
5. **Smallest feasible fix.**
   - Expose CALL (key C plus a button) and a slow automatic partner tick while you stand still.
   - Re-point the win so the **clearing fire is the single shared beacon**, the object of the opening split. To light it in both worlds:
     - player side: power (wheel turning + radio contact) + fuel;
     - partner side: the partner reaches and lights its own clearing fire, using information sent over CALL.
   - Show readiness on the beacon itself: an amber ember for you, a cyan echo for the partner.

   This is mostly `checkWin`, `markAnchor`, `partner.planFor`, `main.ts` input and the beacon art in `scribble.ts`.

---

## 1. Repository snapshot

- **Branch** `v3`, **HEAD** `22a95909443c722591898721d791b01ce7fb4265` ("Updates": docs plus regenerated bot reports). The working tree is clean (`git status` shows no modifications).
- **Stack:** TypeScript, Vite 5, Phaser 3, DOM/CSS, Web Audio.
- **Entry points:** `index.html` → `src/main.ts`. The scene is `src/game/WorldScene.ts`. The pure sim engine is `src/sim/engine.ts` (`SimEngine`).
- **Relevant files:**
  - `src/sim/`:
    - `engine.ts` (611 lines): reducer, interactions, anchors, win.
    - `forks.ts`: `SPECS` and `runFork`.
    - `world.ts`: ignition, propagation, rain.
    - `partner.ts`: the autonomous agent.
    - `core.ts`: drift and the fade machine.
    - `tuning.ts`, `planner.ts`, `proofs.ts`, `branches.ts`, `rng.ts`, `types.ts`.
    - `tests/`: 3 files, plus `replays/{win,fade,secret}.json` and trace files.
  - `src/world/topology.ts`: 20×11 map, object tiles, walkability.
  - `src/game/`:
    - `scribble.ts`: imported-sprite renderer.
    - `WorldScene.ts`, `layout.ts`, `artStyle.ts`.
    - Legacy styles: `sprites.ts` and `ink.ts`.
  - `src/ui/`: `shell.ts` (screens, captions, verbs, help), `archive.ts` (post-game graph), `styles.css`.
  - `src/audio/audioEngine.ts`: synthesis plus optional mp3 loading.
  - `src/content/dialogue.ts`.
  - `scripts/`: `bots.ts`, `gen_replays.ts`, `generate_audio.py`, `generate_music.py`, `music_prompt.txt`.
- **Commands and results (run now):**
  - `npx vitest run`: **36/36 pass**.
  - `npx tsc --noEmit`: clean.
  - `npm run build`: OK. The JS bundle is 146 kB plus Phaser 1.48 MB.
  - `npx vite-node scripts/bots.ts -- --seeds 100`: see §5.

## 2. Player objective and victory logic

**Anchors.** `engine.ts:25`: `[['LANTERN','HEAR'],['GREENHOUSE','FIND'],['LIGHTHOUSE','MEET']]`.
- `aligned = playerReady && partnerReady` (`core.ts:79-84`).
- Player readiness is set only in `markAnchor()` (`engine.ts:432-469`) and in the radio contact branch (`engine.ts:382-389`).
- Partner readiness is set only by the partner's `MARK` step (`partner.ts:233-243`).

| Anchor | Object, tile | Player becomes ready when | Partner becomes ready when |
|---|---|---|---|
| LANTERN (HEAR) | `anchor_LANTERN` (11,5), "Fire rune" | `LANTERN_LIT` **and** `v2.contact` (`engine.ts:440`). Contact = radio `TUNE`/`HOLD_SIGNAL` outcome A (`engine.ts:382`). TUNE is blocked unless `WHEEL_TURNING`, no `RADIO_SMOKE` and `KNOWS_FREQUENCY` (`forks.ts:45-51`). | Partner at CLEARING with its own `LANTERN_LIT` (`partner.ts:68-70, 235`). |
| GREENHOUSE (FIND) | `anchor_GREENHOUSE` (16,3) | `v.crossed` (player ever stood on tx ≤ 4, `engine.ts:255`) **and** `routeOpen` (`engine.ts:444`). | `p.crossed`: partner travelled to TOWER, which needs `routeOpen(partner)`. That means its bridge is braced or water ≤ 1 (`partner.ts:72-87`). |
| LIGHTHOUSE (MEET) | `anchor_LIGHTHOUSE` (16,7), "Beacon" | Its own `BEACON_LIT` from the BEACON fork (`engine.ts:334-341, 448`). Needs fuel and the coast path open to reach. | Partner at BEACON with `BEACON_LIT`. Reaching BEACON needs `coastOpen(partner)` (`COAST_OPEN` + water ≤ 2), which needs `open_sluice` knowledge (`partner.ts:88-94`). |

**Win check.** `checkWin()`, `engine.ts:472-488`:
```ts
if (!s.anchors.every(a => a.aligned)) return false;
if (s.link !== 'CONNECTED' && s.link !== 'FRAYING') return false;
if (!hasFlag(s,'player','BEACON_LIT') || !hasFlag(s,'partner','BEACON_LIT')) return false;
if (s.partner.site !== 'BEACON') return false;
... player within Chebyshev 1 of OBJECT_TILES.anchor_LIGHTHOUSE ...
if (s.bondStrain > TUNING.WIN_STRAIN_MAX) return false;   // 80
```
It is also called from every `afterAction` (`engine.ts:602`). The win can therefore fire on a partner tick while you stand near the beacon.

**Answers**
- **Central beacon or several objectives?** Three independent anchors plus a separate coastal "beacon" (LIGHTHOUSE). The clearing fire (`lantern`, 9,4) is only HEAR evidence. The opening split event is "a tree falls" (`engine.ts:58`), not any recognisable object.
- **How interactions contribute:**
  - **Fuel:** gather from `woodpile` or `HARVEST`. It powers RELIGHT, BEACON and HOLD_SIGNAL.
  - **Crossing:** `planks` + `BRACE`, or `DIVERT_WATER`, gets you across.
  - **Radio contact:** needs the frequency from the `inscription` (reachable only when the water is diverted) **and** a turning wheel (water not diverted). That forces `FOLLOW_ALTERNATE` at the sluice (`engine.ts:353-358, 543-555`).
  - **Coast:** `DIVERT_WATER` outcome A sets `COAST_OPEN` and opens the sand path to the beacon.
- **What makes the realities compatible?** There is no physical compatibility rule. Alignment is the AND of two independently earned booleans. Drift (§5) is only an input to danger.
- **Hidden requirements:**
  - "Crossed" means stepping onto column x ≤ 4.
  - The partner must physically stand at its beacon.
  - At the end, the player must keep acting or walking so the partner gets ticks.
  - LANTERN needs radio contact. The marker clue only says "Something on the far bank must carry your voice" (`engine.ts:441`).
- **Can you win without helping?** Yes. `cautious_self` (never calls) wins **81%** (§5). The partner learns `open_sluice` either through a Thread message or through `SELF_DISCOVER` 1% per stuck tick after 6 (`partner.ts:196`, `tuning.ts:37`).
- **Can the player predict progress?** Partly.
  - Positive signals: markers emit clues; ANCHOR_ALIGNED voice lines (`engine.ts:139-142`); partner trace captions.
  - Missing: any visible readiness state on the landmarks. Drift is visible only as desaturation (`main.ts:186`).

## 3. Partner autonomy and symbiosis

- **When it acts:**
  - Once after every effective player interaction (`s.turn++; partnerTurn()` in `doInteract`, `doCall`, `doRest`, `retraceTo`).
  - Every 8 ticks of *ineffective* time, i.e. walking (`engine.ts:587`, `PARTNER_PERIOD 8`).
  - It does **not** act while the player stands still, because no command means no tick.
- **Decisions** (`partnerTurn`, `partner.ts:155-205`):
  1. Respond to unread player messages (`respond`, `111-152`). It refuses when endangered (strain ≥ 70 or its world's instability ≥ 40). A garbled call (random draw > clarity + 0.3) gives "You're breaking up". Otherwise it learns the technique, notes the location, takes a warning, or reports back.
  2. SURVIVE: if strain ≥ 62, it rests (−18 strain) or travels to a safe site.
  3. Plans toward the first anchor that isn't partner-ready, in order L→G→L, via `planFor()` (`57-95`). Possible steps: TRAVEL, GATHER, RELIGHT, BRACE, OPEN_SLUICE, BEACON, MARK.
  4. If blocked, it waits, and has a 1% chance per tick (after 6 stuck ticks) to discover the sluice.
  - Plan changes emit "I couldn't get through... changing plan" (`notePlan`, `208-219`).
- **Independent state:** `partner.nodeId`, `site` (an abstract `Site`, not grid coordinates), `inventory`, `taken`, `knowledge[]`, `crossed`, `plan`, `stuck`, `priority`, `goal`.
- **Branch entry:** it never moves to the player's node. Its forks go through the shared `runFork(s,'partner',...)` and create its own children (`forks.ts:144-219`). The node id is written only at `forks.ts:190`.
- **Effect on the player:** none physically.
  - Drift: its flags feed `KEY_FACTS` mismatch (`core.ts:61-77`), so its progress lowers or raises drift.
  - Strain: its rest lowers shared `bondStrain` (`partner.ts:168`).
  - Win: its readiness gates alignment.
- **Communication:**
  - Each action emits `PARTNER_TRACE {text, objectId}`, shown as an italic caption plus a cyan echo at that landmark (`main.ts:218`, `WorldScene.ts:198`).
  - Some actions also emit `VOICE` (caption plus synthesized blip).
  - The texts are generated from real state (`partnerReport`, `partner.ts:31-43`; `defaultTrace`, `13-24`), so they are grounded.
  - Noise: during a stall, the same "I'm at the clearing, waiting. The river is high..." line repeats on almost every partner tick (seen ~20× in `win.json`).
- **Does the bond constrain victory?** Yes, softly: link must not be LAST_SIGNAL or FADED, and strain must be ≤ 80.
- **Can helping hurt?** Yes. CALL costs 1 fuel and +7 strain (`engine.ts:513-516`), HOLD_SIGNAL costs +4 strain and fuel. `mostly_calls` fades 100%.
- **Cooperative-looking but no real effect:**
  - `LOCATION` and `WARNING` messages only set `priority` or `caution`. Neither is reachable from the UI.
  - `REQUEST_PARTNER` has no UI.
  - LANTERN/GREENHOUSE marker "REST" does nothing for alignment.

## 4. Interactables

Verbs come from `availableActions()` (`engine.ts:265-272`, labels at `37-40`) and are shown as E/Q/F buttons (`main.ts:86-98`). Forks are `SPECS` in `forks.ts:53-124`.

| Object (tile) | Player actions | State changes | Branches | Partner effect | Win effect | Feedback |
|---|---|---|---|---|---|---|
| woodpile (8,2) | Gather | fuel +1 (3 per pile, restock every 20 ticks) | none | none | fuel for fire, beacon, calls | caption |
| lantern / clearing fire (9,4) | Light the signal fire | A: `LANTERN_LIT`, light +2. B: `LANTERN_BROKEN`. Then `ignition()`: spread A sets `FIRE_SPREAD, SMOKE, RADIO_SMOKE` (p = 0.65 dry, 0.15 wet, `world.ts:52-63`) | 2 (fork + ignition fork) | none | LANTERN player half (also needs contact) | caption, pink bloom (main fork only), tinted campfire sprite, fire sprites |
| planks (7,7) | Gather | plank +1 | none | none | for bridge | caption |
| bridge (5,5) | Brace the bridge (needs a plank, uses up to 2) | A: `BRIDGE_OPEN`. B: `BRIDGE_COLLAPSED`. Collision changes (`topology.ts:55`) | 2 | none | route to the west bank (GREENHOUSE) | sprite bridge or bridge_end, bloom |
| tide / sluice (10,8) | Divert the water; Follow the other history | Divert A: water = 1, `COAST_OPEN, WATER_DIVERTED, WHEEL_STOPPED, DRY`. B: water = 3, `COAST_CLOSED`. Follow: retrace to the sibling (+5 strain) | 2; follow = 0 new | teaches `open_sluice` (learned on A); shared only via CALL or HOLD | coast/beacon access; inscription access | sprites (wheel grey), bloom on divert only |
| wheel (9,8) | Look only | none | none | none | indirect: powers the radio | spins or stops |
| inscription (13,8) | Read the carving | `KNOWS_FREQUENCY` on the player (survives retrace) | none | none | needed for radio contact | caption |
| radio (2,3), west bank | Tune the radio; Hold the signal | Tune A: `RADIO_CLEAR`, sets `contact` + LANTERN player half if lit. Hold: a message with `clarity` 0.92 or 0.25, +4 strain, −1 fuel | 2 | Hold sends the learned technique (the main real way to teach the sluice) | LANTERN (contact) | captions, partner voice, cyan echo |
| stones (3,5) | Rest; also Tune and Hold labels (shared list) | −30 strain, +25 calm | none | none | recovery | caption |
| thread_terminal (2,7) | Rest | same as stones | none | none | recovery | caption |
| greenhouse (13,3) | Protect; Harvest; Rest (if grown) | Protect A: `GARDEN_GROWN`. Harvest: fuel +2/+1, `GARDEN_WITHERED` | 2 | none | fuel or safe rest site | plants sprites |
| anchor_LANTERN (11,5) | Rest (Observe hidden) | marks readiness via OBSERVE (default) | none | none | LANTERN | clue caption |
| anchor_GREENHOUSE (16,3) | Rest | readiness via OBSERVE | none | none | GREENHOUSE | clue caption |
| anchor_LIGHTHOUSE (16,7) | Light the beacon | A: `BEACON_LIT`. B: `BEACON_FLICKER` | 2 | none | LIGHTHOUSE + final | beacon campfire tint |

**Flags**
- **Explicit "Look" removed.** `availableActions` filters out `OBSERVE` (`engine.ts:268`). The anchors' default action is still OBSERVE, and it is only reachable when no buttons apply. In the UI the anchors show only "Rest here", so **marking an anchor through E is unclear** (`interactSlot(0)` sends the first listed action).
- **Label mismatch.** `stones` lists TUNE and HOLD_SIGNAL (`engine.ts:34`), so the focus label "ECHO STONES" offers "Tune the radio". It's confusing next to the radio tile.
- **Hidden prerequisite chain.** Radio contact requires all of: inscription (needs diverted water) + wheel turning (needs water NOT diverted) + no smoke + radio on the west bank (needs a crossing).
- **Stale help text.** It still describes KEEP (E) / LET BE (F) (`shell.ts:249, 251`). The SELF/ECHO/LET_GO buttons are gone from play.
- **Ambient forks have no bloom.** Ignition, propagation and rain create real branches but emit only `WORLD_CHANGED`, not `FORK_RESOLVED` (`world.ts:46`), so there is no pink bloom.
- **Retrace is a re-roll.** `retraceTargets` allows any unchosen sibling on the path (`branches.ts:26-34`). FOLLOW_ALTERNATE is limited to the sluice sibling, but the generic RETRACE command (not in the UI) is not.

## 5. Fade, drift and difficulty

- **Drift.** `core.ts:70-77`:
  ```
  drift = clamp(3*min(10, lineageDistance) + 6*#mismatched KEY_FACTS (lantern lit, route open, coast open, garden grown, beacon lit)
               + 3*|water_p - water_q| + (FIRE_SPREAD ? 14 + (PROPAGATED ? 10 : 0) : 0) - 10*alignedAnchors - calm, 0, 100)
  ```
- **Strain.** A single shared `bondStrain`:
  - CALL +7, HOLD +4, retrying a failed fork +3, retrace +8, follow-alternate +5.
  - Natural decay −1 per 12 ticks. Rest −30 (player), partner rest −18 (`tuning.ts`).
  - There is no separate "bond strength" variable.
- **Danger.** `inDanger` (`core.ts:93-95`): `drift>=58 || strain>=60 || (drift>=40 && strain>=30) || idleTicks>=90`. `idleTicks` counts ticks without a new fork, anchor readiness, learned technique or crossing (`engine.ts:597-598`).
- **Fade machine.** `evalLink` (`core.ts:109-136`):
  - The first danger evaluation sets FRAYING (warning 1).
  - Each later stage needs `DANGER_ACTIONS 2` meaningful non-recovery actions or `DANGER_TICKS 30` ticks.
  - The sequence is LAST_SIGNAL (warning 2), then FADED (warning 3) + `FADE`.
  - Any non-danger evaluation resets to CONNECTED.
- **Recovery:**
  - Rest at stones, the terminal, anchor markers or a grown garden (`doRest`, `engine.ts:397-413`): −30 strain, +25 calm. Calm subtracts from drift and decays 1 per 3 ticks.
  - Rain extinguishes fire.
  - Follow the other history.
- **Time limits.** No hard limit. Idleness itself becomes danger after 90 ticks.
- **Retrace cost.** RETRACE +8 strain, FOLLOW_ALTERNATE +5.
- **Seed dependence.** Every fork uses `eventRoll(seed, parentNodeId, template:action, occurrence)` against a state-biased probability `pA` (`forks.ts:164-166`). Ambient rolls are keyed with `':spark'` (`world.ts:15`).

**Bot sweep** (100 seeds, real engine, legal MOVE/INTERACT, plus CALL and ADVANCE_PARTNER, which the UI lacks):

| policy | win% | fade% | timeout% | med ticks | med interactions | avg calls |
|---|---|---|---|---|---|---|
| planner | 100 | 0 | 0 | 95 | 24 | 1 |
| guided_novice | 98 | 2 | 0 | 223 | 42 | 1.1 |
| mostly_calls | 0 | 100 | 0 | 196 | 11 | 9 |
| cautious_self | 81 | 19 | 0 | 164 | 23 | 0 |
| random_interactor | 0 | 97 | 3 | 310 | 49 | 2.4 |
| reckless | 0 | 100 | 0 | 164 | 4 | 4.2 |

**Interactions before fading:**
- Reckless: about 4 effective interactions (median 164 ticks). Most ticks are refused, repeated actions feeding the idle rule. In `fade.json`, HARVEST is repeated ~150× on a bare garden. FRAYING comes at #104, LAST_SIGNAL at #134 and FADED at #164.
- Unguided (random): about 49 interactions (310 ticks).
- Competent (planner): does not fade.

These are bots. No human data exists.

## 6. Music implementation

- **ElevenLabs soundtrack imported?** **No.** `public/assets/audio/` is empty, and so is `dist/assets/audio/`. The only attempt (`scripts/generate_music.py`, prompt in `scripts/music_prompt.txt`) returned HTTP 400 `api_key_id_used_as_api_key`.
- **File loaded for music:** none. Music is synthesized: an 8-bar loop Dm–Bb–F–C–Dm–Gm–C–F. The amber layer is pad, bass and pluck; the cyan layer is bells; a heartbeat comes in with strain (`audioEngine.ts:4-11, 26, 290-330`).
- **Real file or synthesis?** Synthesis.
- **Does it loop?** Yes, procedurally scheduled.
- **Volume vs drift:** the master music gain is not reduced. Only the cyan bus gain falls, from 0.8 to 0.4 (`audioEngine.ts:270`).
- **Filtering:** amber lowpass goes 6 kHz → 3.5 kHz, cyan lowpass 7 kHz → 800 Hz, with more delay wet and feedback (`audioEngine.ts:268-273`). Bells detune with drift and jitter with strain (`324-325`).
- **Separate partner voice?** Yes: separate `voiceLP` (9 kHz → 3.5 kHz). The voice mp3s are absent, so it plays a synthesized blip.
- **Recovery:** yes. `setState(drift, strain)` is called on every state change (`main.ts:202`), and the parameters follow drift down again.
- **Production build:** no audio files load because none exist. The loader falls back silently, so there are no errors.

## 7. Narrative and player guidance

- **Title** (`shell.ts:215-216`): "Two of you. One thread. A world that splits whenever you choose."
- **Facts** (`shell.ts:20-24`): three skippable cards covering many-worlds as an interpretation, mutualism, and decoherence.
- **Intro:** two blobs, a split line, then "Which one of them are you?", choose JENSEN or SAM.
- **First 30 s of play:** the forest at camera zoom 14 tiles across, the boot voice caption "I can hear you. I don't know where you are.", the object label plus action buttons when adjacent, and partner trace captions.
- **What the player probably believes the goal is:** "find my partner" or "fix things." There is **no explicit statement of the goal** anywhere in play. Help (`shell.ts:247-252`) talks about splitting and the old verbs. Marker clues imply it locally.
- **Good versus dangerous decisions:** shown by the world desaturating (`main.ts:186`), warnings 1–3 (`dialogue.ts:44-48`), fire sprites and smoke blocking tiles. There is no positive signal on the beacon or landmarks besides ANCHOR_ALIGNED lines.
- **Partner progress feedback:** cyan echoes at landmarks, italic captions, and "A distant bell note, answered by another." on its marks.
- **Closer to reunion versus lower drift:** no distinct cue. Both read as more colour, a clearer cyan layer, and fewer warnings.
- **Branching ↔ symbiosis teaching:** only the facts cards and the frequency puzzle, where knowledge survives a retrace.

**Three largest disconnects**
1. **Unusable Thread.** The Thread is the theme, but the player cannot call through it: there is no CALL input. Coordination happens by accident (Hold signal) or by the partner's own discovery.
2. **Two different objects.** The "beacon" goal is a separate coastal object, unrelated to the split event (the opening is "a tree falls", never shown). Three hidden-gated anchors stand in for one understandable shared goal.
3. **Fading is mostly idleness.** Fading in practice comes from the idle timer and repeated refused actions, not from visible divergence. The partner also never acts while you stand still at the beacon, so the climax depends on the player wandering.

## 8. Headless evidence (seed 1, `src/sim/tests/replays/*.json`, replayed through `SimEngine`)

The engine has no direct "reunion feasibility" score. The anchor readiness pair (`P` = player, `Q` = partner, order L G B) is reported instead.

**WIN (`win.json`, 78 commands, tick 78, 14 events, 29 nodes, 42 journey steps)**

| # | Player action | Branch | Environment | Partner | Anchors | Drift / strain / link |
|---|---|---|---|---|---|---|
| 4 | gather wood | – | – | RELIGHT A ("a warm, steady note") | -- -- -- | 6→15 |
| 7 | light fire | N0005\|N0006 A, then ignition N0007\|N0008 A | fire spreads, smoke on garden road | marks lantern ("a far-off note...") | -Q -- -- | 15→29 |
| 12 | (walk) | propagation B | fire creeps toward the garden | – | – | 29→42 |
| 15 | divert water | N0011\|N0012 A | wheel stops, dry, coast open | waiting: "river is high, no planks" | – | 42→60, **FRAYING (W1)** |
| 18 | rest at fire rune | rain B | fire continues | – | – | 60→39, CONNECTED |
| 22 | read carving | – | KNOWS_FREQUENCY | – | – | 40 |
| 24 | follow other history | → N0015 (rain A) | wheel turning, fire out | – | – | 40→5, strain +4 |
| 29 | brace bridge | N0017\|N0018 A | bridge open | – | – | 6→15 |
| 36 | tune radio | N0019\|N0020 A | radio clear, contact | "I hear you. The river rose again..." | PQ -- -- **LANTERN aligned** | 17→11 |
| 46–47 | divert again, CALL (teaches sluice) | N0021 A | – | "I think I understand." | – | strain 3→10 |
| 52 | (gather) | – | – | OPEN_SLUICE A ("water running far off") | – | 22→7 |
| 59 | mark garden symbol | – | – | at TOWER | PQ P- -- | 9 |
| 72 | (walk) | – | – | marks garden ("bell note, answered") | PQ PQ -- **GREENHOUSE aligned** | 13→4 |
| 74 | light beacon | N0025\|N0026 A | beacon lit | travels | PQ PQ P- | 4→10 |
| 75–78 | **ADVANCE_PARTNER ×4** (not in UI) | – | – | gathers, reaches lookout, BEACON A, marks | PQ PQ PQ → **WIN** | →0 |

**FADE (`fade.json`, reckless, 164 commands):** gather, then repeated CALLs (strain 0→34), HARVEST A (garden bare), then about 150 refused HARVESTs ("already stripped"). Drift stays at 18 and strain at 34 throughout. Fading is triggered purely by `idleTicks >= 90`: FRAYING (W1) at #104, LAST_SIGNAL (W2) at #134, FADED (W3) + FADE at #164. There are 3 events and 7 nodes in total. **No cascade is involved in this fade.**

**Environmental cascade:** `win.json` #7–#24. The lantern is lit while the river flows, the ignition roll (p = 0.15) spreads fire, then the next weather tick propagates it. The player diverts the water, which adds DRY. Smoke blocks tiles (12,3)/(12,4) and the radio is smoked. Drift climbs 15→60 and the link hits FRAYING. Recovery: rest, then follow the other history into the branch where rain had put the fire out. Drift falls to 5.

**Counterpart independence:** `win.json`:
- #4: lights its own lantern unprompted.
- #8: reports "That way is shut to me: the river is high and there are no planks" (a plan change).
- #48: "I've reached the crossing. Mine is still flooded." then "changing plan".
- #52: opens its own sluice after learning it from CALL.

`v4.test.ts` test D also checks traces and plan changes with the player idle.

## 9. "Two worlds. One beacon. Make it shine in both": smallest changes

1. **Make the clearing fire the beacon and the split origin.**
   - Opening event text: `engine.ts:58-63` and the intro copy (`shell.ts` intro `i-2`): "the old beacon in the clearing flared and split."
   - `checkWin` (`engine.ts:472-488`):
     - Require the player within 1 tile of `lantern`, with `BEACON_LIT` there.
     - Require the partner at site `CLEARING` with its `BEACON_LIT`.
     - Keep `aligned` on HEAR (contact) and FIND (route) as the two "power/reach" prerequisites.
   - Retarget the BEACON spec object to `lantern` (`forks.ts:63-71`), the anchor_LIGHTHOUSE allowed list, and `partner.planFor` LIGHTHOUSE → CLEARING (`partner.ts:88-94`).
   - Clear the coast/sand requirement for the beacon. Water then only matters for the frequency puzzle.
2. **Expose the Thread.**
   - Add key C plus a button: "Call through the Thread (uses fuel)". It dispatches `{type:'CALL'}` (`main.ts` keydown ~`:300`; `shell.ts` verbs).
   - `doCall` already sends learned techniques (`engine.ts:499-503`).
3. **Partner ticks when you wait.**
   - In `main.ts`, every ~3 s during EXPLORING with no movement, dispatch `{type:'ADVANCE_PARTNER'}`.
   - This is deterministic because it is a recorded command.
   - Also reduce the repeated "waiting" trace: only emit when `notePlan` changes (`partner.ts:192-203`).
4. **Show readiness on the beacon itself.** In `scribble.ts` draw, around the clearing fire, using the existing tinted `tiles_decorative`/`campfire` sprites:
   - three amber runes (lit = player HEAR/FIND/LIGHT);
   - three cyan runes (lit = partner).

   On interaction, the caption names the missing pieces in physical terms (`markAnchor` clue, `engine.ts:452-461`).
5. **Fix help and feedback consistency.**
   - Replace the KEEP/LET BE help lines (`shell.ts:249-251`).
   - Emit `FORK_RESOLVED` for ambient forks (`world.ts:46`) so cascades get the pink bloom.
   - Remove TUNE/HOLD from `stones` (`engine.ts:34`).

## Prioritised changes (max 5)

| # | Change (files / functions) | Expected effect | Complexity | Verify |
|---|---|---|---|---|
| 1 | Expose CALL: `main.ts` keydown + `shell.setVerbs` extra button → `send({type:'CALL'})` | The player can deliberately teach the partner the sluice or the frequency; the symbiosis becomes playable | Low (≈15 lines) | Browser: divert → C → caption "Your voice carries…" → partner trace "I think I understand" within 1–2 actions |
| 2 | Idle partner tick: `main.ts` `setInterval` → `ADVANCE_PARTNER` when EXPLORING and no keys held; dedupe waiting traces in `partner.ts:200-203` | The climax resolves while you wait at the beacon; fewer repeated captions | Low | Replay `win.json` without the final 4 ADVANCE commands in the browser and wait 15 s → WIN |
| 3 | One beacon: retarget the BEACON spec to `lantern`; `checkWin` uses the `lantern` tile and partner site CLEARING; `partner.planFor` LIGHTHOUSE step → CLEARING; update intro/opening text | A single recognisable goal tied to the split event | Medium (sim + 2 tests + replays regen via `scripts/gen_replays.ts`) | `npx vitest run`; bots planner ≥ 95% win; browser: light the clearing beacon → partner lights theirs → WIN |
| 4 | Beacon readiness runes in `scribble.ts` (`drawScribbleWorld`), driven by `anchors[].playerReady/partnerReady` | The player sees which side is missing what; you can tell you are getting closer | Low–medium | Screenshot before/after contact: amber rune 1 lit, cyan rune 1 lit after the partner's mark |
| 5 | Feedback hygiene: help text (`shell.ts:247-252`); `FORK_RESOLVED` from `world.ts` ambient; drop TUNE/HOLD from `stones` | No stale SELF/ECHO language; cascades bloom pink; no misleading verbs | Low | Grep for "KEEP (E)" returns nothing; e2e `bloom` class appears on an ignition fork |

**Not in this list:** music. It is blocked only on a valid `sk_` key. Once a file exists, a small `<audio>` loop in `audioEngine.ts` with gain `1 - 0.85*drift/100`, driven from `applyState`, delivers the "fade as you drift" requirement.
