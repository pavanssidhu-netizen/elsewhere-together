// Shared helpers for the forest QA scripts: static server on a free port, headless chromium, game->viewport mapping.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function start() {
  const root = path.resolve('dist'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.fnt': 'text/xml' };
  const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
  const port = await new Promise(r => srv.listen(0, () => r(srv.address().port)));
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  async function open(qs) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    await p.goto(`http://localhost:${port}/?${qs}`); await sleep(2200);
    p.rect = async () => p.evaluate(() => { const c = document.querySelector('#dc-game canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    p.click = async (gx, gy) => { const r = await p.rect(); await p.mouse.click(r.x + gx * r.w / 960, r.y + gy * r.h / 540); };
    return p;
  }
  return { open, errs, close: async () => { await b.close(); srv.close(); } };
}
export const key = i => i.t === 'MOVE' ? { N: 'ArrowUp', S: 'ArrowDown', E: 'ArrowRight', W: 'ArrowLeft' }[i.dir] : i.t === 'A' ? 'z' : i.t === 'B' ? 'x' : 'Enter';
export const flowState = p => p.evaluate(() => window.__dc.flow.state);
