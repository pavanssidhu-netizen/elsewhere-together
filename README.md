# Out of Sync (V2)

Two halves of one fictional symbiote wake up in diverging versions of the same sketched coastal hamlet. Uncertain events (an old lamp, a bridge, a signal mast, a flooded nursery, a tidal gate) split reality in two. At each one you can **keep** the better outcome for yourself, **send it across** to your partner at a cost to you, or **let it be**. Your partner acts on their own in their own branch. Align three shared anchors (Lantern, Greenhouse, Lighthouse) so the two worlds can meet, or let the thread fray until you fade. Either ending opens the causal archive: the full branch tree with both of your journeys.

TypeScript + Vite + Phaser 3 + DOM/CSS. The sim (`src/sim`, `src/world`) has no Phaser or DOM dependency and is fully deterministic.

## Run
```
npm install --registry https://registry.npmjs.org/
npm run dev        # local dev
npm test           # 42 sim tests (determinism, topology, fixed WIN/FADE/ALIEN replays, save/restore)
npm run build      # static site in dist/ (index.html at root, relative paths)
npx vite-node scripts/bots.ts -- --seeds 500   # headless playability sweep (7 bot policies)
node e2e/run.mjs   # real-browser test (needs local playwright + chromium, see file header)
```
Deploy `dist/` to any static host. It needs no network at runtime.

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | D-pad |
| Keep it (SELF) / use object | E (or Space) | KEEP / USE |
| Send it across (ECHO) | Q | SEND |
| Let it be (LET GO) | F | LET BE |
| Replay last caption | L | L |

Top bar: style (SCRIBBLE / PIXEL / INK / INK-LIGHT), sound, distortion, help. The old echo stones calm the thread (lower drift). The thread terminal lowers strain. If you wander for a while without acting, a hint appears.

## Designer shortcuts
- Title **DEMO** plays a winning route step by step through the real engine.
- `?debug=1` exposes `window.__et`.
- Tunables: `src/sim/tuning.ts` (all balance constants), `src/sim/events.ts`, `src/sim/agent.ts`, `src/sim/anchors.ts`, `src/world/topology.ts` (map and walkability), `src/content/dialogue.ts`, `src/game/scribble.ts` (art), `src/audio/audioEngine.ts` (synth music).

## Playability (bot sweep, 300 seeds, 600-tick cap)
| Policy | Win | Fade | Timeout | Softlock |
|---|---|---|---|---|
| PLANNER | 100% | 0 | 0 | 0 |
| NOVICE (walks to the hint target, follows the suggested verb 60% of the time) | 100% | 0 | 0 | 0 |
| ECHO_HEAVY | 100% | 0 | 0 | 0 |
| LET_GO_HEAVY | 95% | 0 | 5% | 0 |
| SELF_ONLY (never sends anything across) | 43% | 0 | 57% | 0 |
| RANDOM_CURIOUS | 3% | 0 | 97% | 0 |
| MALICIOUS (maximises drift) | 0 | 100% | 0 | 0 |

These are synthetic policies. They test possibility, fairness and softlocks, not fun or clarity.

## Audio and ElevenLabs
See `docs/AUDIO.md`. Music is a procedural Web Audio synth; no ElevenLabs music is generated. `scripts/generate_audio.py` prerenders the 9 voice lines and 6 SFX. It is a dry run by default (about 800 credits estimated) and only calls the API with `--go`. The key comes from env or `--key-file` and is never bundled; `api_keys/` is gitignored. Until you run it, the game uses synthesized stand-ins and captions.

## Known limitations
- Headless Chromium only (desktop 1280x800, simulated phone 360x740). No real phone, iOS Safari or sound-on listening test.
- No human cold-start playtest yet.
- Nearly every win aligns anchors in the order Lantern, Greenhouse, Lighthouse.
- Legacy commands (BEGIN_FORK, RESOLVE_FORK, ACTIVATE_ANCHOR, RETRACE) still exist without proximity checks; the UI and bots use only MOVE/INTERACT.

## Credits and attributions
- **Art:** "Scribble Dungeons" by Kenney (kenney.nl), CC0. Files and licence in `public/assets/scribble/`.
- **Voices and SFX:** ElevenLabs (when generated). Music is synthesised in the browser.
- **Science referenced (the game is fiction, not physics):** Everett (1957), relative-state formulation and the many-worlds interpretation; DeWitt (1970s), popularisation of many-worlds; Zurek (2003), decoherence, Reviews of Modern Physics; Bronstein (2015), *Mutualism*, Oxford University Press.
