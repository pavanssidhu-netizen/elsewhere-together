// End-to-end through the REAL UI: forest win (3 rooms, alternating orders) -> reunion -> ending -> replay; and the failure branches.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.argv[2] || '/tmp/qaf'; fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const PORT = await new Promise(r => srv.listen(0, () => r(srv.address().port)));   // free port: parallel QA runs never collide
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
const errs = []; const log = (...a) => console.log(...a);
async function open(qs) { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${PORT}/?${qs}`); await sleep(1800); return p; }
const state = p => p.evaluate(() => window.__dc.flow.state);
async function waitFor(p, want, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await state(p); if (s === want || (Array.isArray(want) && want.includes(s))) return s; await sleep(250); } return 'TIMEOUT@' + await state(p); }
const key = i => i.t === 'MOVE' ? { N: 'ArrowUp', S: 'ArrowDown', E: 'ArrowRight', W: 'ArrowLeft' }[i.dir] : i.t === 'A' ? 'z' : i.t === 'B' ? 'x' : 'Enter';

// ---- 1. forest win: 3 rooms, orders alternate PAST, FUTURE, PAST
{
  const p = await open('jump=FOREST_GAME&char=SAM&seed=5&f2debug=1');
  for (const [room, order] of [[1, 'PAST_FIRST'], [2, 'FUTURE_FIRST'], [3, 'PAST_FIRST']]) {
    await sleep(1800); await p.keyboard.press('Enter'); await sleep(700);                       // dismiss room intro card
    await p.mouse.click(order === 'PAST_FIRST' ? 367 : 913, 544); await sleep(1200);            // choose order
    const sol = await p.evaluate(({ room, order }) => window.__forest2.solve(room, order), { room, order });
    for (const [ph, list] of [[1, sol.phase1], [2, sol.phase2]]) { for (const i of list) { await p.keyboard.press(key(i)); await sleep(210); } if (ph === 1) await sleep(3600); }
    await sleep(2200); await p.screenshot({ path: `${out}/full-room${room}-cleared.png` });
    log(`room ${room} ${order}: flow=${await state(p)}`);
    await p.keyboard.press('Enter'); await sleep(500);
  }
  for (let i = 0; i < 8 && (await state(p)) === 'FOREST_GAME'; i++) { await p.keyboard.press('Enter'); await sleep(900); }
  log('after rooms ->', await state(p));
  log('reunion/ending ->', await waitFor(p, 'REUNION_ENDING', 25000));
  await p.screenshot({ path: `${out}/full-ending.png` });
  log('summary', JSON.stringify(await p.evaluate(() => window.__dc.services.session.forestSummary)));
  await p.keyboard.press('Enter'); await sleep(800); log('replay ->', await state(p));
  await p.context().close();
}
// ---- 2. forest loss (3 charges) -> abduction -> office -> REFUSE -> soup
{
  const p = await open('jump=FOREST_GAME&char=JENSEN&seed=2');
  for (let a = 0; a < 3; a++) {
    await sleep(1800); await p.keyboard.press('Enter'); await sleep(700); await p.mouse.click(367, 544); await sleep(900);
    await p.keyboard.press('Enter'); await sleep(3600); await p.keyboard.press('Enter'); await sleep(2200);       // end both loops at once => fail
    await p.keyboard.press('Enter'); await sleep(900);                                                             // dismiss fail card (retry)
    log(`fail ${a + 1}: flow=${await state(p)}`);
  }
  log('lost ->', await waitFor(p, ['FOREST_FAILURE', 'ABDUCTION', 'TIME_MASTER_OFFICE'], 8000));
  log('office ->', await waitFor(p, 'TIME_MASTER_OFFICE', 30000));
  await sleep(1500); for (let i = 0; i < 6; i++) { await p.keyboard.press('Enter'); await sleep(900); }
  await p.screenshot({ path: `${out}/full-office-choice.png` });
  await p.keyboard.press('2'); await sleep(300); await p.keyboard.press('Enter'); await sleep(900); await p.keyboard.press('Enter');
  log('refuse ->', await waitFor(p, 'SOUP_ENDING', 15000));
  await sleep(14000); await p.screenshot({ path: `${out}/full-soup-card.png` });
  await p.context().close();
}
// ---- 3. office ACCEPT -> runner (no input => loss) -> RETRY -> loss -> give up -> final ending
{
  const p = await open('jump=TIME_MASTER_OFFICE&char=SAM&seed=2');
  await sleep(1500); for (let i = 0; i < 6; i++) { await p.keyboard.press('Enter'); await sleep(900); }
  await p.keyboard.press('1'); await sleep(300); for (let i = 0; i < 5 && (await state(p)) === 'TIME_MASTER_OFFICE'; i++) { await p.keyboard.press('Enter'); await sleep(900); }
  log('accept ->', await waitFor(p, 'THREAD_RUNNER', 15000));
  log('runner lost ->', await waitFor(p, 'RUNNER_FAILURE', 60000)); await sleep(1800); await p.keyboard.press('r'); await sleep(800);
  log('retry ->', await state(p), 'seed', await p.evaluate(() => window.__dc.flow.snapshot().runnerSeed));
  log('runner lost 2 ->', await waitFor(p, 'RUNNER_FAILURE', 60000)); await sleep(1800); await p.keyboard.press('Escape'); await sleep(1000);
  log('give up ->', await waitFor(p, 'FINAL_ENDING', 20000)); await sleep(2500); await p.screenshot({ path: `${out}/full-collapse-ending.png` });
  await p.context().close();
}
log('errors:', errs.length ? errs : 'none'); await b.close(); srv.close();
