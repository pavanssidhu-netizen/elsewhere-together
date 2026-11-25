// Screenshot every Director's Cut scene through the real flow (?jump=), collecting console/page errors.
// Usage: node scripts/dc_qa_shots.mjs [outDir] [viewport WxH]   (serves ./dist on a spare port)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.argv[2] || '/tmp/qa'; const [VW, VH] = (process.argv[3] || '1280x720').split('x').map(Number);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const PORT = await new Promise(r => srv.listen(0, () => r(srv.address().port)));   // free port: parallel QA runs never collide
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const plan = [
  ['title', '', [3000]], ['intro', 'jump=COSMIC_INTRO', [3000, 9000, 15000, 21000, 27000]], ['select', 'jump=CHARACTER_SELECT', [2500]],
  ['forest', 'jump=FOREST_GAME&char=SAM&seed=3', [2500, 5000]], ['reunion', 'jump=FOREST_SUCCESS&char=JENSEN', [3000, 8000]],
  ['collapse', 'jump=FOREST_FAILURE&char=SAM', [2500]], ['beam', 'jump=ABDUCTION&char=SAM', [2500, 4000]], ['office', 'jump=TIME_MASTER_OFFICE&char=SAM', [2500, 20000, 32000]],
  ['soup', 'jump=SOUP_ENDING&char=JENSEN', [3000, 8000, 13000]], ['runner', 'jump=THREAD_RUNNER&char=SAM&seed=4', [3000, 6000]],
  ['runwin', 'jump=RUNNER_SUCCESS&char=SAM', [3000, 7000]], ['runfail', 'jump=RUNNER_FAILURE&char=SAM', [2500, 6000]],
  ['end-forest', 'jump=REUNION_ENDING&char=SAM', [2500]], ['end-final', 'jump=FINAL_ENDING&char=SAM', [2500]],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [name, qs, times] of plan) {
  if (only && !only.includes(name)) continue;
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: VW < 700, isMobile: VW < 700 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name}: PAGEERROR ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text().slice(0, 200)}`); });
  await p.goto(`http://localhost:${PORT}/?${qs}`); let t0 = 0;
  for (const t of times) { await sleep(t - t0); t0 = t; await p.screenshot({ path: `${out}/${name}-${String(t / 1000)}s.png` }); }
  if (name === 'title') await p.mouse.click(VW / 2, VH * 0.62);
  const st = await p.evaluate(() => window.__dc?.flow.state).catch(() => '?'); console.log(name.padEnd(12), 'flow:', st);
  await ctx.close();
}
console.log('errors:', errs.length ? errs : 'none'); await b.close(); srv.close();
