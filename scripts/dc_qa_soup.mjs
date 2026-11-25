// Soup proof: runs SoupScene for both characters, samples the mushroom/vat geometry every 100 ms, screenshots key phases to /tmp/soup.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const PORT = await new Promise(r => srv.listen(0, () => r(srv.address().port)));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
fs.mkdirSync('/tmp/soup', { recursive: true });
let fails = 0;
for (const ch of ['SAM', 'JENSEN']) {
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/?jump=SOUP_ENDING&char=${ch}`);
  const shot = new Set(); let samples = 0, bad = [], capSeen = 0;
  for (let t = 0; t < 16000; t += 100) {
    await p.waitForTimeout(100);
    const s = await p.evaluate(() => {
      const sc = window.__dc.game.scene.getScene('SoupScene'); const d = sc?.dbg; if (!d) return null;
      const bd = d.m.getBounds();
      return { phase: d.phase, lowered: d.lowered, masked: !!d.m.mask, depth: d.m.depth, b: { x: bd.x, y: bd.y, r: bd.right, bt: bd.bottom }, vat: { x: d.vat.x, y: d.vat.y, r: d.vat.right, bt: d.vat.bottom }, surfY: d.surfY };
    });
    if (!s) continue; samples++;
    if (s.lowered) {
      const visBottom = Math.min(s.b.bt, s.surfY);
      const ok = s.masked && s.b.x >= s.vat.x - 0.5 && s.b.r <= s.vat.r + 0.5 && visBottom <= s.surfY + 0.5 && visBottom <= s.vat.bt;
      if (!ok) bad.push({ t, ...s });
      if (s.phase === 'bob') capSeen++;
    } else if (!(s.depth >= 30 || s.b.r < s.vat.x || s.b.x > s.vat.r)) bad.push({ t, why: 'behind vat before lowering', ...s });
    if (!shot.has(s.phase) && ['lift', 'hover', 'sink', 'bob', 'card'].includes(s.phase)) { shot.add(s.phase); await p.screenshot({ path: `/tmp/soup/${ch}-${s.phase}.png` }); }
    if (s.phase === 'sink' && !shot.has('sink2')) { shot.add('sink2'); await p.waitForTimeout(250); await p.screenshot({ path: `/tmp/soup/${ch}-midsink.png` }); }
    if (s.phase === 'card' && t > 0) break;
  }
  console.log(ch, 'samples', samples, 'bob-samples', capSeen, 'phases shot', [...shot].join(','), 'violations', bad.length, 'console errors', errs.length);
  if (bad.length) console.log(JSON.stringify(bad.slice(0, 3)));
  if (errs.length) console.log(errs.slice(0, 5));
  if (bad.length || errs.length || !shot.has('card')) fails++;
  await p.close();
}
await b.close(); srv.close(); process.exit(fails ? 1 : 0);
