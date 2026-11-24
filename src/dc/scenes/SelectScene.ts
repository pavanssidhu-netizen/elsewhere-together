import { DCScene } from '../base';
// STUB: replaced by the owning agent. Shows the scene name and a way forward so the flow can be exercised end to end.
export class SelectScene extends DCScene {
  constructor() { super('SelectScene'); }
  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1020);
    this.txt(this.W / 2 - 150, this.H / 2 - 20, 'SelectScene (stub)  state=' + this.snap?.state, 16);
    this.input.once('pointerdown', () => this.send({ type: 'CONTINUE' }));
  }
}
