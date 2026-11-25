# Asset credits

Every visible asset in the game is imported from the packs below. Each file used is listed with its source path and licence in `public/assets/game/manifest.json`. The original zips are git-ignored (`asset_zips/`); they are only needed to re-run `scripts/assets/import_assets.mjs`.

## Art, fonts and VFX (imported to `public/assets/game`)

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


## Audio

All voice lines, music and sound effects were generated with ElevenLabs (Text to Speech, Music and Sound Effects) on the project owner's Creator plan, using `scripts/audio/generate_audio.py`. Time Master voice: Cassius (ElevenLabs library); Jensen: Liam; Sam: Will. If a generated file is missing, the game falls back to synthesised stand-ins (`src/game/audio/synth.ts`).
