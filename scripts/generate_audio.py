#!/usr/bin/env python3
"""Generate voice lines (TTS) and SFX for "Elsewhere, Together" with ElevenLabs.

DEFAULT IS A DRY RUN: nothing is sent over the network and the API key is not even read.
Real calls happen only with --go. No music is ever generated (music is synthesized in the browser).

Usage:
  python3 scripts/generate_audio.py                      # dry run: items, characters, credit estimate
  python3 scripts/generate_audio.py --only voice_boot    # restrict to some items (repeatable)
  ELEVENLABS_API_KEY=... python3 scripts/generate_audio.py --go
  python3 scripts/generate_audio.py --go --key-file api_keys/elevenlabskey

Python 3.9+, stdlib only. The key is never printed or logged.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "assets", "audio")
API = "https://api.elevenlabs.io"

# Premade ElevenLabs voice; change with --voice-id or env ELEVENLABS_VOICE_ID (check it exists in your account).
DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
DEFAULT_TTS_MODEL = "eleven_multilingual_v2"

# Estimates (verify against your plan): TTS ~1 credit/char (multilingual_v2/v3), 0.5/char for flash/turbo models;
# sound generation ~40 credits per second when duration_seconds is given.
SFX_CREDITS_PER_SECOND = 40

VOICE_LINES = [
    ("boot", "I can hear you. I don't know where you are."),
    ("find", "I'll follow the strongest trace. Just keep the light on."),
    ("safe", "I'm staying here for a moment. This world is holding."),
    ("help", "I can reach towards your path. It'll cost me."),
    ("echo_received", "You gave that up for me? I felt it."),
    ("divergence", "There are too many versions of your voice."),
    ("overstrain", "Please. We can't keep borrowing from tomorrow."),
    ("anchor", "I found it. Something here remembers us both."),
    ("final", "There you are."),
]

# (name, prompt, duration_seconds)
SFX = [
    ("branch_split", "Short delicate reality bifurcation, a single glassy bell cracking into two reversed shimmering echoes, no music, no speech", 1.5),
    ("echo_send", "Soft warm energy pulse traveling through an organic thread, delicate synth shimmer and close resonant heartbeat", 1.0),
    ("archive_open", "Low vintage computer interface wakeup tone and subtle paper-like digital flutter", 1.0),
    ("anchor_lock", "Hopeful ascending three-note glass harmony, long luminous tail, no speech", 2.0),
    ("drift_warning", "Distant radio signal falling out of tune, gentle tape warble, non-harsh", 2.0),
    ("final_merge", "Warm resolved holographic chord rising and settling like a lighthouse beam, cinematic but intimate", 3.0),
]


def build_items(tts_model):
    per_char = 0.5 if ("flash" in tts_model or "turbo" in tts_model) else 1.0
    items = []
    for cue, text in VOICE_LINES:
        items.append({
            "name": "voice_" + cue, "kind": "tts", "text": text,
            "chars": len(text), "credits": int(round(len(text) * per_char)),
            "path": os.path.join(OUT_DIR, "voice_%s.mp3" % cue),
        })
    for name, prompt, dur in SFX:
        items.append({
            "name": "sfx_" + name, "kind": "sfx", "text": prompt, "duration": dur,
            "chars": len(prompt), "credits": int(round(dur * SFX_CREDITS_PER_SECOND)),
            "path": os.path.join(OUT_DIR, "sfx_%s.mp3" % name),
        })
    return items


def read_key(key_file):
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key and key_file:
        with open(key_file, "r") as fh:
            key = fh.read()
    key = key.strip()
    if key.startswith("ELEVENLABS_API_KEY="):
        key = key.split("=", 1)[1].strip()
    return key


def post(url, key, body, accept="audio/mpeg"):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": accept},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--go", action="store_true", help="make real API calls (default: dry run)")
    ap.add_argument("--max-credits", type=int, default=3000, help="refuse if estimated credits exceed this (default 3000)")
    ap.add_argument("--voice-id", default=os.environ.get("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID))
    ap.add_argument("--tts-model", default=DEFAULT_TTS_MODEL)
    ap.add_argument("--key-file", default=None, help="file containing the API key (alternative to env ELEVENLABS_API_KEY)")
    ap.add_argument("--only", action="append", default=[], help="item name to include, e.g. voice_boot or sfx_anchor_lock (repeatable)")
    ap.add_argument("--force", action="store_true", help="regenerate files that already exist (costs credits)")
    args = ap.parse_args()

    items = build_items(args.tts_model)
    if args.only:
        unknown = [n for n in args.only if n not in [i["name"] for i in items]]
        if unknown:
            print("Unknown item(s): %s" % ", ".join(unknown), file=sys.stderr)
            return 2
        items = [i for i in items if i["name"] in args.only]

    print("Mode: %s" % ("REAL CALLS (--go)" if args.go else "DRY RUN (no network, key not read)"))
    print("Output dir: %s" % os.path.relpath(OUT_DIR, ROOT))
    print("TTS voice id: %s   model: %s" % (args.voice_id, args.tts_model))
    print("")
    print("%-22s %-5s %6s %8s  %s" % ("item", "kind", "chars", "credits", "status"))
    todo = []
    total_chars = total_credits = 0
    for it in items:
        exists = os.path.exists(it["path"])
        skip = exists and not args.force
        status = "SKIP (exists)" if skip else ("overwrite" if exists else "generate")
        extra = "" if it["kind"] == "tts" else "  [%.1fs]" % it["duration"]
        print("%-22s %-5s %6d %8d  %s%s" % (it["name"], it["kind"], it["chars"], it["credits"], status, extra))
        if not skip:
            todo.append(it)
            total_chars += it["chars"]
            total_credits += it["credits"]
    print("")
    print("To generate: %d item(s), %d characters, ~%d credits (estimate)" % (len(todo), total_chars, total_credits))
    print("Skipped (already exist): %d" % (len(items) - len(todo)))
    over = total_credits > args.max_credits
    if over:
        print("REFUSING: estimate %d exceeds --max-credits %d" % (total_credits, args.max_credits))

    if not args.go:
        print("\nDry run only. Re-run with --go to generate (needs ELEVENLABS_API_KEY or --key-file).")
        return 1 if over else 0
    if over:
        return 2
    if not todo:
        print("Nothing to do.")
        return 0

    try:
        key = read_key(args.key_file)
    except (IOError, OSError) as exc:
        print("Cannot read key file: %s" % exc.__class__.__name__, file=sys.stderr)
        return 2
    if not key:
        print("No API key: set ELEVENLABS_API_KEY or pass --key-file PATH.", file=sys.stderr)
        return 2

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    failures = 0
    for it in todo:
        try:
            if it["kind"] == "tts":
                url = "%s/v1/text-to-speech/%s?output_format=mp3_44100_128" % (API, args.voice_id)
                body = {"text": it["text"], "model_id": args.tts_model,
                        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
            else:
                url = "%s/v1/sound-generation?output_format=mp3_44100_128" % API
                body = {"text": it["text"], "duration_seconds": it["duration"], "prompt_influence": 0.5}
            data = post(url, key, body)
            tmp = it["path"] + ".part"
            with open(tmp, "wb") as fh:
                fh.write(data)
            os.replace(tmp, it["path"])
            print("wrote %s (%d bytes)" % (os.path.relpath(it["path"], ROOT), len(data)))
        except urllib.error.HTTPError as exc:
            failures += 1
            detail = exc.read()[:200].decode("utf-8", "replace")
            print("FAILED %s: HTTP %d %s" % (it["name"], exc.code, detail), file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 - report class only, never request headers
            failures += 1
            print("FAILED %s: %s" % (it["name"], exc.__class__.__name__), file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
