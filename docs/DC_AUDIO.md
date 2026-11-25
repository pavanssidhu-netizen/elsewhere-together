# Director's Cut audio

**Status: ElevenLabs audio NOT generated: no valid secret key; all sound is synthesised stand-ins.**

## How it works
`createDCAudio(settings)` (`src/dc/audio/dcAudio.ts`) is a no-throw facade over one Web Audio graph:

```
music tracks -> stress gain -> music lowpass -> music vol --\
voice        -> voice lowpass (>= 3.6 kHz)  -> voice vol ----+-> master (mute) -> compressor -> out
sfx          ------------------------------> sfx vol -------/
```
- Nothing sounds, and nothing throws, until `unlock()` runs inside a user gesture. `playMusic` before that is remembered and starts on unlock. `playVoice` before unlock stays silent but resolves after the caption-scaled time.
- Every request first tries `assets/dc/audio/{music,voice,sfx}/<id>.mp3`. A missing file, or the dev server's HTML fallback page (detected by content-type, header bytes and decode failure), falls back to a synthesised stand-in. Decoded buffers are cached.
- Music: 6 original synth loops (`plan.ts` holds the scores, `synth.ts` the instruments), a look-ahead scheduler, equal-power crossfade (default 1500 ms), `playMusic(sameId)` is a no-op. `reunion` plays once.
- `setBondStress(0..1)`: music gain and lowpass drop, upper layers thin out, pitch detunes up to 28 cents (0.3-0.7 s ramps). Voice lowpass stays >= 3.6 kHz; SFX are untouched.
- Voice stand-in: formant babble, length = 55 ms x caption chars + 300 ms. Time Master low and resonant, Jensen high and bubbly, Sam nervous mid. Moods change pitch/tempo/wobble. One voice at a time; `skipVoice()` resolves at once.
- QA: `getDCAudioDebug()` returns music id and backing (`file`/`synth`), bus volumes, stress, and `requested['voice:id'|'music:id'|'sfx:id']`.

## Hear it with no credits
`npm run dev` and play the game: the synthesised versions are used automatically. To hear just the audio: open `/src/dc/audio/qa/qa.html`, click the button, then in the console e.g. `__qa.audio.playMusic('forest')`, `__qa.audio.playVoice('tm_intro_2')`, `__qa.audio.setBondStress(1)`. Automated check (headless Chromium, measures output level, cannot hear): `node scripts/qa_dc_audio.mjs`.

## Getting the real ElevenLabs audio
1. Export the line list (already committed as `public/assets/dc/audio/lines.json`): `npx vite-node scripts/export_dc_lines.ts`.
2. Dry run (no network, key not read): `python3 scripts/generate_dc_audio.py`. It lists every item, character counts, the 6 music prompts, SFX durations, estimated credits and which files exist.
3. The creative director approves samples first: generate a few with `--only`, e.g. `--only voice:tm_intro_1 --only music:cosmic --only sfx:beep`, and listen. Pick the voice ids (Time Master: one deep, commanding voice) and pass `--tm-voice`, `--jensen-voice`, `--sam-voice` (the built-in defaults are unverified guesses).
4. With a real secret key (starts with `sk_`; the key file in `api_keys/` holds a key ID, which does not work): `ELEVENLABS_API_KEY=sk_... python3 scripts/generate_dc_audio.py --go`. Guards: `--max-credits` (default 6000), existing files are skipped, `--force` regenerates. Output goes to `public/assets/dc/audio/{voice,music,sfx}/<id>.mp3`. The key is never printed.
5. Credit figures are estimates (TTS ~1/char, SFX ~40/s, music ~20/s assumed). Delete any file you dislike; its synthesised stand-in takes over again.

## Real files, manifest, loops (AUDIO agent update)
- **Files first.** `assets/dc/audio/{voice,music,sfx}/<id>.mp3` win; the synthesised stand-ins play only when a file is not listed or fails to decode.
- **Manifest.** At first `unlock()` the facade fetches ONE `assets/dc/audio/available.json` = `{ voice: string[], music: string[], sfx: string[] }` and requests only listed files (no 404 spam). Missing, non-JSON or malformed manifest = nothing available (pure synth); it never throws. Generate it with `node scripts/dc_audio_manifest.mjs [dir]` (scans the three folders for `.mp3` >= 256 bytes, sorted, rewrites only on change). The build must run it after the mp3s exist.
- **Music loops.** File music never uses `source.loop`. Passes are scheduled ~2.5 s ahead; pass k+1 starts `crossfade` before pass k ends (`crossfade = min(1.25 s, duration/4)`), with an equal-power sin-in / cos-out pair. `reunion` plays one pass. Track changes fade equal-power over `fadeMs` (default 1500) starting from the outgoing track's current gain; `playMusic(sameId)` is a no-op and a newer request abandons an older one still loading. Bond stress still acts on the shared music bus (gain + lowpass), so it applies to files too.
- **Voice.** One line at a time; a new line cuts the old one. `playVoice(id, { priority?: 'normal' | 'high' })`: while a `high` line plays, a `normal` request is dropped (resolves immediately, nothing plays), so a jab cannot cut a story line. `DCAudio` in contracts.ts only declares `playVoice(id)`; callers typed as `DCAudio` cannot pass the option. `createDCAudio` returns `DCAudioWithPriority` (a compatible subtype) so a caller can use it. `skipVoice()` always cuts. A file that fails to decode falls back to babble.
- **New synth stand-ins.** `forest_tense`: C minor, 124 bpm, strings, timpani, tom pulse, rising strings in the last 8 beats. `final_minute`: 150 bpm string-stab ostinato, kick on every beat, timpani, choir pad. `fail_sting`: low-brass swell (two detuned saws), sub boom and a cymbal-like noise burst.
- **QA.** `node scripts/qa_dc_audio.mjs` serves a manifest plus synthetic WAV fixtures and checks `file` backing, loop pass counts, a single manifest request, and no request for any id not in the manifest. Nothing here was auditioned by ear.
