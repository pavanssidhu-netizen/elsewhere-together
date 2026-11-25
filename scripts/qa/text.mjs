// Text-fit audit: visits every scene through the real flow and prints every text that sits outside its box or the canvas.
// Usage: node scripts/qa/text.mjs   (serves ./dist). Exit code 1 when anything overflows.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const PORT = await new Promise(r => srv.listen(0, () => r(srv.address().port)));   // free port: parallel QA runs never collide
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
const plan = [['title', '', [2500]], ['intro', 'jump=COSMIC_INTRO', [4000, 12000, 20000]], ['select', 'jump=CHARACTER_SELECT', [2500]], ['forest', 'jump=FOREST_GAME&char=SAM&seed=3', [2500, 4500]],
  ['reunion', 'jump=FOREST_SUCCESS', [4000, 9000]], ['collapse', 'jump=FOREST_FAILURE', [3000]], ['beam', 'jump=ABDUCTION', [3000]], ['office', 'jump=TIME_MASTER_OFFICE', [3000, 7000, 12000]],
  ['soup', 'jump=SOUP_ENDING', [4000, 9000, 14000]], ['runner', 'jump=THREAD_RUNNER&seed=4', [3000, 6000]], ['runwin', 'jump=RUNNER_SUCCESS', [3000, 8000]], ['runfail', 'jump=RUNNER_FAILURE', [3000, 6000]],
  ['end-forest', 'jump=REUNION_ENDING', [3000]], ['end-final', 'jump=FINAL_ENDING', [3000]]];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; let bad = 0;
for (const [name, qs, times] of plan) {
  if (only && !only.includes(name)) continue;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage(); await p.goto(`http://localhost:${PORT}/?${qs}`); let t0 = 0;
  for (const t of times) { await sleep(t - t0); t0 = t; if (name === 'office') await p.keyboard.press('Enter');
    const issues = await p.evaluate(() => window.__dc.auditText()); for (const i of issues) { bad++; console.log(`  ${name}@${t}ms [${i.scene}] ${i.reason}: "${i.text}" label=${i.label} bounds=${[i.bounds.x, i.bounds.y, i.bounds.w, i.bounds.h].map(Math.round)}${i.box ? ' box=' + [i.box.x, i.box.y, i.box.w, i.box.h].map(Math.round) : ''}`); } }
  await ctx.close(); console.log(name.padEnd(11), 'checked');
}
console.log(bad ? `${bad} TEXT OVERFLOW ISSUES` : 'no text overflows'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
