# Art styles: PIXEL (default) and INK

Both styles live in the same build so they can be compared side by side. Gameplay, layout, collisions, hitboxes and
the 320x180 logical grid are identical in both; only rendering differs.

## Switching

- URL: `?style=ink` or `?style=pixel` (keeps other params such as `?debug=1`). The choice is remembered.
- Header button `STYLE: PIXEL` / `STYLE: INK` toggles and reloads the page (the game save is kept; you land on the start card with CONTINUE).
- Stored in `localStorage['elsewhere-together-style-v1']`. No param and nothing stored = PIXEL, so existing behaviour is unchanged.
- Code: `src/game/artStyle.ts` (`ART_INK`, `INK_SCALE`, `toggleArtStyle`). It also sets the `style-ink` class on `<html>`; all INK CSS is under that class.

## Technique (all procedural and original, no image files, deterministic)

Everything is drawn at load by `src/game/ink.ts` from the existing pixel frames; nothing from any third-party art pack is used.
Noise is a seeded integer hash (no `Math.random`), so every load and every screenshot is identical.

1. **Tone map.** Each source pixel of every tile/character frame is classified into a tone (paper, grey patch, faded teal, deep blue,
   ink, amber, cyan, violet, coral, glow...). The map is sampled at `INK_SCALE` (4x) with bilinear voting, which rounds off the pixel
   steps, through a smooth noise domain warp (the outline wobble).
2. **Fill with mis-registration.** Patch colours are read from a slightly shifted position with per-pixel jitter, so grey patches have
   sponge/dithered edges, can bleed a little outside the lines, and carry light "pores". Accent colours (amber, cyan, violet, coral), highlights and ink are not shifted.
3. **Hatching.** Tones flagged `hatch` (teal, object grey, the shaded halves of the two beings) get short, broken diagonal strokes.
4. **Outline.** Tone boundaries become ink strokes (discs stamped along the edge, radius varies with low-frequency noise = uneven weight,
   with occasional gaps) plus a faint, offset second stroke on silhouettes (double sketch line). Soft/soft boundaries (ground patches, glow) get no line.
5. **Registration.** The result replaces the textures `et_tiles`, `et_chars`, `et_fx` with the **same keys and frame names**; frame rects are
   4x bigger, LINEAR filtered. `WorldScene` sets `scale = 1/4` on sprites/tiles, the game canvas is 1280x720 and the main camera is zoomed 4x
   centred on the 320x180 world, so every world coordinate is unchanged. `ground`/`ground_dark` get extra frames (`ground#1..3`) in INK only to break up tiling.
6. **World overlays.** Rain is loose two-segment ink strokes; interactable markers are small ink-outlined diamonds; focus rings are wobbly hand-drawn circles;
   the tether has an ink underline; small rectangles (pips, tide gauge) get a thin ink outline.
7. **Portraits** (`portrait(who, expr)` in `ink.ts`): 320x320 analytic shapes (head, hood or hair, cloak, eyes, brows, mouth, wisp) run through the same
   fill/hatch/outline pipeline. Expressions: `calm`, `strained` (angled brows, flat mouth, forehead crack, more line gaps), `faint` (half-closed lids, more gaps, lower alpha).
   Partner portrait is in THREAD_LINK: `faint` when signal is `broken`, `strained` when signal is `faint` or strain >= 30, else `calm`. A small player portrait is in the status bar
   (`strained` at strain >= 60).
8. **UI.** Panels get a paper-grain SVG background and a rough ink border drawn on a `::after` with `filter: url(#ink-rough)`
   (feTurbulence + feDisplacementMap). The filter only touches that border pseudo-element; text and buttons are never filtered, so layout and hit areas do not move.
   Cards get slightly uneven corner radii. The world viewport has a paper (mist) background.

## Tunable constants

`INK_CFG` in `src/game/ink.ts` (units are hi-res pixels = 1/4 logical pixel):

| Constant | Default | Effect |
|---|---|---|
| `wobble` | 2.2 | Outline wobble amplitude (domain warp). 0 = clean vector-like lines, 4+ = very shaky. |
| `lineWidth` | 1.0 | Global ink line weight. |
| `gap` | 0.80 | Noise threshold where outlines break. Lower = more broken lines. |
| `doubleLine` | true | Faint second offset stroke on silhouettes. |
| `hatchSpacing` / `hatchWidth` / `hatchAlpha` / `hatchBreak` | 6 / 1.5 / 0.72 / 0.42 | Hatch density, thickness, darkness, and stroke length (higher `hatchBreak` = shorter, sparser strokes). |
| `misreg` | 2.6 | How far grey patches drift from the line art. |
| `sponge` | 1.7 | Per-pixel jitter of patch edges (rough edge). |
| `pores` | 0.06 | Fraction of light sponge pores in patches. |
| `grain` | 0.05 | Paper grain amplitude. |

Other knobs: `INK_SCALE` (`artStyle.ts`, 4; texture and canvas scale, 3 is lighter on slow GPUs), tone colours in `TONES`, per-tile colour overrides in `OVERRIDES`,
`GROUND_VARIANTS` (`sprites.ts`), portrait geometry in `portrait()`. `lineMul`, `hatchSpacing`, `misreg` are overridden per portrait.

## Verification done

- `npm run build` and `npx vitest run` (27 tests) pass.
- `STYLE=ink node e2e/run.mjs` and `STYLE=pixel node e2e/run.mjs`: 67/67 checks pass in both styles (movement, interact, forks, archive, retrace, mobile d-pad, win/ending, no browser errors).
  `STYLE`/`SHOTS_DIR` env vars choose the style and screenshot folder (default `docs/shots/` for pixel, `docs/shots/ink/` for ink).
- Screenshots: `docs/shots/ink/` and `docs/shots/pixel-compare/` use the same file names (02-world, 03-fork-panel, 05-archive-node-detail, 06-high-drift, 07-mobile-world, ...).
  `docs/shots/ink/sheet-tiles.png`, `sheet-chars.png` and `portrait-*.png` show the generated textures directly.

## Performance (headless Chromium, software GL, so indicative only)

- Texture generation at load: tiles ~65 ms, characters ~46 ms, fx ~1 ms (65 frames at 4x) = ~115 ms. Pixel style: ~1 ms.
- Portraits are generated lazily on first use, ~80 ms each (320x320), cached; 6 variants max.
- Frame rate over 4 s on the start-game scene: PIXEL ~60 fps, INK ~44 fps (1280x720 canvas instead of 320x180, software rasteriser). A real GPU should not notice, a weak integrated GPU or phone might; try `INK_SCALE = 3`.
- Memory: the ink sheets are 512x256 (tiles) and 192x768 (chars) plus a 1280x720 canvas.

## Honest limitations

- The designer's reference is a hand-painted pack; this is a procedural imitation. Lines wobble and vary in weight and shading is hatched and sponge-patched, but it will read more "filtered" than drawn, especially on large flat areas (walls, water). Expect to tune `INK_CFG` and the tone overrides by eye.
- The source art is 16x16 / 12x16, so shapes are limited by that information (the beings have simple silhouettes; thin lattices such as the radio tower are coarse). A real redraw at higher resolution would look better.
- The world is a light "paper" scene while the surrounding UI stays dark navy; this is deliberate (ink needs a light ground) but is a strong contrast. The UI recolouring is minimal.
- Flood tint, the lighthouse beam, drift tint and ending bridge are still plain translucent shapes; only small marks, rain, rings and the tether were converted to ink strokes.
- Ink textures are LINEAR filtered; this is seam-free because sprites/tiles are placed on whole logical pixels (4 hi-res px).
- Switching style reloads the page.
- The agent that built this had no image viewer. Layout, contrast and structure were checked with programmatic tests (e2e, bounding boxes, colour-class dumps of the screenshots), not by eye; a human pass on the screenshots is still needed.
