# Presentation layer

Files: `index.html`, `src/main.ts` (wiring, save, keys, audio events), `src/game/layout.ts` (map + fixed object positions),
`src/game/WorldScene.ts` (Phaser 320x180 scene), `src/ui/*` (`shell.ts` DOM shell, `panels.ts` fork + archive, `metaEffects.ts`, `styles.css`).

## Controls
| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | D-pad |
| Interact (fork, anchor, rest terminal) | E / Space | ACT |
| Archive | Tab / M | ARCHIVE button or tab |
| Call partner | C | CALL |
| Retrace selected visited ancestor (archive open) | R | RETRACE button in archive |
| Close overlay / back out of fork | Esc | Back button |
| Help | H / ? | HELP |

Title bar: MUSIC on/off and DISTORTION full/low (reduce visual distortion). Both persist (`elsewhere-together-prefs-v1`).
Save: `elsewhere-together-save-v1`, written after every dispatch. A corrupt save shows NEW GAME only and is left untouched until chosen.
Start screen: START/CONTINUE, NEW GAME, DEMO PATH (plays `cheapestWinPath()` from seed 48219).
Test hook: `window.__et.engine`.

## Meta effects (metaEffects.ts)
Classes `drift-b0..3` and `strain-b0..3` (bands 30/60/80) plus `reduce-distortion` on `.os`. They only restyle decorative layers
(panel frame offset, noise, banners). Nothing moves buttons or hitboxes; nothing animates faster than ~0.5 Hz.

## Testing
`node e2e/run.mjs` spawns vite and drives headless Chromium (playwright resolved from `PLAYWRIGHT_PATH` / npx cache, browser via `CHROME_PATH`). It writes screenshots to `docs/shots/`.
`?debug=1` exposes `window.__et.debug` (`setMeters(drift, strain)`, `pos()`, `teleport()`, ...). R with the archive closed retraces to the nearest visited ancestor, otherwise opens the archive with a hint.
Subtitles are never degraded; only the SIGNAL label reflects state.
