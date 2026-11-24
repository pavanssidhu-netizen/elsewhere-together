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
