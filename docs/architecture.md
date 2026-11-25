# Architecture

OUT OF SYNC is a Phaser 3 + TypeScript game built with Vite. It is a static site: no server, no network at runtime.

## Folder map

```
index.html                  the page: canvas host + DOM buttons (skip, mute, pause, rotate prompt)
src/
  flow/flow.ts              the story state machine (pure TypeScript, no Phaser, no DOM, no clock)
  shared/rng.ts             seeded random numbers and hashing (the game never uses Math.random)
  game/
    main.ts                 boots Phaser, wires flow -> scenes (routeFor), DOM buttons, ?jump= debug links
    contracts.ts            shared types: services, scene data, audio facade interface
    base.ts                 DCScene: base class every scene extends (send events, fade in, text helper)
    assets.generated.ts     GENERATED list of every image/sheet/font to load (do not edit)
    scenes/                 one file per screen (see below)
    forest2/                Game 1 puzzle: sim.ts (rules), rooms.ts (3 rooms), run.ts (3 attempts), solutions.ts, view/ (drawing)
    runner/runnerSim.ts     Game 2 sim: 3-lane runner (pure logic, tested)
    audio/                  Web Audio facade, synth fallbacks, score plan (see docs/audio.md)
    content/lines.ts        every line of dialogue, with speaker + mood; also music and sfx ids
    ui/                     button.ts, dialogue.ts (parchment box), fit.ts (text fitting + overflow audit)
    demo/demoPanel.ts       the win / lose / play-myself panel used by demo mode
    office/, cutscene/, shared/   backdrops and helpers used by the cutscene scenes
public/assets/game/         all shipped art, fonts, audio and manifest.json (licences per file)
scripts/
  assets/                   import art from the zips, convert fonts, recolour the wizard
  audio/                    ElevenLabs generation, manifest builder, audio QA
  qa/                       browser tests that drive the real built game
docs/                       this file, forest-rules.md, audio.md, development.md
```

## The story flow

`src/flow/flow.ts` owns the order of the whole game. Scenes never change scene themselves; they send an event (`this.send({ type: 'SELECT', character })`) and the flow moves to a new state. `routeFor()` in `src/game/main.ts` maps each state to a scene.

```
TITLE -> COSMIC_INTRO -> CHARACTER_SELECT -> FOREST_GAME
FOREST_GAME -> FOREST_SUCCESS -> REUNION_ENDING                         (won the forest)
FOREST_GAME -> FOREST_FAILURE -> ABDUCTION -> TIME_MASTER_OFFICE        (ran out of charges)
TIME_MASTER_OFFICE -> REFUSE -> SOUP_ENDING                             (refused to beg)
TIME_MASTER_OFFICE -> ACCEPT -> THREAD_RUNNER -> RUNNER_SUCCESS / RUNNER_FAILURE -> FINAL_ENDING
any ending -> REPLAY -> TITLE
```

| State | Scene file |
|---|---|
| TITLE | `TitleScene` |
| COSMIC_INTRO | `IntroScene` (press-to-advance narration) |
| CHARACTER_SELECT | `SelectScene` |
| FOREST_GAME | `ForestScene` (Game 1) |
| FOREST_SUCCESS, REUNION_ENDING | `ReunionScene`, `EndingScene` |
| FOREST_FAILURE, ABDUCTION | `AbductionScene` |
| TIME_MASTER_OFFICE | `OfficeScene` |
| SOUP_ENDING | `SoupScene` |
| THREAD_RUNNER | `RunnerScene` (Game 2) |
| RUNNER_SUCCESS, RUNNER_FAILURE | `RunnerResultScene` |
| FINAL_ENDING | `EndingScene` |

The flow also owns seeds, pause, relaxed mode and the `demo` flag. Scene instances are reused by Phaser, so **reset every field in `create()`** (a stale field once left the title buttons dead after a replay).

## Game 1: Time-Lock Rooms

Rules are in `docs/forest-rules.md`. In code:
- `forest2/sim.ts` is the whole rules engine (tiles, actions, beats, tether, ghost replay, weathering). It is deterministic and has no Phaser imports.
- `forest2/rooms.ts` defines the three rooms and their seeded variants; `solutions.ts` holds a reference solution per room and order (used by tests and by demo mode).
- `forest2/run.ts` wraps three rooms and the Thread charges into one run.
- `ForestScene.ts` plays it. It draws with `forest2/view/*`, greys the world on each failed room (second camera keeps the UI in colour), switches music (`forest` -> `forest_tense` -> `final_minute`), and has the Time Master quip after failures.

## Game 2: the runner

`runner/runnerSim.ts` is a pure simulation (lanes, hazards, anchors, a bot that plays perfectly). `RunnerScene.ts` draws it.

## Demo mode

The title's DEMO MODE button sets `snapshot.demo`. Each game then shows a `DemoPanel` (win, lose, or play yourself).
- Forest: the scene feeds real inputs through the same `act()` handler the keys use. Win plays the reference solution. Lose plays the first brother's loop, then the second brother about halfway, and ends the loop, until the charges run out.
- Runner: the perfect bot drives the thread (win) or nobody steers (lose).
- The narrator is never cut off: `DCScene.send()` delays a scene exit until the current voice line finishes (max 20 s) and the forest queues story lines behind a playing line.

## Text fitting

All text is fitted to a box: `ui/fit.ts` (`boxText`, `fitText`) wraps and shrinks text to its box, and `auditText()` checks every visible text object. `node scripts/qa/text.mjs` runs that audit on every scene. It checks text against its box, not against the art around it, so still look at screenshots.

## Debugging in the browser

- `?jump=<STATE>&char=SAM|JENSEN&seed=N` starts at any flow state, e.g. `?jump=TIME_MASTER_OFFICE&char=SAM`.
- `?f2debug=1` adds `window.__forest2.solve(room, order)`.
- `window.__dc` exposes the flow, game and services in the console.

`this.dc` in scene code is the services object (flow, audio, settings, session). "DC" is short for "Director's Cut", the name of this version of the game.
