# Audio and assets (designer notes)

## What exists

| Piece | File | Notes |
|---|---|---|
| Music | `src/audio/audioEngine.ts` | Fully synthesized in the browser. No music files, no ElevenLabs music. |
| Voice (9 lines) | `public/assets/audio/voice_<cue>.mp3` | Optional. Missing file = soft two-note blip, subtitles still show. |
| SFX (6) | `public/assets/audio/sfx_<name>.mp3` | Optional. Missing file = synthesized stand-in. |
| Sprites/tiles | `src/game/sprites.ts` | Pixel art drawn in code onto canvas textures. No image files. Frame keys are listed at the top of the file. |
| Generator | `scripts/generate_audio.py` | Dry run by default. |

Cue ids: `boot find safe help echo_received divergence overstrain anchor final`.
SFX names: `branch_split echo_send archive_open anchor_lock drift_warning final_merge`.

## Music

Original, ~84 BPM, 8-bar loop (Dm, Bb, F, C, Dm, Gm, C, F), so it sits in D minor and resolves to F major.
Both layers use one shared clock, so they stay in key.

- **Amber layer**: warm triangle pad, bass, and a plucked "felt piano" melody.
- **Cyan layer**: sparse glass bells over the same chords, plus a delay.
- **Drift (0-100)**: cyan lowpass closes (7 kHz to 800 Hz), bells detune up to ~45 cents, cyan gets quieter, more delay wet/feedback. Partner voice gets a moderate lowpass (never below ~3.5 kHz, so speech stays understandable). Amber is only slightly darkened.
- **Strain (0-100)**: from 15 up a low heartbeat (lub-dub) fades in; beyond 60 it beats every beat. Cyan bells drift off the grid (random timing jitter that grows with strain).
- `setState(drift, strain)` ramps over about 0.5 s. Call it whenever the sim state changes.
- `playConvergence()` for the ending: removes drift/strain colouring, swells a wide F major chord, and plays amber and cyan phrases in tune.

Audio starts only after `unlock()` (call it from the Start button or first touch). Before that every call is a no-op. The context suspends when the tab is hidden.

### Engine API

```ts
const audio = new AudioEngine();
audio.unlock();                       // inside a user gesture
audio.setState(drift, strain);
audio.playVoice('anchor');            // VoiceCue from src/sim/types.ts
audio.playSfx('branch_split');
audio.playConvergence();              // ending
audio.setMuted(true); audio.setVolume(0.6); audio.isMuted();
```

Voice rules: one line at a time. Priority: final 4, anchor 3, echo_received/divergence/overstrain 2, others 1. A line can only be interrupted by a strictly higher priority. Same cue is throttled for 15 s (except `final`), and low-priority lines wait 1.2 s after any line. SFX repeats are throttled too (`drift_warning` 8 s).

## Hearing changes without credits

Nothing in the game needs ElevenLabs. With no mp3 files you get the synthesized music, synthesized SFX and blip voices. To tweak music, edit `CHORDS`, `MELODY`, `BELL_BEATS`, or `BPM` at the top of `audioEngine.ts` and reload (vite hot reload). To test drift/strain by hand, run `audio.setState(80, 70)` from the browser console if the game exposes the engine, or use the sim's demo seed and push drift up in play.

You can also drop in any mp3 with the right file name (a free TTS, a recording of your own voice) into `public/assets/audio/` and the game uses it with no code change.

## Generating the real voice and SFX (spends credits)

```
python3 scripts/generate_audio.py                  # dry run: prints items, characters, estimate, existing files
python3 scripts/generate_audio.py --only voice_boot --only sfx_anchor_lock   # pick a few
python3 scripts/generate_audio.py --go --key-file api_keys/elevenlabskey      # real calls
```

- The key comes from env `ELEVENLABS_API_KEY` or `--key-file`. The script never prints it. `api_keys/` is gitignored; do not put the key anywhere else.
- Only TTS (9 lines) and SFX (6 clips, `duration_seconds` set) are requested. There is no music call.
- Existing files are skipped (`--force` regenerates and costs credits again).
- It refuses if the estimate exceeds `--max-credits` (default 3000).
- Voice: `--voice-id` or env `ELEVENLABS_VOICE_ID` (default is a premade voice; confirm it exists in your account). Model: `--tts-model` (default `eleven_multilingual_v2`; `eleven_flash_v2_5` is about half the cost).
- Estimate with the defaults: 934 characters, about 799 credits (9 voice lines about 379, SFX 420). Costs are an estimate based on ~1 credit per TTS character and ~40 credits per SFX second; check your plan.

## Limitations

- The synthesized "felt piano" is a plucked triangle, not a sampled piano. It sounds like a soft music box.
- Synth voice stand-ins are blips, not speech.
- Generated mp3 files were not auditioned for loudness. If they sound too quiet or loud, change `voiceGain` / `sfxGain` in `build()`.
