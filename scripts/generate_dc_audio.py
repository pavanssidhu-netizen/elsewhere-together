#!/usr/bin/env python3
"""Generate voice / music / SFX for "OUT OF SYNC: Director's Cut" with ElevenLabs.

DRY RUN BY DEFAULT: no network, the key is not even read. Real calls only with --go, and only if the
key (env ELEVENLABS_API_KEY, or --key-file) starts with 'sk_'. The key is never printed or logged.

  python3 scripts/generate_dc_audio.py                       # dry run: plan, credit estimate, existing files
  python3 scripts/generate_dc_audio.py --only music          # filter (repeatable): voice | music | sfx | an item id | kind:id
  ELEVENLABS_API_KEY=sk_... python3 scripts/generate_dc_audio.py --go --only music:cosmic
  python3 scripts/generate_dc_audio.py --go --key-file path/to/file --max-credits 8000

Needs public/assets/dc/audio/lines.json:  npx vite-node scripts/export_dc_lines.ts
Outputs: public/assets/dc/audio/{voice,music,sfx}/<id>.mp3 (existing files are skipped unless --force).
Python 3.9+, stdlib only.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "public", "assets", "dc", "audio")
LINES_JSON = os.path.join(AUDIO_DIR, "lines.json")
API = "https://api.elevenlabs.io"

# Premade voice ids are unverified guesses: the creative director picks the real ones (see docs/DC_AUDIO.md).
# Voices on the creative director's account (checked with --check): Adam = dominant, firm (Time Master); Liam = energetic (Jensen); Will = relaxed optimist (Sam).
DEFAULT_VOICES = {"TIME_MASTER": "ktrGUw7rURIQyMrQZqCu", "JENSEN": "TX3LPaxmHKxFdv7VOQHJ", "SAM": "bIHbv24MWmeRgasZH58o"}
TTS_MODEL = "eleven_multilingual_v2"

# Estimates, verify against your plan: TTS ~1 credit/char (0.5 for flash/turbo), SFX ~40 credits/s, music ~20 credits/s (ASSUMPTION).
TTS_CREDITS_PER_CHAR = 1.0
SFX_CREDITS_PER_SEC = 40
MUSIC_CREDITS_PER_SEC = 20

# stability, similarity_boost, style, use_speaker_boost per mood (lower stability = more expressive)
MOOD_SETTINGS = {
    "serious": (0.55, 0.8, 0.25), "sarcastic": (0.4, 0.8, 0.5), "smug": (0.4, 0.8, 0.55),
    "urgent": (0.3, 0.8, 0.6), "crying": (0.25, 0.75, 0.8), "cheery": (0.4, 0.75, 0.5),
}

SUFFIX = " Loopable, no vocals except the choral texture where stated, original composition, no resemblance to existing recordings."
MUSIC_PROMPTS = {
    "cosmic": "Clinical, spacious sci-fi ambience, distant electronic pulses, glass-like synths, slow evolving tones, restrained and mysterious.",
    "forest": "Playful dramatic classical fantasy with a memorable whimsical melody, bright strings, delicate woodwinds, celesta and gentle orchestral movement; supports humour and exploration.",
    "forest_tense": "Tense dramatic classical orchestration: rising strings, ominous low brass and timpani, a whimsical forest melody played in a minor key, unsettled but not yet frantic.",
    "final_minute": "Darker, urgent classical orchestration, fast strings, deep percussion, dramatic choral textures and tension.",
    "office": "Fast, hyper drum and bass, 174 BPM: rolling breakbeats, wobbling reese bass, rave stabs and a silly bouncy synth hook; cheerfully over-the-top and comical, the polar opposite of dignified.",
    "runner": "Energetic, rhythmically precise retro sci-fi arcade music suitable for a short high-intensity game.",
    "reunion": "Short warm musical resolution using motifs compatible with the whimsical forest theme.",
}
SFX_PROMPTS = {
    "beep": "short mechanical double beep, dry, no music",
    "ui_click": "tiny soft wooden UI click",
    "ui_confirm": "gentle two-note rising confirmation chime",
    "pink_flash": "glassy crack with a bright pink shimmer, short",
    "branch": "timeline splitting into two, quick bright shimmering whoosh",
    "beacon_light": "magic beacon igniting, warm rising sparkle and whoosh",
    "thread_call": "cyan magical thread calling across distance, ethereal rising hum with vibrato",
    "echo_cyan": "soft cyan glass echo ping repeating and fading",
    "tick": "single clock tick, dry, tiny",
    "warning": "three urgent soft alarm pulses, not harsh",
    "collapse": "reality collapsing, falling pitch rumble with crumbling noise",
    "fail_sting": "short ominous orchestral sting, low brass swell and a cracking cymbal, comedic doom",
    "abduct_beam": "sci-fi abduction beam, rising cyan hum with shimmer",
    "soup_plop": "comedic bloop of something dropping into thick soup",
    "lane_move": "quick light whoosh sideways",
    "hit": "short dull impact with a crunchy thud",
    "anchor_pickup": "bright three-note sparkling pickup",
    "thread_snap": "a taut string twanging and snapping",
    "cosmic_boom": "deep cosmic boom with long sub-bass tail",
    "reunion_chime": "warm bell chord, hopeful, long gentle tail",
    "pickup": "small cheerful item pickup blip",
    "fuel_burn": "short roaring whoosh of fuel burning",
}


def load_plan(args):
    if not os.path.exists(LINES_JSON):
        sys.exit("missing %s: run `npx vite-node scripts/export_dc_lines.ts` first" % LINES_JSON)
    with open(LINES_JSON, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    voices = {"TIME_MASTER": args.tm_voice, "JENSEN": args.jensen_voice, "SAM": args.sam_voice}
    items = []
    for l in data["lines"]:
        items.append({"kind": "voice", "id": l["id"], "who": l["who"], "voice_id": voices[l["who"]], "mood": l["mood"], "text": l["text"],
                      "credits": int(round(len(l["text"]) * TTS_CREDITS_PER_CHAR))})
    for m in data["music"]:
        items.append({"kind": "music", "id": m["id"], "text": MUSIC_PROMPTS[m["id"]] + SUFFIX, "duration": m["durationSec"],
                      "credits": int(round(m["durationSec"] * MUSIC_CREDITS_PER_SEC))})
    for s in data["sfx"]:
        d = max(0.5, s["durationSec"])
        items.append({"kind": "sfx", "id": s["id"], "text": SFX_PROMPTS.get(s["id"], s["id"]), "duration": d, "credits": int(round(d * SFX_CREDITS_PER_SEC))})
    for it in items:
        it["path"] = os.path.join(AUDIO_DIR, it["kind"], it["id"] + ".mp3")
        it["exists"] = os.path.exists(it["path"])
    return items


def selected(it, only):
    if not only:
        return True
    return any(o == it["kind"] or o == it["id"] or o == "%s:%s" % (it["kind"], it["id"]) for o in only)


def describe(it):
    if it["kind"] == "voice":
        return "voice %-16s %-11s %-8s %3d chars  ~%4d cr  \"%s\"" % (it["id"], it["who"], it["mood"], len(it["text"]), it["credits"], it["text"])
    if it["kind"] == "music":
        return "music %-13s %3ds  ~%4d cr\n        prompt: %s" % (it["id"], it["duration"], it["credits"], it["text"])
    return "sfx   %-14s %4.1fs  ~%4d cr  %s" % (it["id"], it["duration"], it["credits"], it["text"])


def read_key(key_file):
    """Key source order: env ELEVENLABS_API_KEY, then --key-file, then ./.env.local. Accepts a bare key or an ELEVENLABS_API_KEY=... line. Never printed."""
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    for path in ([key_file] if key_file else []) + [".env.local"]:
        if key or not path or not os.path.isfile(path):
            continue
        with open(path, "r") as fh:
            for line in fh.read().splitlines():
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                if "=" in line and line.split("=", 1)[0].strip() == "ELEVENLABS_API_KEY":
                    key = line.split("=", 1)[1].strip().strip("'\"")
                elif "=" not in line:
                    key = line
                if key:
                    break
    return key


def post(path, key, body, query=""):
    req = urllib.request.Request(API + path + query, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def generate(it, key, tts_model):
    q = "?output_format=mp3_44100_128"
    if it["kind"] == "voice":
        st, sim, style = MOOD_SETTINGS.get(it["mood"], MOOD_SETTINGS["serious"])
        body = {"text": it["text"], "model_id": tts_model,
                "voice_settings": {"stability": st, "similarity_boost": sim, "style": style, "use_speaker_boost": True}}
        return post("/v1/text-to-speech/" + it["voice_id"], key, body, q)
    if it["kind"] == "music":
        return post("/v1/music", key, {"prompt": it["text"], "music_length_ms": int(it["duration"] * 1000), "force_instrumental": True}, q)
    return post("/v1/sound-generation", key, {"text": it["text"], "duration_seconds": it["duration"], "prompt_influence": 0.5}, q)


def check_key(args):
    """Free sanity check: GET /v1/user/subscription (credits) and GET /v1/voices (ids + names). Prints no secret."""
    key = read_key(args.key_file)
    if not key.startswith("sk_"):
        print("NOT VALID: the value does not start with 'sk_' (length %d). That is a key ID, not the secret key. Create a new key in ElevenLabs and copy the sk_... value shown once." % len(key), file=sys.stderr)
        return 2
    def get(path):
        req = urllib.request.Request(API + path, headers={"xi-api-key": key, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    ok = True
    try:
        sub = get("/v1/user/subscription")
        left = sub.get("character_limit", 0) - sub.get("character_count", 0)
        print("key accepted. tier=%s credits left=%s of %s" % (sub.get("tier"), left, sub.get("character_limit")))
    except urllib.error.HTTPError as e:
        ok = False; print("subscription check failed: HTTP %d (%s). A restricted key may lack 'user' read permission; that is not fatal." % (e.code, e.read()[:160].decode("utf8", "replace")))
    try:
        voices = get("/v1/voices").get("voices", [])
        print("%d voices on this account (id  name  labels):" % len(voices))
        for v in voices[:60]:
            lab = v.get("labels") or {}
            print("  %s  %s  %s" % (v.get("voice_id"), v.get("name"), ",".join(str(x) for x in lab.values())))
    except urllib.error.HTTPError as e:
        ok = False; print("voice list failed: HTTP %d (%s). Needs the 'voices' read permission." % (e.code, e.read()[:160].decode("utf8", "replace")))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate the key with FREE read-only calls: shows plan, credits left and your voices. Spends nothing, never prints the key.")
    ap.add_argument("--go", action="store_true", help="really call ElevenLabs (needs a key starting with sk_)")
    ap.add_argument("--key-file", help="file holding the key (env ELEVENLABS_API_KEY wins)")
    ap.add_argument("--only", action="append", default=[], help="voice|music|sfx|<id>|<kind>:<id>, repeatable")
    ap.add_argument("--max-credits", type=int, default=6000, help="refuse to run if the estimate for items to generate exceeds this")
    ap.add_argument("--force", action="store_true", help="regenerate files that already exist")
    ap.add_argument("--tm-voice", default=os.environ.get("DC_TM_VOICE", DEFAULT_VOICES["TIME_MASTER"]), help="Time Master voice id (deep, commanding)")
    ap.add_argument("--jensen-voice", default=os.environ.get("DC_JENSEN_VOICE", DEFAULT_VOICES["JENSEN"]))
    ap.add_argument("--sam-voice", default=os.environ.get("DC_SAM_VOICE", DEFAULT_VOICES["SAM"]))
    ap.add_argument("--tts-model", default=TTS_MODEL)
    args = ap.parse_args()
    if args.check:
        return check_key(args)

    items = [it for it in load_plan(args) if selected(it, args.only)]
    todo = [it for it in items if args.force or not it["exists"]]
    print("== %s ==" % ("GENERATE" if args.go else "DRY RUN (no network, key not read)"))
    for kind in ("voice", "music", "sfx"):
        group = [it for it in items if it["kind"] == kind]
        print("\n-- %s (%d items, ~%d credits) --" % (kind, len(group), sum(i["credits"] for i in group)))
        for it in group:
            print("[%s] %s" % ("exists" if it["exists"] else "  new ", describe(it)))
    total = sum(i["credits"] for i in items)
    need = sum(i["credits"] for i in todo)
    print("\nTotal estimate, all selected: ~%d credits. To generate now (skip existing%s): %d items, ~%d credits. Guard --max-credits %d."
          % (total, ", --force" if args.force else "", len(todo), need, args.max_credits))
    print("(Estimates: TTS %.1f cr/char, SFX %d cr/s, music %d cr/s ASSUMED; check your plan.)" % (TTS_CREDITS_PER_CHAR, SFX_CREDITS_PER_SEC, MUSIC_CREDITS_PER_SEC))
    if not args.go:
        print("Dry run only. Nothing generated.")
        return 0
    key = read_key(args.key_file)
    if not key.startswith("sk_"):
        print("Refusing: no valid secret key (value must start with 'sk_'). A key ID is not a secret. Set ELEVENLABS_API_KEY or --key-file.", file=sys.stderr)
        return 2
    if need > args.max_credits:
        print("Refusing: estimate %d > --max-credits %d. Narrow with --only or raise the guard." % (need, args.max_credits), file=sys.stderr)
        return 3
    failures = 0
    for it in todo:
        os.makedirs(os.path.dirname(it["path"]), exist_ok=True)
        try:
            data = generate(it, key, args.tts_model)
            with open(it["path"], "wb") as fh:
                fh.write(data)
            print("wrote %s (%d bytes)" % (os.path.relpath(it["path"], ROOT), len(data)))
        except urllib.error.HTTPError as e:
            failures += 1
            print("FAILED %s:%s HTTP %s" % (it["kind"], it["id"], e.code), file=sys.stderr)  # body omitted: never echo request data
        except Exception as e:  # noqa: BLE001
            failures += 1
            print("FAILED %s:%s %s" % (it["kind"], it["id"], type(e).__name__), file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
