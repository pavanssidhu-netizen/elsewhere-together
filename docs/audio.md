# Audio

All sound goes through one Web Audio facade, `createDCAudio()` in `src/game/audio/dcAudio.ts`. It never throws. Real ElevenLabs files are used when present; otherwise the game plays synthesised stand-ins, so it is always playable.

## What is in the game

| Kind | Count | Where | Made with |
|---|---|---|---|
| Voice lines | 46 | `public/assets/game/audio/voice/<id>.mp3` | ElevenLabs Text to Speech |
| Music | 7 tracks: `cosmic`, `forest`, `forest_tense`, `final_minute`, `office`, `runner`, `reunion` | `.../music/<id>.mp3` | ElevenLabs Music |
| Sound effects | 22 | `.../sfx/<id>.mp3` | ElevenLabs Sound Effects |

- Voices: Time Master = Cassius (deep, commanding British), Jensen = Liam, Sam = Will. Change them with `--tm-voice`, `--jensen-voice`, `--sam-voice` or the `DEFAULT_VOICES` table in `scripts/audio/generate_audio.py`.
- The `office` track is deliberately comic drum and bass, to clash with the Time Master's posh voice. The prompts for every track are in `MUSIC_PROMPTS` in the same script.
- Every voice line, its speaker, mood and caption text lives in `src/game/content/lines.ts`. That file is the single source for captions and for what gets generated.

## How playback works

```
music tracks -> stress gain -> music lowpass -> music vol --\
voice        -> voice lowpass (>= 3.6 kHz)  -> voice vol ----+-> master (mute) -> compressor -> out
sfx          ------------------------------> sfx vol -------/
```

- Nothing sounds until `unlock()` runs inside a user gesture (the first click or key).
- **Manifest.** `public/assets/game/audio/available.json` lists which mp3 files exist. The facade only requests listed files, so a missing file never causes a 404. `npm run build` regenerates it automatically (`prebuild`); run `npm run audio:manifest` by hand after adding files in dev.
- **Fallback.** If a file is not listed or fails to decode, a synthesised version plays (`synth.ts`, scores in `plan.ts`).
- **Music loops** are scheduled in passes with an equal-power crossfade, never `source.loop`, so they loop without a click. `playMusic(sameId)` is a no-op.
- **Bond stress** (`setBondStress(0..1)`) lowers music volume and lowpass as the forest goes wrong. Voices stay intelligible.
- **Voices** play one at a time; a new line cuts the old one, except that `playVoice(id, { priority: 'high' })` cannot be cut by a normal line. `isVoiceBusy()` lets demo mode wait for a line to finish.
- `getDCAudioDebug()` reports what played and whether it came from a file or the synth. Useful in the browser console.

## Regenerating or adding audio (costs ElevenLabs credits)

1. Put your key in `api_keys/elevenlabskey` (git-ignored) or `.env.local` as `ELEVENLABS_API_KEY=sk_...`. Never commit it.
2. Export the item list from the game code: `npx vite-node scripts/audio/export_lines.ts` (writes `public/assets/game/audio/lines.json`).
3. Dry run, which spends nothing: `python3 scripts/audio/generate_audio.py`. It lists every item, the credit estimate and which files already exist.
4. Free key and balance check: `python3 scripts/audio/generate_audio.py --check --key-file api_keys/elevenlabskey`.
5. Generate: `python3 scripts/audio/generate_audio.py --go --key-file api_keys/elevenlabskey --only voice:tm_intro_1 --max-credits 500`.
   - `--only` accepts `voice`, `music`, `sfx`, an item id, or `kind:id`, and can be repeated.
   - Existing files are skipped unless you add `--force`.
   - `--max-credits` stops the run if the estimate is higher.
6. Run `npm run audio:manifest`, then listen. Delete any file you dislike and the synth stand-in takes over again.

Credit estimates in the script are approximate (text about 1 credit per character, sound effects about 40 per second, music about 20 per second). The account balance can lag by a few minutes after a run.

## Tests

`src/game/audio/*.test.ts` cover the facade, the file fallback and the manifest script. `node scripts/audio/qa_audio.mjs` is a headless-Chromium check that file backing, loop passes and the single manifest request behave. No tool here can judge how it sounds; listen to it yourself.
