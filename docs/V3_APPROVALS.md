# V3 approvals log

Only the user can record an approval. The agent records what it presented.

## Gate A: asset choice and object inventory

**Presented:** `docs/v3/gateA-contact-sheet.png` (real imported files at 64 px game-tile scale, rendered in headless Chromium). The files are in `public/assets/imported/`, the manifest is `public/assets/manifest.json` (60 files) and the credits are in `ASSET_CREDITS.md`.

**Missing roles:** lantern, lighthouse/beacon, humanoid symbiotes (the packs have only round blob characters).

**Status:** awaiting user reply (`APPROVE A` or corrections).

**User reply (verbatim intent):** "yes ... I'm fine with you choosing the objects from that sheet ... those round characters are what I want for the characters, call one Jensen and the other one Sam."
**Recorded as:** APPROVED A by user. Characters = Scribble Platformer `character_roundYellow` (Jensen, amber) and `character_roundGreen` tinted cyan (Sam). Lead chooses objects: clearing fire = `campfire`; beacon = `stairs_down` + `wall_curve` ring + `campfire`; resonant stones / thread stone = `tiles_decorative`; garden = walls + `plants` + `door_open`; sluice = `door_closed`/`door_open` + `wood`; bridge = `bridge` / `bridge_end` + `planks`; trees `tree`; forest border ink-forest crops; water `water`/`puddle`; path `path*`; floor `grass`/`tile`. Side-on platformer tiles excluded.

## Gate B: one playable clearing
**Status:** in progress.
**Presented (lead, integrated build):** `docs/v3/gateB-live-desktop.png` (1280x800) and `docs/v3/gateB-live-mobile.png` (390x844), from the built `dist/` in headless Chromium after Play, skip facts, choose JENSEN, walk right. 0 page errors. 26 manifest textures loaded (`docs/v3/gateB-assets.txt`) plus Sam = `character_roundGreen` recoloured cyan. Object crops: `docs/v3/gateB-crop-*.png` (agent-captured, positions forced).
**Status:** awaiting user reply (`APPROVE B` or corrections).

## V4 Checkpoint A: first playable proof
**Presented:** `docs/v4/A-*.png` (proof script A, seed 1, played in the real built game in headless Chromium through MOVE/INTERACT, 36 commands, 0 page errors). Contact reached: river diverted -> wheel stopped + carving reachable -> read frequency -> followed the other history at the sluice -> powered radio tuned -> partner answers.
**Status:** awaiting user reply.
