import Phaser from 'phaser';
import type { DCScene } from '../base';
import type { Character } from '../../flow/flow';

/** Shared helpers for the CUT-2 scenes: flipbook vfx, myconid actors, the tiny Time Master, tears, screen shake. All art is imported. */

export const CYAN = 0x7be0df, PINK = 0xe8a0b4, AMBER = 0xffb24a, MAGENTA = 0xd5309a;
export const colourOf = (c: Character | null | undefined): 'red' | 'blue' => (c === 'SAM' ? 'blue' : 'red');
export const partnerOf = (c: Character | null | undefined): Character => (c === 'SAM' ? 'JENSEN' : 'SAM');

/** Play a vfx flipbook (spritesheet from the manifest) once or looping. Returns the sprite. */
export function flip(scene: Phaser.Scene, key: string, x: number, y: number, o: { scale?: number; tint?: number; alpha?: number; depth?: number; loop?: boolean; fps?: number; add?: boolean; flipX?: boolean; rot?: number } = {}): Phaser.GameObjects.Sprite {
  const ak = 'dcfx:' + key;
  if (!scene.anims.exists(ak)) {
    const n = scene.textures.get(key).frameTotal - 1; // minus __BASE
    scene.anims.create({ key: ak, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: n - 1 }), frameRate: o.fps ?? 24, repeat: -1 });
  }
  const s = scene.add.sprite(x, y, key).setScale(o.scale ?? 1).setAlpha(o.alpha ?? 1).setDepth(o.depth ?? 0).setFlipX(!!o.flipX).setRotation(o.rot ?? 0);
  if (o.add !== false) s.setBlendMode(Phaser.BlendModes.ADD);
  if (o.tint !== undefined) s.setTint(o.tint);
  s.play({ key: ak, frameRate: o.fps ?? 24, repeat: o.loop ? -1 : 0 });
  if (!o.loop) s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  return s;
}

/** Cyan teleport/beam strip (portals/tide_teleport etc). 10 frames. */
export function strip(scene: Phaser.Scene, key: string, x: number, y: number, o: { scale?: number; sx?: number; sy?: number; tint?: number; alpha?: number; depth?: number; loop?: boolean; fps?: number } = {}): Phaser.GameObjects.Sprite {
  const ak = 'dcstrip:' + key;
  if (!scene.anims.exists(ak)) {
    const n = scene.textures.get(key).frameTotal - 1;
    scene.anims.create({ key: ak, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: n - 1 }), frameRate: o.fps ?? 14, repeat: -1 });
  }
  const s = scene.add.sprite(x, y, key).setScale(o.sx ?? o.scale ?? 1, o.sy ?? o.scale ?? 1).setDepth(o.depth ?? 0).setAlpha(o.alpha ?? 1).setBlendMode(Phaser.BlendModes.ADD);
  if (o.tint !== undefined) s.setTint(o.tint);
  s.play({ key: ak, frameRate: o.fps ?? 14, repeat: o.loop === false ? 0 : -1 });
  return s;
}

/** Myconid sprite (64px cells; frame = row*40 + col). dir row 0 = S, 2 = W, 6 = E. */
export function myconid(scene: Phaser.Scene, x: number, y: number, c: 'red' | 'blue', scale = 3, dir = 0): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, 'myconid/' + c, dir * 40).setScale(scale).setOrigin(0.5, 42 / 64);
  s.setData('c', c).setData('dir', dir);
  mycPlay(s, 'idle');
  return s;
}
export type MycAnim = 'idle' | 'walk' | 'cheer' | 'hit' | 'death';
export function mycPlay(s: Phaser.GameObjects.Sprite, anim: MycAnim, dir?: number): void {
  const c = s.getData('c') as string; const d = dir ?? (s.getData('dir') as number); s.setData('dir', d);
  const key = 'myconid/' + c, ak = `myc:${c}:${d}:${anim}`;
  const def: Record<MycAnim, [number, number, number, number]> = { idle: [0, 7, 5.3, -1], walk: [8, 15, 9.6, -1], cheer: [16, 23, 7.4, -1], hit: [24, 31, 12, 0], death: [32, 39, 4.8, 0] };
  const [a, b, fps, rep] = def[anim];
  if (!s.scene.anims.exists(ak)) s.scene.anims.create({ key: ak, frames: s.scene.anims.generateFrameNumbers(key, { start: d * 40 + a, end: d * 40 + b }), frameRate: fps, repeat: rep });
  s.play(ak, true);
}

/** Wizard sprite: 48px cells, 4 cols. Row 0..1 hold the idle / turn frames facing the camera; the figure is ~14x20 px. */
export function wizard(scene: Phaser.Scene, x: number, y: number, scale = 5): Phaser.GameObjects.Sprite {
  if (!scene.anims.exists('wiz:idle')) {
    scene.anims.create({ key: 'wiz:idle', frames: [0, 1, 0, 2, 0, 3, 0, 1].map(f => ({ key: 'wizard/wizard', frame: f })), frameRate: 3, repeat: -1 });
    scene.anims.create({ key: 'wiz:blink', frames: [{ key: 'wizard/wizard', frame: 4 }, { key: 'wizard/wizard', frame: 5 }, { key: 'wizard/wizard', frame: 4 }], frameRate: 8, repeat: 0 });
    scene.anims.create({ key: 'wiz:cast', frames: [48, 49, 50, 51].map(f => ({ key: 'wizard/wizard', frame: f })), frameRate: 8, repeat: -1 });
  }
  const s = scene.add.sprite(x, y, 'wizard/wizard', 0).setScale(scale).setOrigin(0.5, 31 / 48);
  s.play('wiz:idle');
  return s;
}

export function shake(scene: DCScene, ms = 300, amp = 0.006): void {
  if (!scene.dc.settings.reduceMotion) scene.cameras.main.shake(ms, amp);
}
export function flash(scene: DCScene, ms = 250, r = 255, g = 255, b = 255): void {
  scene.cameras.main.flash(scene.dc.settings.reduceMotion ? Math.min(ms, 120) : ms, r, g, b);
}

/** Comic tear streams from a point: two emitters of falling cyan light dots (imported particle texture). */
export function tears(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Particles.ParticleEmitter[] {
  const mk = (dx: number, ang: number) => scene.add.particles(x + dx * scale, y, 'vfx/p_circle_05', {
    lifespan: 700, speedX: { min: ang - 25, max: ang + 25 }, speedY: { min: -40, max: 0 }, gravityY: 420, scale: { start: 0.035 * scale, end: 0.02 * scale },
    alpha: { start: 0.9, end: 0.2 }, frequency: 45, tint: 0x9fe8ff, blendMode: 'ADD',
  }).setDepth(50);
  return [mk(-6, -70), mk(6, 70)];
}

/** Smoke / steam puffs rising. */
export function steam(scene: Phaser.Scene, x: number, y: number, w = 40, tint = 0xffffff): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add.particles(x, y, 'vfx/p_smoke_08', {
    lifespan: 1400, x: { min: -w / 2, max: w / 2 }, speedY: { min: -60, max: -30 }, speedX: { min: -12, max: 12 }, scale: { start: 0.05, end: 0.18 }, alpha: { start: 0.5, end: 0 }, frequency: 90, tint,
  }).setDepth(40);
}

/** Wait helper that cancels with the scene (timers die with the scene). */
export const wait = (scene: Phaser.Scene, ms: number): Promise<void> => new Promise(r => scene.time.delayedCall(ms, r));

/** Run when the scene goes away: stop voice + anything the scene registered. */
export function onShutdown(scene: DCScene, fn: () => void): void {
  scene.events.once('shutdown', () => { scene.dc.audio.skipVoice(); fn(); });
}

/** Big centred end-card title with a soft cyan backing glow. */
export function cardTitle(scene: DCScene, y: number, text: string, size: number, tint: number): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(scene.W / 2, y, 'fonts/Pepper16-Bold', text, size).setOrigin(0.5).setTint(tint).setDepth(300);
  return t;
}
