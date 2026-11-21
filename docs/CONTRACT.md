# Team contract (read first)

Spec: `/local/home/pavsidh/elsewhere-together/elsewhere_together_implementation_spec.md`. Types: `src/sim/types.ts` (frozen).

## Engine API (owned by Sim agent, `src/sim/engine.ts`)
```ts
export class SimEngine {
  constructor(seed?: number, saved?: SimulationState);
  getState(): Readonly<SimulationState>;
  dispatch(cmd: Command): DomainEvent[];       // validates, mutates internally, recomputes drift, persists nothing
  subscribe(fn: (s: Readonly<SimulationState>, ev: DomainEvent[]) => void): () => void;
  static serialize(s): string; static restore(json: string): SimulationState | null; // null if corrupt/version mismatch
}
export const TEMPLATES: EventTemplate[]            // src/sim/events.ts
export function previewFork(state, templateId): { A: EventOutcome; B: EventOutcome; selfPreferred: 'A'|'B'; defaultOutcome: 'A'|'B' }
export function cheapestWinPath(): Command[]       // deterministic scripted winning path from seed 48219, used in tests + "demo seed" button
```
Save key: `elsewhere-together-save-v1` in localStorage; main.ts persists after each dispatch.
Interactable objects (`triggerObjectId`): lantern, bridge, radio, greenhouse, tide. Anchor terminals: `anchor_LANTERN`, `anchor_GREENHOUSE`, `anchor_LIGHTHOUSE`, rest terminal: `thread_terminal`.
Flow: walk to object -> UI sends BEGIN_FORK -> fork panel (LET GO / SELF / ECHO, uses previewFork) -> RESOLVE_FORK (engine advances partner once, emits VOICE where relevant) -> after anchor-related events the player activates anchor terminal with ACTIVATE_ANCHOR (engine rejects with an actionable hint via REJECTED). Final win when all 3 aligned + drift<=35 + strain<=55 + player activates LIGHTHOUSE last.
Tutorial order of first three template uses: lantern, greenhouse, radio (scripted by engine; after that any).
Player world positions (world px 320x180, 24x14 tiles of ~13x13? use TILE=16, map 20x11 => 320x176): see `src/game/layout.ts` (Presentation agent owns; exports OBJECT_POSITIONS).

## Ownership
- Sim agent: `src/sim/**`, `src/content/dialogue.ts` (voice lines text, hints). Tests in `src/sim/tests`.
- Presentation agent: `src/game/**`, `src/ui/**`, `index.html`, `src/main.ts`, `src/ui/styles.css`. Uses engine API; until engine lands, may import from engine file once present (check periodically; Sim agent lands a compiling stub within first minutes).
- Audio/assets agent: `src/audio/**`, `scripts/**`, `public/assets/**`, `src/game/sprites.ts` (programmatic pixel sprite/tile generation to canvas textures; exports `registerTextures(scene)`; also a `pixelSprites` doc). 
- Lead: integration, README, final fixes.

## Audio rules
- NO MUSIC GENERATION via ElevenLabs. No `/v1/music` anywhere. Music = synthesized Web Audio ambient bed (two layers: amber, cyan; drift/strain reactive).
- ElevenLabs script (`scripts/generate_audio.py`): default is DRY RUN printing character counts/credit estimate; real calls only with `--go`. Only TTS (9 lines) + SFX (6 clips). Skip files that already exist. Key from env `ELEVENLABS_API_KEY` or file `api_keys/elevenlabs_key`-style path given by `--key-file`; NEVER print or log the key. Do not run with --go.
- Files expected: `public/assets/audio/voice_<cue>.mp3`, `sfx_<name>.mp3`. Game must run if missing (synth fallback).
