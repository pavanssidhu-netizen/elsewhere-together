// Forest failure drama with REAL key/mouse input: Z/X/C keys + HUD labels, greying, music switches, Time Master quips and jabs, clear card,
// and the two demo modes (MAKE THEM WIN -> FOREST_SUCCESS, MAKE THEM LOSE -> FOREST_FAILURE). Screenshots go to /tmp/forest-run/.
// Usage: node scripts/qa/forest_drama.mjs [outdir]   (serves ./dist)
import fs from 'node:fs'; import { start, sleep, key, flowState } from './lib.mjs';
const out = process.argv[2] || '/tmp/forest-run'; fs.mkdirSync(out, { recursive: true });
const S = await start(); let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fail++; };
const SPY = () => { const a = window.__dc.services.audio; window.__spy = []; for (const k of ['playMusic', 'playVoice', 'playSfx']) { const f = a[k].bind(a); a[k] = (...x) => { window.__spy.push([k, ...x.map(v => typeof v === 'object' ? JSON.stringify(v) : v)]); return f(...x); }; } };
const spy = p => p.evaluate(() => window.__spy.map(s => s.join(':')));
const mode = p => p.evaluate(() => window.__forest2.mode());
// mean saturation (HSV) of the world area of a screenshot
async function worldSat(p) {
  const buf = (await p.screenshot()).toString('base64'); const r = await p.rect();
  return p.evaluate(async ({ buf, r }) => { const im = new Image(); im.src = 'data:image/png;base64,' + buf; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const x0 = Math.round(r.x + r.w * 0.27), y0 = Math.round(r.y + r.h * 0.22), w = Math.round(r.w * 0.46), h = Math.round(r.h * 0.5); const d = g.getImageData(x0, y0, w, h).data; let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); if (mx > 30) { s += (mx - mn) / mx; n++; } } return s / Math.max(1, n); }, { buf, r });
}
async function newRoomAttempt(p, order, tag) {   // intro card -> chooser -> pick order (real clicks)
  await sleep(300); if ((await mode(p)) === 'CARD') { await p.keyboard.press('Enter'); await sleep(700); }
  await p.click(order === 'PAST_FIRST' ? 330 : 630, 448); await sleep(1400);
}
async function failRoom(p) {   // end the loop twice: phase 1 -> Time-Lock -> phase 2 -> loop ends without ignition
  await p.keyboard.press('Enter'); await sleep(2600); await p.keyboard.press('Enter'); await sleep(1700);
}

// ---------------------------------------------------------------- A. keys, HUD labels, fail drama
{
  const p = await S.open('jump=FOREST_GAME&char=SAM&seed=3&f2debug=1');
  await p.evaluate(SPY);
  await p.keyboard.press('Enter'); await sleep(700); await p.click(330, 448); await sleep(1500);
  const hudTexts = await p.evaluate(() => { const o = []; const walk = n => { if (n.list) n.list.forEach(walk); if (n.type === 'BitmapText' && n.visible && n.depth >= 20000) o.push(n.text); }; window.__forest2.scene.children.list.forEach(walk); return o; });
  ok(['Z', 'X', 'C'].every(k => hudTexts.includes(k)) && !hudTexts.includes('A') && !hudTexts.includes('B'), `HUD slot letters are Z, X, C (${hudTexts.filter(t => t.length === 1).join(',')})`);
  await p.screenshot({ path: `${out}/1-normal.png` });
  const sat0 = await worldSat(p); console.log('world saturation (pixels) normal', sat0.toFixed(3));
  // Z / X / C real keys: reference solution phase 1 uses z and x; C held = peek
  const sol = await p.evaluate(() => window.__forest2.solve(1, 'PAST_FIRST'));
  await p.keyboard.down('c'); await sleep(250); ok(await p.evaluate(() => window.__forest2.scene.peeking), 'holding C peeks'); await p.keyboard.up('c'); await sleep(150);
  ok(!(await p.evaluate(() => window.__forest2.scene.peeking)), 'releasing C stops peeking');
  let beat0 = await p.evaluate(() => window.__forest2.stage().view().beat);
  for (const i of sol.phase1) { await p.keyboard.press(key(i)); await sleep(150); }
  await sleep(2600);
  ok((await p.evaluate(() => window.__forest2.stage().view().phase)) === 2, 'phase-1 solution typed with z/x/arrows/Enter reached the Time-Lock and phase 2');
  let sp = await spy(p);
  ok(!(await p.evaluate(() => window.__forest2.spoken())).some(s => s.startsWith('tm_jab')), 'no jabs before the first failure');
  await p.keyboard.press('Enter'); await sleep(1700);   // phase 2 loop ends immediately: FAIL #1
  await sleep(1400);
  ok((await p.evaluate(() => window.__forest2.fails())) === 1, 'fail 1 recorded');
  const s1 = await p.evaluate(() => window.__forest2.sat()); ok(Math.abs(s1 - 0.55) < 0.02, `sat after fail 1 = ${s1.toFixed(2)}`);
  sp = await spy(p);
  ok(sp.some(s => s.startsWith('playMusic:forest_tense')), 'playMusic(forest_tense) after fail 1'); ok(sp.includes('playSfx:fail_sting'), 'fail_sting sfx');
  ok(sp.some(s => /^playVoice:tm_fail1_[123]$/.test(s)), 'tm_fail1_* voice after fail 1');
  await p.screenshot({ path: `${out}/3-failcard-quip.png` });
  await p.keyboard.press('Enter'); await sleep(500);                      // fail card -> chooser
  await p.click(330, 448); await sleep(900);                           // retry
  await p.screenshot({ path: `${out}/2-after-1-fail.png` });
  ok(Math.abs((await worldSat(p)) - sat0) > 0.05 && (await worldSat(p)) < sat0, `pixels got greyer after fail 1 (${sat0.toFixed(3)} -> ${(await worldSat(p)).toFixed(3)})`);
  sp = await spy(p); await sleep(300);
  ok((await p.evaluate(() => window.__forest2.spoken())).some(s => /^tm_jab1_[123]$/.test(s)), 'a mild jab (tm_jab1_*) at room start after 1 failure');
  // fail 2: wait out the jab gap isn't needed for the fail itself
  await failRoom(p); await sleep(1000);
  ok((await p.evaluate(() => window.__forest2.fails())) === 2, 'fail 2 recorded');
  const s2 = await p.evaluate(() => window.__forest2.sat()); ok(Math.abs(s2 - 0.2) < 0.02, `sat after fail 2 = ${s2.toFixed(2)}`);
  sp = await spy(p);
  ok(sp.some(s => s.startsWith('playMusic:final_minute')), 'playMusic(final_minute) after fail 2'); ok(sp.some(s => /^playVoice:tm_fail2_[123]$/.test(s)), 'tm_fail2_* voice after fail 2');
  await p.keyboard.press('Enter'); await sleep(500); await p.click(330, 448); await sleep(900);
  await p.screenshot({ path: `${out}/2b-after-2-fails.png` });
  ok((await worldSat(p)) < sat0 * 0.6, `pixels much greyer after fail 2 (${(await worldSat(p)).toFixed(3)})`);
  // jabs during the attempt: count 8 inputs worth, wait gap, keep pressing harmless moves
  const before = (await p.evaluate(() => window.__forest2.spoken())).filter(s => s.startsWith('tm_jab2')).length;
  for (let i = 0; i < 40; i++) { await p.keyboard.press(['ArrowUp', 'ArrowDown'][i % 2]); await sleep(300); }
  const after = (await p.evaluate(() => window.__forest2.spoken())).filter(s => s.startsWith('tm_jab2')).length;
  ok(after > before, `meaner jabs (tm_jab2_*) while playing after 2 failures (${before} -> ${after})`);
  const sps = await p.evaluate(() => window.__forest2.spoken()); let rep = false; for (let i = 1; i < sps.length; i++) if (sps[i] === sps[i - 1] && sps[i].startsWith('tm_')) rep = true; ok(!rep, 'no line repeated twice in a row: ' + sps.join(' '));
  // win this room with the reference solution: clear card
  await p.keyboard.press('r'); await sleep(300);
  await p.context().close();
}
// ---------------------------------------------------------------- B. clear card (fresh run, solve room 1)
{
  const p = await S.open('jump=FOREST_GAME&char=SAM&seed=3&f2debug=1');
  await newRoomAttempt(p, 'PAST_FIRST'); const sol = await p.evaluate(() => window.__forest2.solve(1, 'PAST_FIRST'));
  for (const i of sol.phase1) { await p.keyboard.press(key(i)); await sleep(150); } await sleep(2800);
  for (const i of sol.phase2) { await p.keyboard.press(key(i)); await sleep(150); } await sleep(3200);
  ok((await mode(p)) === 'CARD' && (await p.evaluate(() => window.__forest2.run().roomIndex)) === 1, 'room 1 solved with real keys (clear card up)');
  await p.screenshot({ path: `${out}/4-clear-card.png` });
  const sat = await p.evaluate(() => window.__forest2.sat()); ok(sat === 1, 'winning with no fails keeps full colour');
  await p.context().close();
}
// ---------------------------------------------------------------- C. demo modes
for (const [opt, want, label] of [[1, 'FOREST_SUCCESS', 'MAKE THEM WIN'], [2, 'FOREST_FAILURE', 'MAKE THEM LOSE']]) {
  const p = await S.open('');
  await p.evaluate(() => { const f = window.__dc.flow; f.dispatch({ type: 'START_DEMO' }); f.dispatch({ type: 'SKIP' }); f.dispatch({ type: 'SELECT', character: 'SAM' }); });
  await sleep(2200); await p.evaluate(SPY);
  ok((await flowState(p)) === 'FOREST_GAME', `${label}: in FOREST_GAME`);
  await p.screenshot({ path: `${out}/5-demo-panel-${opt}.png` });
  await p.keyboard.press(String(opt));
  const t0 = Date.now(); let st = 'FOREST_GAME', maxFails = 0;
  while (Date.now() - t0 < 200000 && st === 'FOREST_GAME') { await sleep(1000); st = await flowState(p); maxFails = Math.max(maxFails, await p.evaluate(() => window.__forest2?.fails?.() ?? 0)); if (opt === 2 && maxFails === 2 && !fs.existsSync(`${out}/6-demo-lose-2fails.png`)) await p.screenshot({ path: `${out}/6-demo-lose-2fails.png` }); }
  console.log(label, 'reached', st, 'after', Math.round((Date.now() - t0) / 1000), 's, max fails seen', maxFails);
  ok(st === want, `${label} ends in ${want}`);
  if (opt === 2) { const sp = await spy(p); ok(sp.some(s => s.startsWith('playMusic:forest_tense')) && sp.some(s => s.startsWith('playMusic:final_minute')) && sp.filter(s => /playVoice:tm_fail/.test(s)).length >= 2, 'lose demo: tense + final_minute music and Time Master quips'); }
  await p.context().close();
}
console.log('page errors:', S.errs.length ? S.errs : 'none');
console.log(fail ? `${fail} CHECKS FAILED` : 'ALL CHECKS PASSED'); await S.close(); process.exit(fail ? 1 : 0);
