# Development guide

## Setup and commands

```
npm install --registry https://registry.npmjs.org/
npm run dev        # dev server
npm run build      # typecheck + static site in dist/ (also refreshes the audio manifest)
npm test           # unit tests (flow, forest sim, runner sim, audio)
npm run qa         # browser checks against the built game: text overflow, forest run, replay buttons
```

`dist/` is the whole game: host it on any static host. Zip it with `cd dist && zip -r ../out-of-sync-web.zip .`.

## Browser QA scripts (`scripts/qa/`)

They serve `dist/` on a free port and drive headless Chromium with real key presses and clicks, so run `npm run build` first. They expect Playwright and a Chromium build at the paths set in `scripts/qa/lib.mjs`; override with `PLAYWRIGHT_PATH` and `CHROME_PATH`.

| Script | What it checks |
|---|---|
| `text.mjs` | every scene: no text outside its box or the canvas |
| `forest.mjs` | solves a forest room with the reference solution through the real UI |
| `forest_text.mjs` | text on the forest cards and HUD |
| `forest_drama.mjs` | grey-out per failed room, music switches, Time Master quips, both demo modes |
| `fullrun.mjs` | plays every branch of the story to its ending |
| `replay.mjs` | after an ending, PLAY and DEMO MODE work again without a refresh |
| `demo.mjs` | runs the forest demo (`CHOICE=1` win, `CHOICE=2` lose), logs flow states, saves screenshots to `OUT` |
| `office.mjs` | advances the office dialogue to the Time Master reveal and screenshots it |
| `shots.mjs [outDir] [WxH]` | screenshots every scene (`ONLY=title,select` to pick) |

None of these can tell you whether something looks good or sounds good. Open the screenshots.

## Art pipeline (`scripts/assets/`)

Source packs live in `asset_zips/` and the imported art in `public/assets/game/` (both git-ignored; licences forbid redistributing the raw files, see `public/assets/game/README.md`). A fresh clone has no art until you run the importer. To rebuild `public/assets/game`:

1. Extract the zips into a folder, one subfolder per zip.
2. `node scripts/assets/import_assets.mjs <that folder>` copies only the files listed in the script, resizes oversized ones, converts fonts (`fnt_to_xml.mjs`), and rewrites `public/assets/game/manifest.json` and `src/game/assets.generated.ts`.
3. `node scripts/assets/brighten_wizard.mjs` recolours the Time Master sheet.

To use a new asset, add an entry to the importer, re-run it, and load it by its manifest key.

## Audio pipeline

See `docs/audio.md`.

## Adding things

- **A line of dialogue:** add it to `src/game/content/lines.ts`, say it with `dialogue.say('id')`, then generate its voice (`docs/audio.md`).
- **A scene:** add `src/game/scenes/XScene.ts` extending `DCScene`, register it in `main.ts` (scene list, `SCENES`, `routeFor`) and add a flow state and test in `src/flow`.
- **A forest room:** add it to `forest2/rooms.ts` and a reference solution to `solutions.ts`; `run.test.ts` and `sim.test.ts` check every solution actually wins.

## Secrets and licences

- `api_keys/`, `.env`, `.env.local` are git-ignored. The ElevenLabs key must never be committed. Before pushing, run: `grep -rIl "sk_" src scripts docs public README.md`.
- `public/assets/game/README.md` lists every pack and its licence. Several packs forbid redistributing the raw files and AI training use, so keep the GitHub repository private unless those terms are cleared.
