import Phaser from 'phaser';
import type { DCScene } from '../base';
import { CYAN, PINK, wizard } from './fx';
import { boxText, noFit } from '../ui/fit';

/** The Time Master's office: a cosy comic room with one hugely important desk. Everything is an imported sprite or tile. */

/** Crop rectangles (x, y, w, h) into office/office_assets, registered at runtime. Found by scanning the sheet for connected sprites. */
const CROPS: Record<string, [number, number, number, number]> = {
  desk: [115, 52, 40, 11],        // long red furniture slab with legs = the huge desk (front half only)
  deskSide: [85, 52, 26, 11],     // shorter matching piece, used as the desk's return
  chair: [6, 41, 11, 22],         // office chair
  sky: [92, 2, 62, 34],           // window view (sky + clouds)
};
export function officeFrames(scene: Phaser.Scene): void {
  const t = scene.textures.get('office/office_assets');
  for (const [k, r] of Object.entries(CROPS)) if (!t.has(k)) t.add(k, 0, r[0], r[1], r[2], r[3]);
}

export interface Room {
  wizard: Phaser.GameObjects.Sprite;
  pedestal: Phaser.GameObjects.Image;
  desk: Phaser.GameObjects.Image;
  deskTopY: number; deskX: number;
  nodes: Phaser.GameObjects.Image[];
  pulse: Phaser.GameObjects.Image;
  board: Phaser.GameObjects.Container;
  chaos(on: boolean): void;
}

export const FLOOR_Y = 172;

export function buildOffice(scene: DCScene): Room {
  officeFrames(scene);
  const W = scene.W, H = scene.H;
  // wall + skirting + floor
  scene.add.tileSprite(0, 0, W, FLOOR_Y, 'tiles/wallpaper_sage_stripes').setOrigin(0).setTileScale(2).setDepth(0);
  scene.add.tileSprite(0, FLOOR_Y, W, H - FLOOR_Y, 'tiles/wood_planks_light').setOrigin(0).setTileScale(2).setDepth(0);
  scene.add.tileSprite(0, FLOOR_Y - 8, W, 12, 'tiles/wood_planks_light').setOrigin(0).setTileScale(1).setTint(0x8a6a4a).setDepth(1);
  scene.add.image(470, 320, 'home/large_patterned_rug').setScale(5, 2.6).setDepth(1).setAlpha(0.95);

  // window with a wooden frame
  const wx = 800, wy = 78;
  scene.add.image(wx, wy, 'office/office_assets', 'sky').setScale(3.2, 3.0).setDepth(2);
  for (const [x, y, w, h] of [[wx, wy - 54, 214, 10], [wx, wy + 54, 214, 10], [wx - 102, wy, 10, 118], [wx + 102, wy, 10, 118], [wx, wy, 6, 108]])
    scene.add.tileSprite(x, y, w, h, 'tiles/wood_planks_light').setTint(0xa87a4c).setDepth(3);

  // furniture along the wall
  scene.add.image(70, FLOOR_Y + 14, 'home/tall_bookshelf_with_books').setOrigin(0.5, 1).setScale(1.9).setDepth(3);
  scene.add.image(168, FLOOR_Y + 26, 'home/potted_fern').setOrigin(0.5, 1).setScale(1.6).setDepth(3);
  scene.add.image(918, FLOOR_Y + 40, 'home/floor_lamp').setOrigin(0.5, 1).setScale(1.9).setDepth(3);
  scene.add.image(650, 66, 'home/round_wall_clock').setScale(1.8).setDepth(3);
  scene.add.image(176, 70, 'home/framed_photo').setScale(1.7).setDepth(3);
  scene.add.image(912, 122, 'vfx/p_light_01').setTint(0xffd98a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.5).setDepth(4);

  // the timeline display: ONE big board on the wall
  const bx = 410, by = 76;
  const board = scene.add.container(bx, by).setDepth(3);
  board.add(scene.add.image(0, 0, 'ui/panel-frame').setDisplaySize(400, 118).setTint(0x405060));
  const g = scene.add.graphics();
  g.lineStyle(3, CYAN, 0.95); g.beginPath(); g.moveTo(-170, 0); g.lineTo(170, 0); g.strokePath();
  g.lineStyle(2, PINK, 0.8);
  for (const [x0, dy] of [[-60, -26], [10, 30], [80, -28]] as const) { g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 34, dy); g.lineTo(x0 + 80, dy); g.strokePath(); }
  board.add(g);
  const nodes: Phaser.GameObjects.Image[] = [];
  const mk = (x: number, y: number, tint: number, s: number) => {
    const n = scene.add.image(x, y, 'vfx/p_light_01').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(s);
    board.add(n); nodes.push(n);
    scene.tweens.add({ targets: n, scale: s * 1.35, alpha: 0.6, yoyo: true, repeat: -1, duration: 700 + nodes.length * 90, ease: 'Sine.easeInOut' });
  };
  for (const x of [-170, -115, -60, 10, 80, 170]) mk(x, 0, CYAN, 0.1);
  for (const [x, y] of [[-26, -26], [44, 30], [114, -28], [-26, -26 + 0.01]] as const) mk(x, y, PINK, 0.075);
  board.add(noFit(scene.add.bitmapText(0, -50, 'fonts/Pepper16-Bold', 'THE TIMELINE', 16).setOrigin(0.5).setTint(CYAN)));
  const pulse = scene.add.image(-170, 0, 'vfx/p_star_01').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12);
  board.add(pulse);
  scene.tweens.add({ targets: pulse, x: 170, duration: 2600, repeat: -1, ease: 'Sine.easeInOut', yoyo: true });

  // the desk (disproportionately important), his throne-chair, paperwork
  const dx = 660, dBottom = 304;
  const chair = scene.add.image(dx, dBottom - 40, 'office/office_assets', 'chair').setOrigin(0.5, 1).setScale(7).setDepth(4).setTint(0xff9a8a);
  void chair;
  scene.add.image(dx, 185, 'vfx/p_light_01').setTint(0xfff0c8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.75).setDepth(4.5); // soft light so the dark little wizard reads
  const pedestal = scene.add.image(dx, dBottom - 52, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.4).setDepth(5);
  const wiz = wizard(scene, dx, dBottom - 70, 5).setDepth(5);
  const desk = scene.add.image(dx, dBottom, 'office/office_assets', 'desk').setOrigin(0.5, 1).setScale(8.4, 7.6).setDepth(7).setTint(0xd9a46c);
  const deskTopY = dBottom - 11 * 7.6;
  scene.add.image(dx - 118, deskTopY + 6, 'home/stack_of_books').setOrigin(0.5, 1).setScale(1.8).setDepth(8).setTint(0xfff3d8);
  scene.add.image(dx - 150, deskTopY + 6, 'home/stack_of_books').setOrigin(0.5, 1).setScale(1.3).setDepth(8).setTint(0xf4e0b8);
  scene.add.image(dx + 128, deskTopY + 6, 'home/stack_of_books').setOrigin(0.5, 1).setScale(2.1).setDepth(8).setTint(0xfff3d8);
  scene.add.image(dx + 92, deskTopY + 8, 'home/coffee_mug').setOrigin(0.5, 1).setScale(1.4).setDepth(8);
  scene.add.image(dx + 70, deskTopY + 6, 'home/tiny_cuckoo_clock').setOrigin(0.5, 1).setScale(0.9).setDepth(8);
  const plateW = Math.min(desk.displayWidth * 0.6, 260);
  boxText(scene, 'Pepper16-Bold', 'THE TIME MASTER', { x: dx - plateW / 2, y: dBottom - 40, w: plateW, h: 24 }, { max: 16, min: 9, align: 'center', valign: 'middle', tint: 0xffe9a8, depth: 9 }, 'desk-plate');

  let chaosTw: Phaser.Tweens.Tween | null = null;
  const room: Room = {
    wizard: wiz, pedestal, desk, deskTopY, deskX: dx, nodes, pulse, board,
    chaos(on) {
      chaosTw?.remove(); chaosTw = null; board.setAngle(0);
      if (on && !scene.dc.settings.reduceMotion) chaosTw = scene.tweens.add({ targets: board, angle: { from: -1.2, to: 1.2 }, yoyo: true, repeat: -1, duration: 90 });
      nodes.forEach((n, i) => { if (i >= 6) n.setAlpha(on ? 1 : 0.8); });
    },
  };
  return room;
}
