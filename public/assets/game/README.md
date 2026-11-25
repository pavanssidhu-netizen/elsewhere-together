# Game assets (placeholder README)

The third-party art, fonts and VFX that this game ships with are **not stored in this repository**. Their licences allow use inside a game but forbid redistributing the raw files, so only this README, `manifest.json` (a list of which file came from which pack) and our own generated audio are committed.

## How we use them

- Each pack is used only as a part of this game, in the built game. The raw files are never published, resold or offered as standalone assets.
- No pack is used to train, fine-tune or evaluate any AI or ML model. (Several licences forbid it, and we do not do it.)
- The original zips live only on the developer's machine (`asset_zips/`, git-ignored). `scripts/assets/import_assets.mjs` copies the used files into `public/assets/game/`, which is also git-ignored.
- Where a pack came with no licence file (Animated Mushrooms, Pixel Fantasy UI Pack) the terms are still to be confirmed with the author. Until then they are used only in private builds.
- Attribution is given below even where a licence does not require it.

## Credits

| Pack | Files used | Licence note |
|---|---|---|
| Brackeys' VFX Bundle v1 (flipbook/particle credits: Picster, Kenney, Thomas Iche, CodeManu) | 22 | CC0 (https://brackeysgames.itch.io/brackeys-vfx-bundle) |
| Myconid animated sprite sheet | 4 | Royalty-free, no redistribution as assets (pack README) ((supplied by creative director)) |
| Animated Mushrooms | 3 | No licence file supplied; creative director to confirm ((supplied by creative director)) |
| Top Down Pixel Art Wizard (GandalfHardcore) | 1 | Commercial use OK; no resale/redistribution of assets; no AI TRAINING or NFT use (we do neither) (https://gandalfhardcore.itch.io/) |
| Pixel Office (2dPig) | 2 | CC0 (https://2dpig.itch.io/pixel-office) |
| Nasha's Cozy Free Home Starter Kit v1.0 | 73 | Use in games OK; no redistribution as assets; no ML training use (we do neither) ((supplied by creative director)) |
| Free Pixel Portals & Runes v1.1.0 (Mira Forge) | 12 | Free for commercial use; no resale/redistribution as assets (https://miraforge.itch.io) |
| Space Background Pack (blue version) | 6 | See public-license.pdf in pack ((supplied by creative director)) |
| Void Pixel Space Kit Lite v1.0 | 7 | Free for commercial use; no redistribution as assets ((supplied by creative director)) |
| Space Runner Assets (27-11-20) | 4 | CC0 ((supplied by creative director)) |
| Pixel Fantasy UI Pack | 5 | No licence file supplied; creative director to confirm ((supplied by creative director)) |
| Pixel Fonts 16x16 Free5 | 4 | CC0 ((supplied by creative director)) |

Transformations: the Time Master's wizard sheet is recoloured lilac with `scripts/assets/brighten_wizard.mjs` (lighter and cuter); Brackeys flipbooks resized to 50%; UI art scaled to 25-30%; isometric floor diamonds are derived at runtime from the imported 32x32 tiles (rotate and squash); font .fnt files converted from text to XML for Phaser.

Licence follow-ups: the Mushrooms pack and the Pixel Fantasy UI Pack arrived without a licence file (please confirm terms). The Wizard pack and Nasha's kit forbid AI/ML TRAINING use and redistribution of the raw assets (this game does neither; the raw zips are git-ignored and only the used files ship in the build).


## Audio (ours, committed)

All voice lines, music and sound effects were generated with ElevenLabs (Text to Speech, Music and Sound Effects) on the project owner's Creator plan, using `scripts/audio/generate_audio.py`. Time Master voice: Cassius (ElevenLabs library); Jensen: Liam; Sam: Will. If a generated file is missing, the game falls back to synthesised stand-ins (`src/game/audio/synth.ts`).

## Rebuilding the assets locally

1. Put the pack zips in `asset_zips/` and extract them into one folder (one subfolder per zip).
2. `node scripts/assets/import_assets.mjs <that folder>`, then `node scripts/assets/brighten_wizard.mjs`.
3. `npm run build`.

Without these files the game will not render its art. The audio under `audio/` is committed and works on its own.
