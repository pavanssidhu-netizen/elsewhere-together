// Layout check: node e2e/layout.mjs   (STYLES=pixel,ink,ink-light to limit). Measures the world canvas scale, overflow and button sizes.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const PORT = 5198, sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_DIR;
const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await sleep(500); }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
const SIZES = [[1280, 800], [1920, 1080], [1366, 768], [360, 740], [740, 360]];
let bad = 0;
for (const style of (process.env.STYLES || 'pixel,ink,ink-light').split(',')) for (const [W, H] of SIZES) {
  const mobile = Math.min(W, H) < 500;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/?debug=1&style=${style}`); await sleep(1200);
  await page.evaluate(() => { localStorage.removeItem('elsewhere-together-save-v1'); });
  await page.click('#s-start'); await sleep(700);
  const m = () => page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const vp = r(document.getElementById('viewport')), cv = r(document.querySelector('#game canvas'));
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const btns = [...document.querySelectorAll('button')].filter(e => vis(e) && !e.closest('.overlay,.archive,.fork')).map(e => ({ id: e.id || e.textContent.trim().slice(0, 10), ...r(e) }));
    const act = document.querySelector('.actions'); 
    return { vp, cv, k: +(cv.w / 320).toFixed(3), btns, actions: vis(act) ? r(act) : null, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
  });
  const a = await m();
  await page.keyboard.down('d'); await sleep(500); await page.keyboard.up('d'); await sleep(200);
  const b = await m();
  const probs = [];
  if (a.cv.x < a.vp.x - .5 || a.cv.y < a.vp.y - .5 || a.cv.x + a.cv.w > a.vp.x + a.vp.w + .5 || a.cv.y + a.cv.h > a.vp.y + a.vp.h + .5) probs.push('canvas clipped');
  if (a.cv.y + a.cv.h > a.ih + .5 || a.cv.x + a.cv.w > a.iw + .5) probs.push('canvas off-screen');
  if (a.sw > a.iw + 4 || a.sh > a.ih + 4) probs.push(`page overflow ${a.sw}x${a.sh}`);
  if (JSON.stringify(a.actions) !== JSON.stringify(b.actions)) probs.push('actions moved');
  if (a.actions && a.cv.y + a.cv.h > a.actions.y + .5) probs.push('canvas overlaps actions');
  if (mobile) for (const x of a.btns) if (x.h < 43.5 || x.w < 43.5) probs.push(`small button ${x.id} ${x.w}x${x.h}`);
  if (mobile) { // LINK tab: buttons must also be >= 44px
    await page.click('.tabs button[data-tab=link]'); await sleep(300);
    const l = await m(); for (const x of l.btns) if (x.h < 43.5 || x.w < 43.5) probs.push(`small button (link tab) ${x.id} ${x.w}x${x.h}`);
    await page.click('.tabs button[data-tab=world]'); await sleep(300);
  }
  const k = a.k, kmax = Math.min(a.vp.w / 320, a.vp.h / 180);
  if (style === 'pixel' && k >= 1 && Math.abs(k - Math.round(k)) > 0.01) probs.push('pixel scale not integer');
  console.log(`${probs.length ? 'FAIL' : 'ok  '} ${style} ${W}x${H} vp=${a.vp.w}x${a.vp.h} canvas=${a.cv.w}x${a.cv.h} scale=${k} (fit ${kmax.toFixed(2)}) slack=${((1 - k / kmax) * 100).toFixed(0)}%${probs.length ? ' :: ' + probs.join('; ') : ''}`);
  bad += probs.length ? 1 : 0;
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${style}-${W}x${H}.png` }); }
  await ctx.close();
}
await browser.close(); srv.kill(); process.exit(bad ? 1 : 0);
