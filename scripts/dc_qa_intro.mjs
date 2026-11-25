// Real-input check of the press-to-advance intro. Usage: node scripts/dc_qa_intro.mjs [outDir]  (serves ./dist)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.argv[2] || '/tmp/intro'; fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); }).listen(5251);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
async function open() {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5251/?jump=COSMIC_INTRO');
  await p.evaluate(() => { const a = window.__dc.services.audio; window.__music = []; const o = a.playMusic.bind(a); a.playMusic = (id, opts) => { window.__music.push({ id, opts, line: window.__lineNo }); return o(id, opts); };
    const v = a.playVoice.bind(a); window.__lineNo = 0; a.playVoice = (id) => { const m = /^tm_intro_(\d)$/.exec(id); if (m) window.__lineNo = +m[1]; return v(id); }; });
  return { p, errs };
}
const state = p => p.evaluate(() => window.__dc.flow.state);
const line = p => p.evaluate(() => window.__lineNo);
{
  const { p, errs } = await open(); await sleep(2500);
  check(await line(p) === 1, 'line 1 shown'); await sleep(8000); check(await line(p) === 1 && await state(p) === 'COSMIC_INTRO', 'still line 1 after 8 s with no input');
  const shots = { 1: 1, 4: 1, 7: 1, 9: 1 }; let audit = 0;
  for (let n = 1; n <= 9; n++) {
    await sleep(n === 4 || n === 7 || n === 9 || n === 8 ? 4500 : 2500);   // let typing finish + stage play
    if (shots[n]) await p.screenshot({ path: `${out}/line${n}.png` });
    const iss = await p.evaluate(() => window.__dc.auditText()); audit += iss.length; for (const i of iss) console.log('   audit', n, i.reason, i.label, i.text);
    if (n === 1) { // first press completes typing (here already complete) then advance; test mid-typing press on line 2 below
    }
    if (n === 3) { await p.keyboard.press('Enter'); await sleep(150); check(await line(p) === 4, 'press 3 -> line 4'); check((await p.evaluate(() => window.__music)).some(m => m.id === 'forest' && m.line === 4 && m.opts?.fadeMs === 1200), "playMusic('forest',{fadeMs:1200}) at line 4"); continue; }
    if (n === 9) break;
    await p.keyboard.press(n === 5 ? 'Space' : 'Enter'); await sleep(150);
    const got = await line(p); if (got !== n + 1) check(false, `press ${n} -> line ${n + 1}, got ${got}`);
  }
  check(audit === 0, 'no text audit issues at each line');
  check(await state(p) === 'COSMIC_INTRO', 'still intro on line 9 before last press');
  const txt = await p.evaluate(() => (window.__dc.game.scene.getScene('IntroScene').children.list.flatMap(function w(o) { return o.list ? o.list.flatMap(w) : [o]; }).filter(o => o.type === 'BitmapText').map(o => o.text).join('|')));
  check(!/future|past/i.test(txt), 'no future/past words in intro text: ' + txt.slice(0, 120));
  await p.keyboard.press('Enter'); await sleep(1500);
  check(await state(p) === 'CHARACTER_SELECT', 'after 9 presses flow = ' + await state(p));
  check((await p.evaluate(() => window.__music)).filter(m => m.id === 'cosmic' && m.line > 0).length === 0, 'no cosmic restart after the intro started'); console.log('music calls', JSON.stringify(await p.evaluate(() => window.__music)));
  check(errs.length === 0, 'no page errors ' + errs.join(';'));
  await p.context().close();
}
{ // mid-typing press completes, then SKIP
  const { p } = await open(); while (await line(p) < 1) await sleep(100); await sleep(500);
  const len = () => p.evaluate(() => window.__dc.game.scene.getScene('IntroScene').caption.body.text.length);
  const l0 = await len(); await p.keyboard.press('Enter'); await sleep(60); const l1 = await len();
  check(await line(p) === 1 && l1 >= l0, `first press completes typing (${l0}->${l1}), still line 1`);
  await p.keyboard.press('Enter'); await sleep(200); check(await line(p) === 2, 'second press advances to line 2');
  await p.click('#dc-skip'); await sleep(900); check(await state(p) === 'CHARACTER_SELECT', 'SKIP mid-intro -> ' + await state(p));
  await p.context().close();
}
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
