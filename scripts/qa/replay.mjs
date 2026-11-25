// After an ending, REPLAY -> title; PLAY and DEMO MODE must both start a fresh run without a page refresh.
import { start, sleep, flowState } from './lib.mjs';
const { open, errs, close } = await start();
let ok = true;
for (const [name, x, y, expect] of [['PLAY', 310, 330, 'COSMIC_INTRO'], ['DEMO MODE', 480, 435, 'COSMIC_INTRO']]) {
  const p = await open('jump=FINAL_ENDING&char=SAM'); await sleep(1500);
  await p.evaluate(() => window.__dc.flow.dispatch({ type: 'REPLAY' })); await sleep(1500);
  const a = await flowState(p);
  await p.click(x, y); await sleep(1200);
  const s = await flowState(p); const demo = await p.evaluate(() => window.__dc.flow.snapshot?.().demo ?? window.__dc.flow.snap?.demo);
  const pass = a === 'TITLE' && s === expect; ok &&= pass;
  console.log(name, 'title:', a, '-> after click:', s, 'demo:', demo, pass ? 'OK' : 'FAIL');
}
console.log('errors:', errs.length ? errs : 'none'); await close(); process.exit(ok ? 0 : 1);
