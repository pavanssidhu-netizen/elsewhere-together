// Forest text audit: intro card, order chooser, HUD (phase 1 and 2), fail card and clear card. Prints 'no text overflows' when clean.
// Usage: node scripts/dc_qa_forest_text.mjs [outdir]   (serves ./dist; run `npm run build` first)
import fs from 'node:fs'; import { start, sleep, key } from './qa_lib.mjs';
const out = process.argv[2] || '/tmp/forest-run'; fs.mkdirSync(out, { recursive: true });
const S = await start(); let bad = 0;
const audit = async (p, name) => { const is = await p.evaluate(() => window.__dc.auditText()); for (const i of is) { bad++; console.log(`  ${name} [${i.scene}] ${i.reason}: "${i.text}" label=${i.label} bounds=${[i.bounds.x, i.bounds.y, i.bounds.w, i.bounds.h].map(Math.round)}${i.box ? ' box=' + [i.box.x, i.box.y, i.box.w, i.box.h].map(Math.round) : ''}`); } console.log(name.padEnd(22), is.length ? 'ISSUES' : 'ok'); };
const pickSam = p => p.click(330, 448);
for (const char of ['SAM', 'JENSEN']) {
  const p = await S.open(`jump=FOREST_GAME&char=${char}&seed=3&f2debug=1`);
  await audit(p, `${char} intro card`); await p.screenshot({ path: `${out}/text-${char}-intro.png` });
  await p.keyboard.press('Enter'); await sleep(700); await audit(p, `${char} chooser`); await p.screenshot({ path: `${out}/text-${char}-chooser.png` });
  const order = char === 'SAM' ? 'PAST_FIRST' : 'FUTURE_FIRST';
  await p.click(char === 'SAM' ? 330 : 630, 448); await sleep(1500); await audit(p, `${char} hud phase1`);
  const sol = await p.evaluate(({ order }) => window.__forest2.solve(1, order), { order });
  for (const i of sol.phase1) { await p.keyboard.press(key(i)); await sleep(150); }
  await sleep(2600); await audit(p, `${char} hud phase2`); await p.screenshot({ path: `${out}/text-${char}-phase2.png` });
  if (char === 'SAM') {
    // fail: end the loop early in phase 2
    await p.keyboard.press('Enter'); await sleep(2800); await audit(p, 'fail card'); await p.screenshot({ path: `${out}/text-failcard.png` });
    await p.keyboard.press('Enter'); await sleep(600); await p.click(330, 448); await sleep(1500);
    const sol2 = await p.evaluate(() => window.__forest2.solve(1, 'PAST_FIRST'));
    for (const i of [...sol2.phase1]) { await p.keyboard.press(key(i)); await sleep(150); } await sleep(2800);
    for (const i of sol2.phase2) { await p.keyboard.press(key(i)); await sleep(150); }
    await sleep(3200); await audit(p, 'clear card'); await p.screenshot({ path: `${out}/text-clearcard.png` });
  }
  await p.context().close();
}
console.log('page errors:', S.errs.length ? S.errs : 'none');
console.log(bad ? `${bad} TEXT OVERFLOW ISSUES` : 'no text overflows'); await S.close(); process.exit(bad ? 1 : 0);
