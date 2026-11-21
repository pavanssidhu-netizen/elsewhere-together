# Elsewhere, Together (V1)

A rain-soaked coastal town seen through an unstable observation console (ECHO/OS). You are amber. Your partner, cyan, lives in a diverging branch. Uncertain events split reality in two. **SELF** takes the outcome that helps you. **ECHO** accepts the worse outcome so your partner gets an advantage, at a cost to the bond. Align three shared anchors (Lantern, Greenhouse, Lighthouse) while keeping drift and strain in check.

TypeScript + Vite + Phaser 3 + DOM/CSS. The sim (`src/sim`) has no Phaser or DOM dependency and is fully deterministic (seed 48219).

## Run
```
npm install --registry https://registry.npmjs.org/   # or your usual registry
npm run dev        # local dev
npm test           # 27 sim tests (determinism, forks, echo, softlocks, win gating, save/restore)
npm run build      # static site in dist/ (index.html at root, relative paths)
```
Deploy `dist/` to any static host. It needs no network at runtime.

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | D-pad |
| Interact | E / Space | ACT |
| Call partner | C | CALL |
| Archive | Tab / M | ARCHIVE tab |
| Retrace | R | RETRACE in archive |
| Close | Esc | Back |

THREAD_LINK buttons: FIND ME, STAY SAFE, HELP, REST (lowers strain by 12 at a thread terminal). Header toggles: music, distortion, help.

## Demo / designer shortcuts
- Start screen **DEMO PATH** plays the scripted winning route.
- `?debug=1` exposes `window.__et.debug` (set drift/strain, teleport).
- Tunables: event deltas in `src/sim/events.ts`, partner policy in `src/sim/agent.ts`, anchor requirements and win thresholds in `src/sim/anchors.ts`, partner lines in `src/content/dialogue.ts`, palette/art in `src/game/sprites.ts`, synth music in `src/audio/audioEngine.ts`.

## Audio and ElevenLabs
See `docs/AUDIO.md`. Summary:
- **Music is a procedural Web Audio synth** (no ElevenLabs music is generated yet, deliberately, to preserve credits).
- Voice (9 partner lines) and SFX (6 cues) are pre-rendered at build time by `scripts/generate_audio.py` into `public/assets/audio/`. The script is a **dry run by default** (prints a credit estimate, about 800 credits total) and only calls the API with `--go`. The key is read from env `ELEVENLABS_API_KEY` or `--key-file`, never bundled. `api_keys/` is gitignored.
- **Not yet generated.** Until you run it, the game uses synthesized stand-ins and on-screen subtitles.

## Known limitations
- Tested in headless Chromium only (desktop 1280x800, mobile 360x740 with simulated touch); no real phone, iOS Safari or sound-on listening test yet.
- Keyboard walk to the LIGHTHOUSE ending was not exercised in the browser; the winning path is verified in the sim tests and the DEMO PATH reaches the ending in the browser.
- ECHO was not exercised through the UI in e2e (covered in sim tests).
- Desktop world canvas is small within its panel; visual effects at high drift/strain were checked via CSS classes and one screenshot, not tuned by eye.
- Credit estimates and the default voice id in the script are unverified assumptions.
- `e2e/run.mjs` needs `CHROME_PATH` set to a local Chromium.

## Credits and attributions (V2)

- **Art:** "Scribble Dungeons" by Kenney (kenney.nl), licensed CC0. Files and licence are in `public/assets/scribble/`.
- **Voices and SFX:** generated with ElevenLabs (see Audio above). Music is synthesised in the browser.
- **Science referenced (the game is fiction, not physics):** Everett (1957), relative-state formulation and the many-worlds interpretation; DeWitt (1970s), popularisation of many-worlds; Zurek (2003), decoherence, Reviews of Modern Physics; Bronstein (2015), *Mutualism*, Oxford University Press. The in-game About screen repeats these.
