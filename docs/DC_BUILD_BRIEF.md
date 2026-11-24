# OUT OF SYNC: Director's Cut build brief (read fully; binding)

Tagline: "Two mushrooms broke time. Now somebody has to put it back." Tone: whimsical, ridiculous, occasionally dramatic, self-aware.
Comedy engine: the cosmic seriousness of the Time Master vs the absolute stupidity of the two mushrooms. The Time Master is a deep, commanding VOICE in the intro (do NOT show him there). Later we discover he is a tiny, adorable wizard behind an important desk in an ordinary office.
Jensen = future mushroom brother (red cap). Sam = past mushroom brother (blue cap). Slightly different personalities (Jensen: eager, clumsy; Sam: anxious, careful).

Stack: Phaser 3 + TypeScript + Vite. One Phaser game 960x540 (FIT scaled, pixelArt, nearest filtering). Everything is a Phaser Scene in `src/dc/scenes/`, routed by the FlowController (`src/flow/flow.ts`) via `src/dc/main.ts`. Read these first: `src/dc/contracts.ts`, `src/dc/base.ts`, `src/dc/main.ts`, `src/flow/flow.ts`, `src/dc/content/lines.ts`, `src/dc/ui/button.ts`, `src/dc/ui/dialogue.ts`, `src/dc/assets.generated.ts`, `public/assets/dc/manifest.json`.

## Rules for every agent
- Only edit files you own (below). Do NOT edit `src/dc/main.ts`, `contracts.ts`, `base.ts`, `lines.ts`, `assets.generated.ts`, `index.html`, `src/flow/*`. If you need a change there, say so in your report (the coordinator will make it).
- Every scene is entered with `{ snap: FlowSnapshot, ... }` (see `routeFor` in main.ts) and leaves ONLY by `this.send({type: ...})` (flow events). Never start another scene directly.
- All scenes must be skippable where the flow says so (the DOM SKIP button dispatches `SKIP`): make sure a scene that gets stopped mid-cutscene leaves no timers/tweens/audio running (use `this.events.once('shutdown', ...)`).
- Gameplay timers advance only while `this.live` (= flow.timersRunning). Cutscenes and pause must not move gameplay clocks.
- Use ONLY imported assets from `public/assets/dc` (texture key = manifest key, e.g. `myconid/red`, `garden/stone_well_with_a_wooden_roof_and_a_bucket`). Never draw replacement art procedurally. Phaser Graphics are allowed ONLY for invisible hit areas, simple UI bars/timers, tints/overlays, vignettes, lane guides and the like. VFX come from `vfx/*` (Brackeys CC0) and `portals/*`.
- Seeded randomness only (`mulberry32`/`hash32` from `src/sim/rng.ts`); never Math.random() for anything that affects outcomes.
- Mobile + desktop: pointer/touch must work everywhere; touch targets >= 44 CSS px at the scaled size. Keyboard shortcuts as listed per scene.
- Spoken lines come from `LINES` (`src/dc/content/lines.ts`); play with `this.dc.audio.playVoice(id)`; show captions always. SFX ids from `SFX_IDS`, music ids from `MUSIC_IDS`. Audio is a no-throw facade, call it freely.
- Run `npx tsc --noEmit` and `npx vitest run` before reporting. Do not commit (the coordinator commits). Do not run `git checkout/reset/stash`.
- Report: files created/changed, how to see your scene (`npm run dev`, then `/?jump=<FLOW_STATE>&char=SAM|JENSEN&seed=N`), what you verified, what you did not.

## Asset sheet facts (public/assets/dc; sizes after import)
- `myconid/{red,blue,green,purple}`: spritesheet 64x64 cells, 40 columns x 8 rows (frame = row*40 + col). Rows = directions S,SW,W,NW,N,NE,E,SE. Columns: idle 0-7 (5.3fps), walk 8-15 (9.6fps), attack 16-23 (7.4fps), hit 24-31 (12fps once), death 32-39 (4.8fps once). Feet pivot near (32, 42 from top). Jensen = red, Sam = blue. `myconid/myconid.json` has the layout. Up-scale 2x-3x for readability.
- `mushrooms/{blue,pink,red}`: 128x128 cells, 3x3, 8 frames of an idle bob (decoration / cheering mushroom crowd).
- `wizard/wizard`: 48x48 cells, 4 columns x 18 rows (small dark top-down wizard with a pointy hat and idle/turn frames; the last rows hold small effects). INSPECT it (use read_file on the PNG) and pick frames. He is the Time Master in the office: tiny, charming. Tint/scale allowed, plus a tiny cushion/box to make him sit at the desk.
- `office/office` (256x224 scene sheet with sky, desks, people) and `office/office_assets` (256x160: chairs, sofas, windows, plants, vending machines, computers, clocks, a small dog and cat): CROP rectangles by registering frames at runtime with `this.textures.get(key).add(name, 0, x, y, w, h)` after inspecting the PNG. `home/*` single sprites (clock, bookshelf, floor lamp, fern, framed photo, armchair, mugs...) for coziness. `tiles/wood_planks_light`, `tiles/parquet_basketweave`, `tiles/wallpaper_*` (32x32 seamless tiles) for the office floor/wall (tileSprite).
- `garden/*` forest objects (stone well, apple tree, fence, rail fence gate, greenhouse, cottage, gnome with lantern, bench, shed, rain barrel, flower beds, lilac bush, bird house, clothesline, etc.), `tiles/front_lawn`, `tiles/garden_gravel_path`, `tiles/flower_bed_soil` (32x32), edge transitions in `tiles/transitions/...`.
- `portals/tide_{open,idle,close}` strips of 128x128 cells (10/12/8 frames) = cyan portal; `portals/arcane_*` = purple portal; `portals/tide_rune_circle` (64px, 12 frames, loop), `portals/{tide,ember,arcane}_teleport` (64px, 10 frames once, the cyan one has a vertical beam: use for the abduction beam, scaled up), `runes/*` cyan glyph sheets (64px).
- `vfx/*.png` Brackeys predrawn flipbooks, frame size/count in `manifest.json` (`frame:{cols,rows,w,h,frames}`; load order is row-major): vortex, electric_ring, wavy_blue, wavy_purple, charge, explosion, star_explosion, big_hit, impact_white, lightstreaks; and particle textures `vfx/p_*` (light, flare, magic, spark, star, smoke, twirl, circle) for Phaser particle emitters. They are white/cyan/purple glows: use ADD blend mode.
- `space/*`: `blue-back`, `blue-stars`, planets and asteroids (Space Background Pack), `starfield_white_{far,mid,near}`, `nebula_violet`, `cratered_moon_64`, `gas_giant_64`, `terran_64` (Void Pixel Space Kit). Parallax/tileSprite them for the cosmic backdrop.
- `runner/{Diamond,GlassShards,RockShards,sparkle-effect}` (Space Runner Assets, CC0).
- `ui/dialog-box`, `ui/button-{normal,hover,pressed}`, `ui/panel-frame` (dark wood + gold + parchment). Fonts (Phaser bitmap fonts): `fonts/Aurora16-Smooth` (body), `fonts/Pepper16-Bold` (titles), `fonts/Jelly16-Regular`, `fonts/Karma16-Regular`.
- Colour language: cyan `#7be0df` = the Thread / time / Time Master magic; pink `#e8a0b4` = a branch happened; amber = warm beacon flame; magenta `#d5309a` = fractured timeline hazards (runner).

## Flow (explicit states; see flow.ts)
TITLE -> COSMIC_INTRO -> CHARACTER_SELECT -> FOREST_GAME -> [FOREST_SUCCESS -> REUNION_ENDING] | [FOREST_FAILURE -> ABDUCTION -> TIME_MASTER_OFFICE -> (REFUSE -> SOUP_ENDING) | (ACCEPT -> THREAD_RUNNER -> RUNNER_SUCCESS|RUNNER_FAILURE (RETRY allowed) -> FINAL_ENDING)]. Endings offer REPLAY (-> TITLE) and, for REUNION_ENDING, an optional "causal archive" button that calls `this.dc.openArchive()` (after pausing nothing; the overlay is DOM).
Scene -> state map is `routeFor()` in main.ts: TitleScene, IntroScene, SelectScene, ForestScene, ReunionScene (FOREST_SUCCESS), AbductionScene (data.phase 'collapse' at FOREST_FAILURE, 'beam' at ABDUCTION), OfficeScene, SoupScene, RunnerScene, RunnerResultScene (data.win), EndingScene (data.kind: FOREST_REUNION | RUNNER_REPAIRED | RUNNER_COLLAPSE; SOUP has its own scene that ends with an end card).
Which scene dispatches what: Title: START. Intro: SKIP/CONTINUE at end. Select: SELECT. Forest: FOREST_WON/FOREST_LOST. Reunion: CONTINUE. Abduction: CONTINUE (collapse beat, then again for the beam beat). Office: REFUSE / ACCEPT. Soup: nothing until the end card, then REPLAY. Runner: RUNNER_WON / RUNNER_LOST. RunnerResult: RETRY (failure only, instant) or CONTINUE. Ending: REPLAY.

## OWNERSHIP
- Agent CUT-1: `src/dc/scenes/{Title,Intro,Select,Reunion}Scene.ts`, `src/dc/cutscene/*` (their helpers).
- Agent CUT-2: `src/dc/scenes/{Abduction,Office,Soup,RunnerResult,Ending}Scene.ts`, `src/dc/office/*`.
- Agent FOREST: `src/dc/scenes/ForestScene.ts`, `src/dc/forest/*`, `src/sim/**`, `src/world/**` (only this agent may touch the sim), tests in `src/sim/tests/` and `src/dc/forest/*.test.ts`.
- Agent RUNNER: `src/dc/scenes/RunnerScene.ts`, `src/dc/runner/*` (pure seeded sim in `runnerSim.ts` + tests `runnerSim.test.ts`).
- Agent AUDIO: `src/dc/audio/*`, `scripts/generate_dc_audio.py`, `docs/DC_AUDIO.md`, `public/assets/dc/audio/*` (placeholders only unless a valid key exists).
- Coordinator: everything else (main.ts, contracts, flow, lines, assets, index.html, QA).
- vitest config includes `src/sim/tests/**`, `src/flow/**`; the coordinator will add `src/dc/**/*.test.ts` to it now.
