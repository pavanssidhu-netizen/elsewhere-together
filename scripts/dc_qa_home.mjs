// HOME agent QA: title (no mushrooms, no overlaps, screenshot), DEMO MODE click -> COSMIC_INTRO demo=true, runner demo options 1 (win) / 2 (lose).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.argv[2] || '/tmp/home'; fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); }).listen(5262);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fail = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fail++; };
const errs = [];
async function open(qs = '') { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.goto(`http://localhost:5262/?${qs}`); await sleep(2500); return p; }
const flow = p => p.evaluate(() => ({ s: window.__dc.flow.state, demo: window.__dc.flow.snapshot().demo }));
// game px -> page px
const click = async (p, gx, gy) => { const r = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; }); await p.mouse.click(r.x + gx * r.w / 960, r.y + gy * r.h / 540); };
const waitFor = async (p, want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await flow(p)).s === want) return true; await sleep(250); } return false; };
async function toRunnerDemo(p) { for (const e of [{ type: 'SKIP' }, { type: 'SELECT', character: 'SAM' }, { type: 'FOREST_LOST' }, { type: 'SKIP' }, { type: 'SKIP' }, { type: 'ACCEPT' }]) await p.evaluate(e => window.__dc.flow.dispatch(e), e); await sleep(1500); }

{ // title
  const p = await open();
  const info = await p.evaluate(() => { const sc = window.__dc.game.scene.getScene('TitleScene'); const all = []; const walk = o => { all.push(o); (o.list || []).forEach(walk); }; sc.children.list.forEach(walk);
    const myc = all.filter(o => o.type === 'Sprite' && String(o.texture?.key).startsWith('myconid')).length;
    const texts = all.filter(o => o.type === 'BitmapText' && o.visible).map(o => { const b = o.getBounds(); return { t: o.text, x: b.x, y: b.y, r: b.right, b: b.bottom, a: o.alpha, add: o.blendMode }; });
    return { myc, vortex: all.filter(o => o.type === 'Sprite').length, texts }; });
  ok(info.myc === 0, `no myconid sprites (count ${info.myc}); Sprite objects total ${info.vortex}`);
  const vis = info.texts.filter(t => t.add !== 1); // non-ADD = real labels
  let overlap = false; for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) { const a = vis[i], c = vis[j]; if (a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b) { overlap = true; console.log('  overlap', a.t, '/', c.t); } }
  ok(!overlap, 'no overlapping visible labels'); console.log(info.texts.map(t => `${t.t}@${[t.x, t.y, t.r, t.b].map(Math.round)}`).join(' | '));
  const issues = await p.evaluate(() => window.__dc.auditText()); ok(issues.length === 0, 'title text audit clean');
  await p.screenshot({ path: `${out}/home-title.png` });
  await click(p, 480, 435); ok(await waitFor(p, 'COSMIC_INTRO', 5000), 'DEMO MODE click -> COSMIC_INTRO'); const f = await flow(p); ok(f.demo === true, 'snapshot.demo true');
  await p.context().close(); }
{ // PLAY still non-demo
  const p = await open(); await click(p, 290, 330); ok(await waitFor(p, 'COSMIC_INTRO', 5000) && (await flow(p)).demo === false, 'PLAY click -> COSMIC_INTRO demo=false'); await p.context().close(); }
for (const [opt, end, label] of [[1, 'RUNNER_SUCCESS', 'win'], [2, 'RUNNER_FAILURE', 'lose']]) {
  const p = await open('seed=4'); await click(p, 480, 435); await waitFor(p, 'COSMIC_INTRO', 5000); await toRunnerDemo(p);
  ok((await flow(p)).s === 'THREAD_RUNNER' && (await flow(p)).demo, 'in THREAD_RUNNER with demo'); await sleep(500);
  if (opt === 1) { await p.screenshot({ path: `${out}/home-demo-panel.png` }); const iss = await p.evaluate(() => window.__dc.auditText()); ok(iss.length === 0, 'demo panel text audit clean ' + JSON.stringify(iss)); }
  const ph = await p.evaluate(() => window.__dc.game.scene.getScene('RunnerScene').phase); ok(ph === 'demo', 'runner waits in demo phase: ' + ph);
  if (opt === 1) await click(p, 480 - 264, 270 + 165 - 78); else await p.keyboard.press('2');   // real click on option 1 button / key 2
  if (opt === 1) { await sleep(9000); await p.screenshot({ path: `${out}/home-demo-bot.png` }); }
  ok(await waitFor(p, end, 80000), `demo option ${opt} (${label}) -> ${end}`);
  if (opt === 1) console.log('  stats', JSON.stringify(await p.evaluate(() => window.__dc.services.session.runnerStats)));
  await p.context().close(); }
console.log('page errors:', errs.length ? errs : 'none'); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
