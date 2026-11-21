# Art styles: PIXEL (default), INK (dark paper) and INK-LIGHT

Both styles live in the same build so they can be compared side by side. Gameplay, layout, collisions, hitboxes and
the 320x180 logical grid are identical in both; only rendering differs.

## Switching

- URL: `?style=pixel`, `?style=ink` (dark twilight ink, the default INK look) or `?style=ink-light` (first INK variant, ink on pale paper, kept for comparison). Other params such as `?debug=1` are kept. The choice is remembered.
- Header button `STYLE: PIXEL` / `STYLE: INK` / `STYLE: INK-LIGHT` cycles PIXEL -> INK -> INK-LIGHT and reloads the page (the game save is kept; you land on the start card with CONTINUE).
- Stored in `localStorage['elsewhere-together-style-v1']`. No param and nothing stored = PIXEL, so existing behaviour is unchanged.
- Code: `src/game/artStyle.ts` (`ART_INK`, `INK_SCALE`, `toggleArtStyle`). It also sets the `style-ink` class on `<html>` (both ink variants) and `style-light` (INK-LIGHT only); all INK CSS is under those classes.

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

## INK (dark paper) look

Same pipeline as above, re-toned for the twilight UI palette. `ART_LIGHT` (`artStyle.ts`) selects tone set and config at module load.

- **Ground and tones.** Ground `#1b263b`, ground patches `#22324b`, deep blue `#24405a`, blue patch `#2b4a60`, faded teal `#3a6c76`. Calm areas (ground, water, road, wall) use soft tones with
  thin faded-teal outlines (`lineMul` 0.8) and one grass tick per tile instead of three; ground patches are rarer and larger (`patchThr` 0.6).
- **Lines.** Outlines are pale mist `#b2c4ce` (`INK_RGB` is mist in this variant, deep ink in INK-LIGHT). Objects, beings, anchors, the thread terminal use `objectLine` 1.7x weight; trees and fences 1.1x.
  Hatch is mist at 60% strength on blue/teal tones and deep ink on amber/cyan tones; spacing 9 and `hatchBreak` 0.55 give fewer, longer-gapped strokes.
- **Colour reservation.** Amber and cyan (and violet for anchors/terminal) appear only on the two beings, signals/pips, lit lamps and anchors, the lighthouse beam and the thread. No other tile uses them.
- **Overlays are ink, not translucent shapes.** Flood is one rough-edged teal patch per row with short mist wave strokes; the lamp glow is a rough amber blob plus eight short rays; the drift tint is three loose violet blobs plus scratches;
  the lighthouse beam is a jittered amber patch with five bright strokes; the "impossible street" glimpse is three wobbly violet strokes; double-vision violet figures are rough blobs;
  the ending thread bridge is two wobbly strokes (amber from you, cyan from your partner) over a dark halo stroke; rain is mist two-segment strokes. Helpers: `inkPatch`, `inkBlob`, `inkStroke` in `WorldScene.ts` (hash jitter, deterministic).
- **Interactables.** Markers are 30% bigger with a 0.9 mist outline; focus rings get a dark halo under the cyan stroke; the tether has a dark halo under the cyan thread; empty readiness pips get a mist outline.
- **Portraits.** Lines are pale mist (instead of dark ink) on the dark panel, faces stay amber/cyan with dark hatch and dark eyes/brows/mouth, hood and hair are deep blue/teal, the wisp is mist. A soft deep-blue wash sits behind the bust. No paper card was needed.
- The world viewport background is `#111626` (INK) or pale mist (INK-LIGHT).

## World canvas scaling (all styles)

`fitCanvas()` in `main.ts` measures `#viewport` (the area between the WORLD_VIEW header and the action buttons) and sizes the canvas to the largest **integer** multiple of 320x180 that fits, centred, aspect ratio kept.
PIXEL stays integer and nearest-neighbour. INK uses the same logical grid (its canvas is `INK_SCALE`x internally, only the CSS size changes) and may use a **fractional** scale (floored to 0.01) only when the integer would leave more than 12% unused in the limiting dimension. Below 1x of available space every style shrinks fractionally.
It re-runs on resize, orientation change and viewport resize (ResizeObserver).

- Desktop: `.viewport` is `flex:1` in `.col-world`, so INTERACT / MAP / RETRACE sit below it at a fixed position; they do not move during play.
- Mobile portrait: `.viewport` keeps a 16:9 box at full panel width; touch buttons are at least 44px (title bar, tabs, D-pad 48-52, ACT/CALL/ARCHIVE 48, mini buttons).
- Mobile landscape (max-width 849, max-height 520): D-pad | world | ACT/CALL/ARCHIVE in one row so the canvas keeps full height. The partner subtitle line is hidden there (the LINK tab still shows it).

| Viewport | World area | PIXEL | INK / INK-LIGHT |
|---|---|---|---|
| 1280x800 | 892x617 | 2x | 2.78x |
| 1920x1080 | 1532x897 | 4x | 4.78x |
| 1366x768 | 978x585 | 3x | 3x |
| 360x740 | 348x196 | 1x | 1x |
| 740x360 | 402x191 | 1x | 1x |

`node e2e/layout.mjs` (optional `STYLES=ink`, `SHOTS_DIR=...`) checks all of these for every style: canvas inside the viewport and screen, no page overflow, actions bar unchanged after walking, PIXEL integer, mobile buttons >= 44px (WORLD and LINK tabs).

## Tunable constants

`INK_CFG` in `src/game/ink.ts` (units are hi-res pixels = 1/4 logical pixel). The table shows the INK-LIGHT value, then the dark INK value where it differs (`CFG_LIGHT` / `CFG_DARK`):

| Constant | Default | Effect |
|---|---|---|
| `wobble` | 2.2 / 2.4 | Outline wobble amplitude (domain warp). 0 = clean vector-like lines, 4+ = very shaky. |
| `lineWidth` | 1.0 | Global ink line weight. |
| `gap` | 0.80 / 0.86 | Noise threshold where outlines break. Lower = more broken lines. |
| `doubleLine` | true | Faint second offset stroke on silhouettes. |
| `hatchSpacing` / `hatchWidth` / `hatchAlpha` / `hatchBreak` | 6 / 1.5 / 0.72 / 0.42, dark: 9 / 1.7 / 0.55 / 0.55 | Hatch density, thickness, darkness, and stroke length (higher `hatchBreak` = shorter, sparser strokes). |
| `misreg` | 2.6 / 3.2 | How far grey patches drift from the line art. |
| `sponge` | 1.7 / 1.5 | Per-pixel jitter of patch edges (rough edge). |
| `pores` | 0.06 / 0.025 | Fraction of light sponge pores in patches. |
| `grain` | 0.05 / 0.035 | Paper grain amplitude. |
| `objectLine` | 1.0 / 1.7 | Line weight multiplier for objects, beings and interactables (calm tiles use 0.8 in dark INK). |
| `calmTicks` | 3 / 1 | Grass-tick strokes per ground tile. |
| `patchThr` | 0.5 / 0.6 | Ground patch noise threshold; higher = fewer, larger tone patches. |

Other knobs: `INK_SCALE` (`artStyle.ts`, 4; texture and canvas scale, 3 is lighter on slow GPUs), tone colours in `TONES`, per-tile colour overrides in `OVERRIDES`,
`GROUND_VARIANTS` (`sprites.ts`), portrait geometry in `portrait()`. `lineMul`, `hatchSpacing`, `misreg` are overridden per portrait.

## Verification done

- `npm run build` and `npx vitest run` (27 tests) pass.
- `STYLE=ink|ink-light|pixel node e2e/run.mjs`: all checks pass in the three styles (movement, interact, forks, archive, retrace, mobile d-pad, win/ending, no browser errors).
  `STYLE`/`SHOTS_DIR` env vars choose the style and screenshot folder (default `docs/shots/` for pixel, `docs/shots/ink-dark/` for ink, `docs/shots/ink/` for ink-light).
- Screenshots: `docs/shots/ink-dark/` (dark INK), `docs/shots/ink/` (INK-LIGHT, first pass) and `docs/shots/pixel-compare/` use the same file names (02-world, 03-fork-panel, 05-archive-node-detail, 06-high-drift, 07-mobile-world, ...).
  `docs/shots/ink/sheet-tiles.png`, `sheet-chars.png` and `portrait-*.png` show the generated textures directly.

## Performance (headless Chromium, software GL, so indicative only)

- Texture generation at load: tiles ~65 ms, characters ~46 ms, fx ~1 ms (65 frames at 4x) = ~115 ms. Pixel style: ~1 ms.
- Portraits are generated lazily on first use, ~80 ms each (320x320), cached; 6 variants max.
- Frame rate over 4 s on the start-game scene: PIXEL ~60 fps, INK ~44 fps (1280x720 canvas instead of 320x180, software rasteriser). A real GPU should not notice, a weak integrated GPU or phone might; try `INK_SCALE = 3`.
- Memory: the ink sheets are 512x256 (tiles) and 192x768 (chars) plus a 1280x720 canvas.

## Honest limitations

- The designer's reference is a hand-painted pack; this is a procedural imitation. Lines wobble and vary in weight and shading is hatched and sponge-patched, but it will read more "filtered" than drawn, especially on large flat areas (walls, water). Expect to tune `INK_CFG` and the tone overrides by eye.
- The source art is 16x16 / 12x16, so shapes are limited by that information (the beings have simple silhouettes; thin lattices such as the radio tower are coarse). A real redraw at higher resolution would look better.
- INK-LIGHT keeps the pale-paper world inside the dark UI (strong contrast, kept only for comparison). Dark INK removes that contrast but loses some of the "ink on paper" feel because dark fills hide hatching and pale lines on navy read as chalk more than pen.
- The inked overlays (flood, beam, drift tint, bridge) are used by both ink variants; they were tuned by numbers (pixel statistics, ASCII colour maps of the screenshots) and not yet judged by eye.
- Ink textures are LINEAR filtered; this is seam-free because sprites/tiles are placed on whole logical pixels (4 hi-res px).
- Switching style reloads the page.
- The agent that built this had no image viewer. Layout, contrast and structure were checked with programmatic tests (e2e, bounding boxes, colour-class dumps of the screenshots), not by eye; a human pass on the screenshots is still needed.

## SCRIBBLE (V2 default)

Graphite sketch on warm paper (`?style=scribble`, the default; cycle order SCRIBBLE -> PIXEL -> INK -> INK-LIGHT, list exported as `ART_STYLES` in `src/game/artStyle.ts`).

- Ground, trees, plants, puddle, bridge, path, chest and campfire art come from the **Kenney "Scribble Dungeons"** pack (public/assets/scribble). **Credit: Kenney (kenney.nl), licence CC0 1.0** (see `public/assets/scribble/LICENSE_Kenney_CC0.txt`).
- The PNGs are 64px, shown 1:1 on a 1280x720 canvas (logical 320x180 grid, camera zoom 4) with smooth (linear) filtering, so strokes are never nearest-neighbour scaled.
- Landmarks are mapped to tiles/procedural ink: old lamp (post + lantern, campfire sprite when lit), nursery (3x2 glasshouse, `plants` sprites alive / drooping stalks withered, `puddle` when flooded), signal mast (lattice + cyan arcs, red X when dead), tidal gate (posts, planks, gauge), echo stones (menhirs, pink glyph once examined), thread terminal (`chest` sprite), lighthouse (striped tower, amber lamp + beam), anchors (dashed ground sigils; amber half = you ready, cyan half = partner ready, both = aligned glow).
- State-dependent: bridge intact/broken (from the node's BRIDGE_CLOSED flag), ford stones visible only when walkable, sand path flooded exactly where topology marks it unwalkable, withered/alive nursery, lit/dark lamp.
- Accents: amber / cyan only for the two beings, lit lamp, anchors and thread; dusty pink for echoes and branch bloom.
- ALIEN realm: inverted paper (dark violet, pale strokes made at load time from the same PNGs), overgrowth sprites on most open tiles, drifting spores.
- Dev harness: `/shots.html` + `node e2e/scribble-shots.mjs` (screenshots into docs/shots/v2/).
