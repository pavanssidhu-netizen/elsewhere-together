// Screenshots of the world renderer via the synthetic-state harness (/shots.html). node e2e/scribble-shots.mjs
// STYLE=scribble|pixel|ink|ink-light, OUT=dir. Same playwright/CHROME_PATH resolution as e2e/run.mjs.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const STYLE = process.env.STYLE || 'scribble';
const OUT = (process.env.OUT || new URL('../docs/shots/v2/', import.meta.url).pathname).replace(/\/?$/, '/');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5188;
const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/shots.html`)).ok) break; } catch {} await sleep(500); }
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${PORT}/shots.html?style=${STYLE}`); await p.waitForFunction(() => window.__h?.scene?.sys?.isActive?.()); await sleep(1200);
const prefix = STYLE === 'scribble' ? '' : STYLE + '-';
const shot = async (name, o, wait = 400) => { await p.evaluate((o) => window.__h.set(o), o); await sleep(wait); await p.screenshot({ path: `${OUT}${prefix}${name}.png` }); console.log('shot', name); };
const all = { light: 3, water: 1, structure: 2, signal: 2, growth: 2, instability: 10, flags: [], alien: false, tile: [7, 5], examined: [] };
await shot('world-normal', all);
await shot('world-prompt', { ...all, tile: [8, 4], water: 1 });
await shot('world-bridge-broken', { ...all, flags: ['BRIDGE_CLOSED'], tile: [4, 5], examined: ['stones'] });
await shot('world-flooded', { ...all, water: 3, light: 1, growth: 0, signal: 0, tile: [11, 7], instability: 50 });
await shot('world-alien', { ...all, alien: true, tile: [10, 4] });
await shot('world-coast-open-anchors', { ...all, flags: ['COAST_OPEN'], water: 1, tile: [15, 7], anchors: [{ aligned: true }, { playerReady: true }, { partnerReady: true }], identity: 'cyan' });
await p.evaluate(() => window.__h.trace('anchor_LANTERN')); await shot('world-apparition', { ...all, tile: [9, 5], identity: 'cyan' }, 300);
console.log('errors:', JSON.stringify(errs));
await b.close(); srv.kill();
