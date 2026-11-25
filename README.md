# OUT OF SYNC

> Two mushrooms broke time. Now somebody has to put it back.

A small, funny, replayable browser game. Jensen (future) and Sam (past) touch an ancient beacon and split reality. The Time Master (a deep, commanding British voice that turns out to belong to someone very small) gives them a few dozen heartbeats to fix it.

Phaser 3 + TypeScript + Vite. Static build, no server, no network at runtime. Fully voiced and scored (ElevenLabs).

## Run it

```
npm install --registry https://registry.npmjs.org/
npm run dev        # local dev server
npm run build      # static site in dist/ (relative paths, host anywhere)
npm test           # unit tests
```

## The game

1. **Title** -> narrated cosmic intro (press to advance) -> choose your brother. **DEMO MODE** on the title plays the game for you and lets you pick win or lose at each game, to explore the branches.
2. **Game 1, Time-Lock Rooms** (3 isometric rooms, turn based). Per room, pick who goes first: Sam is the PAST Builder, Jensen is the FUTURE Scout. You get 20 beats. Your recording then locks and you play the other brother while the first replays as a translucent Spore Ghost. Both must stand on their beacon conduits on the same beat.
   - Sam (past): plant roots, pulse to grow vine bridges over gaps, coat vines in mineral sap so they survive into the future.
   - Jensen (future): absorb static charge from ruins, discharge it into conduit plates, drop Blueprint Pins, push crates into Time Rifts.
   - Tether: stay within 4 tiles of your twin or moves cost 2 beats.
   - 3 Thread charges per run (5 in relaxed mode). Every failed room greys the world a bit more, the music gets more dramatic, and the Time Master gets meaner.
3. **Fail -> abduction -> the Time Master's office.** Beg ("Please, magnificent Time Master.") or refuse ("Absolutely not.", which leads to the soup ending).
4. **Game 2, Stitch the Timeline** (3-lane runner). Dodge broken branches (3 hits = fail), collect 3 anchors.
5. Four endings: forest reunion, soup, time repaired, time collapsed. All offer replay.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Game 1 move | Arrows / WASD | on-screen d-pad |
| Game 1 actions | Z (or Space) / X | Z / X buttons |
| Peek (hold) | C | C button |
| Reset phase / End loop | R / Enter | on-screen buttons |
| Runner | Left/Right or A/D | swipe or two big buttons |
| Pause | Esc | pause button |
| Dialogue | Enter / Space / click | tap |

Phones: landscape is best (a rotate prompt appears in portrait). Relaxed mode (title screen) gives longer loops and more charges.

## Where to read next

| If you want to... | Read |
|---|---|
| understand the code layout and story flow | [docs/architecture.md](docs/architecture.md) |
| know the exact puzzle rules | [docs/forest-rules.md](docs/forest-rules.md) |
| change voices, music or regenerate audio | [docs/audio.md](docs/audio.md) |
| run tests, QA scripts, the art pipeline | [docs/development.md](docs/development.md) |
| check asset licences | [ASSET_CREDITS.md](ASSET_CREDITS.md) |

## Repo layout

```
index.html   src/flow (story state machine)   src/game (scenes, puzzle, audio, UI)   src/shared (seeded RNG)
public/assets/game (art, fonts, audio)        scripts/{assets,audio,qa}                docs/
```

## Licences

Code is the project's own. Art and fonts come from third-party packs with their own licences, several of which forbid redistributing the raw files and AI training use. See [ASSET_CREDITS.md](ASSET_CREDITS.md).
