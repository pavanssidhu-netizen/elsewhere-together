import type { DCScene } from '../base';
import type Phaser from 'phaser';

/** Forest backdrop shared by both phases: lawn + a few garden props. Returns tintable objects. */
export function forestBackdrop(s: DCScene): Phaser.GameObjects.Image[] {
  s.add.tileSprite(0, 0, s.W, s.H, 'tiles/front_lawn').setOrigin(0).setTileScale(2).setDepth(0);
  s.add.tileSprite(0, 400, s.W, 140, 'tiles/garden_gravel_path').setOrigin(0).setTileScale(2).setDepth(0.5);
  const props: Phaser.GameObjects.Image[] = [];
  const add = (k: string, x: number, y: number, sc: number) => props.push(s.add.image(x, y, 'garden/' + k).setOrigin(0.5, 1).setScale(sc).setDepth(y));
  add('small_apple_tree_with_red_apples', 150, 300, 4);
    add('garden_gnome_holding_a_lantern', 300, 390, 3);
  add('wooden_rail_fence_section', 330, 250, 3);
  add('wooden_rail_fence_section', 530, 250, 3);
  add('lilac_bush_in_bloom', 640, 410, 3.4);
  add('round_flower_bed_with_daisies', 90, 430, 3);
  add('small_cottage_with_a_golden_thatched_roof_a_chimney_and_a_wooden_door', 760, 280, 2.8);
  return props;
}

