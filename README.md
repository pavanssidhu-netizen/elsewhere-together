# OUT OF SYNC (Director's Cut)

> Two mushrooms broke time. Now somebody has to put it back.

A small, funny, replayable browser game. Jensen (future) and Sam (past) touched an ancient beacon and split reality. The Time Master (a very serious voice who turns out to be very small) gives them a few dozen heartbeats to fix it.

Phaser 3 + TypeScript + Vite. Static build, no server, no network needed at runtime.

## Run it
```
npm install --registry https://registry.npmjs.org/
npm run dev          # local dev server
npm run build        # static site in dist/ (index.html at the root, relative paths)
npm test             # 96 unit tests (flow, forest sim, audio plan, runner)
```
Deploy `dist/` to any static host. `classic.html` is the earlier prototype (kept as a bonus).

## The game
1. **Title -> cosmic intro -> choose your brother.** Every cutscene is skippable.
2. **Game 1, Time-Lock Rooms (3 isometric rooms, turn based).** Each room: pick who goes first (Sam = the PAST Builder, Jensen = the FUTURE Scout). You get 20 beats. Your recording then locks and you play the other brother while the first replays as a translucent Spore Ghost. Both must stand on their beacon conduits on the same beat.
   - Sam (Past): plant roots on soil, pulse to grow vine bridges over gaps, coat vines in mineral sap so they survive into the future (uncoated vines turn to dust).
   - Jensen (Future): absorb static charge from ruins, discharge it into conduit plates, drop Blueprint Pins (promises for Sam to keep), push crates into Time Rifts to send tools back.
   - Tether: stay within 4 tiles of your twin or moves cost 2 beats; end a beat next to it for a Sync Boost (multiplier, refunds a beat).
   - 3 Thread charges per run (5 in relaxed mode). Clear all three rooms to reunite without the Time Master.
3. **Fail -> abduction -> the Time Master's office.** Beg ("Please, magnificent Time Master.") or refuse ("Absolutely not." leads to the soup ending).
4. **Game 2, Stitch the Timeline (3-lane runner).** Steer the repair thread, dodge magenta broken branches (3 hits = fail), collect 3 anchors. Instant retry on failure.
5. Four endings (forest reunion, soup, time repaired, time collapsed). All offer replay.

## Controls
| | Keyboard | Touch |
|---|---|---|
| Game 1 move | Arrows / WASD | on-screen d-pad |
| Game 1 A / B | Z or Space / X | A / B buttons |
| Peek (hold) | C | C button |
| Reset phase / End loop | R / Enter | small buttons |
| Runner | Left/Right or A/D | swipe or two big buttons |
| Pause | Esc | pause button |
| Dialogue | Enter / Space / click | tap |

Phones: landscape is best (a rotate prompt appears in portrait). Relaxed mode (title screen) gives longer loops and more charges.

## Debug and testing
- `?jump=<STATE>&char=SAM|JENSEN&seed=N` starts at any flow state (`FOREST_GAME`, `TIME_MASTER_OFFICE`, `THREAD_RUNNER`, `FINAL_ENDING`, ...).
- `?f2debug=1` adds `window.__forest2.solve(room, order)` (the reference solutions).
- `node scripts/dc_qa_shots.mjs` screenshots every scene. `node scripts/dc_qa_forest.mjs` and `node scripts/dc_qa_fullrun.mjs` drive the real UI with real key presses through every branch.

## Audio
All sound is currently **synthesised in the browser** (music, voices, effects). ElevenLabs audio is **not generated yet**: it needs a valid secret key and the creative director's approval of samples. `python3 scripts/generate_dc_audio.py` is a dry run by default (prints the plan and credit estimate, no network call). See `docs/DC_AUDIO.md`. Any mp3 placed under `public/assets/dc/audio/{voice,music,sfx}/<id>.mp3` is picked up automatically.

## Credits and licences
See `ASSET_CREDITS.md`. Several packs forbid redistributing the raw files as assets; the files in `public/assets/dc` ship only as part of this game, and the original zips are git-ignored.
