// Demo-mode QA: DEMO MODE -> intro -> select -> forest panel; picks option (env CHOICE=1 win, 2 lose), logs flow state + screenshots over time.
import { start, sleep, flowState } from './qa_lib.mjs';
const { open, errs, close } = await start();
const p = await open('');
const out = process.env.OUT || '/tmp/demo'; import fs from 'node:fs'; fs.mkdirSync(out, { recursive: true });
await p.click(480, 435);
const choice = process.env.CHOICE || '1';
let st = '', t0 = Date.now(), n = 0, panelDone = false, last = '';
while (Date.now() - t0 < Number(process.env.MS || 150000)) {
  st = await flowState(p);
  if (st !== last) { console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', st); last = st; }
  if (st === 'COSMIC_INTRO' || st === 'CHARACTER_SELECT') { await p.keyboard.press('Space'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Enter'); }
  if (st === 'FOREST_GAME' && !panelDone) { await sleep(1500); await p.keyboard.press(choice); panelDone = true; }
  if (['FOREST_GAME'].includes(st) && panelDone && n++ % 4 === 0) await p.screenshot({ path: `${out}/f${String(n).padStart(3, '0')}.png` });
  if (st === 'FINAL_ENDING' || st === 'REUNION_ENDING' || st === 'SOUP_ENDING') break;
  await sleep(500);
}
console.log('errors:', errs.length ? errs : 'none'); await close();
