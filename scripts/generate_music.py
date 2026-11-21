"""Build-time only: generate the single backing-track loop via ElevenLabs Music API.
Key: env ELEVENLABS_API_KEY or --key-file. Never printed. Skips if output exists."""
import json, os, sys, urllib.request
OUT = 'public/assets/audio/music_theme.mp3'
PROMPT = open('scripts/music_prompt.txt').read().strip()
def key():
    if '--key-file' in sys.argv: return open(sys.argv[sys.argv.index('--key-file') + 1]).read().strip()
    return os.environ['ELEVENLABS_API_KEY']
if os.path.exists(OUT) and '--force' not in sys.argv: print('exists, skipping'); sys.exit(0)
body = json.dumps({'prompt': PROMPT, 'music_length_ms': 60000, 'force_instrumental': True}).encode()
req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=body, method='POST',
                             headers={'xi-api-key': key(), 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
try:
    with urllib.request.urlopen(req, timeout=240) as r: data = r.read()
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read()[:400].decode('utf8', 'replace')); sys.exit(1)
open(OUT, 'wb').write(data); print('wrote', OUT, len(data), 'bytes')
