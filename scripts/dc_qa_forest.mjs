// Plays forest2 through REAL keyboard events using the sim's reference solution; screenshots along the way.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.argv[2] || '/tmp/qaf'; const char = process.argv[3] || 'SAM'; const room = Number(process.argv[4] || 1);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const PORT = await new Promise(r => srv.listen(0, () => r(srv.address().port)));   // free port: parallel QA runs never collide
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 160)); });
const shot = async n => { await p.screenshot({ path: `${out}/${n}.png` }); };
const order = char === 'SAM' ? 'PAST_FIRST' : 'FUTURE_FIRST';
await p.goto(`http://localhost:${PORT}/?jump=FOREST_GAME&char=${char}&seed=3&f2debug=1`); await sleep(2500);
await shot('01-card'); await p.keyboard.press('Enter'); await sleep(700); await shot('02-chooser');
// choose by clicking the left/right button
await p.mouse.click(order === 'PAST_FIRST' ? 367 : 913, 544); await sleep(1500); await shot('03-phase1-start');
const sol = await p.evaluate(({ room, order }) => window.__forest2.solve(room, order), { room, order });
console.log('solution lens', sol.phase1.length, sol.phase2.length);
const key = i => i.t === 'MOVE' ? { N: 'ArrowUp', S: 'ArrowDown', E: 'ArrowRight', W: 'ArrowLeft' }[i.dir] : i.t === 'A' ? 'z' : i.t === 'B' ? 'x' : 'Enter';
let n = 0;
for (const [ph, list] of [[1, sol.phase1], [2, sol.phase2]]) {
  for (let i = 0; i < list.length; i++) {
    await p.keyboard.press(key(list[i])); await sleep(260);
    if (i === Math.floor(list.length / 2)) { await shot(`1${ph}-mid`); await p.keyboard.down('c'); await sleep(350); await shot(`1${ph}-peek`); await p.keyboard.up('c'); await sleep(200); }
  }
  if (ph === 1) { await sleep(400); await shot('20-lock-a'); await sleep(2600); await shot('21-phase2-start'); }
}
await sleep(1500); await shot('30-after'); await sleep(2500); await shot('31-clear-card');
const st = await p.evaluate(() => ({ flow: window.__dc.flow.state, status: window.__forest2?.stage?.()?.view?.().status }));
console.log('result', JSON.stringify(st), 'errors', errs.length ? errs : 'none');
await b.close(); srv.close();
