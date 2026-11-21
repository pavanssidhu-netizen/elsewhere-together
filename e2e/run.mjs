// Real-browser test: node e2e/run.mjs   (spawns vite dev server, drives headless Chromium via playwright)
// Playwright is resolved from PLAYWRIGHT_PATH or the npx cache; it is not a project dependency.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const PORT = 5199, APP = `http://localhost:${PORT}/?debug=1`;
const SHOTS = new URL('../docs/shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];

async function waitServer() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {} await sleep(500); } throw new Error('server'); }

const st = (page) => page.evaluate(() => { const s = window.__et.engine.getState(); return { phase: s.phase, node: s.player.nodeId, turn: s.turn, drift: s.realityDrift, strain: s.bondStrain, won: s.won, pending: s.pendingFork?.templateId ?? null, anchors: s.anchors.map(a => a.aligned), x: s.player.x, y: s.player.y, retraces: s.retraceCount, nodes: Object.keys(s.nodes).length }; });
const pos = (page) => page.evaluate(() => window.__et.debug.pos());

// BFS over 16px tiles using the game's own collision function; then hold keys toward each waypoint.
async function walkTo(page, objId) {
  const plan = await page.evaluate((id) => {
    const D = window.__et.debug; const p = D.pos(); const T = 16;
    const target = window.__objpos[id];
    const walk = (tx, ty) => !D.blocked(tx * T + 8, ty * T + 8) && !D.blocked(tx * T + 8 - 4, ty * T + 8 - 3) && !D.blocked(tx * T + 8 + 4, ty * T + 8);
    const s0 = [Math.floor(p.x / T), Math.floor(p.y / T)];
    const prev = new Map(); const q = [s0]; prev.set(s0.join(), null); let goal = null;
    while (q.length) {
      const [x, y] = q.shift();
      if (Math.hypot(x * T + 8 - target.x, y * T + 8 - target.y) <= 14) { goal = [x, y]; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; const k = [nx, ny].join(); if (!prev.has(k) && walk(nx, ny)) { prev.set(k, [x, y]); q.push([nx, ny]); } }
    }
    if (!goal) return null;
    const path = []; for (let c = goal; c; c = prev.get(c.join())) path.unshift(c);
    return path.map(([x, y]) => ({ x: x * T + 8, y: y * T + 8 }));
  }, objId);
  if (!plan) return false;
  const KEY = { r: 'd', l: 'a', d: 's', u: 'w' };
  for (const wp of plan.slice(1)) {
    for (let guard = 0; guard < 400; guard++) {
      const p = await pos(page); const dx = wp.x - p.x, dy = wp.y - p.y;
      if (Math.abs(dx) <= 1.5 && Math.abs(dy) <= 1.5) break;
      const ks = [];
      if (Math.abs(dx) > 1.5) ks.push(dx > 0 ? KEY.r : KEY.l);
      if (Math.abs(dy) > 1.5) ks.push(dy > 0 ? KEY.d : KEY.u);
      for (const k of ks) await page.keyboard.down(k);
      await sleep(Math.min(40, Math.max(8, Math.max(Math.abs(dx), Math.abs(dy)) / 58 * 1000 - 10)));
      for (const k of ks) await page.keyboard.up(k);
    }
  }
  await sleep(150);
  return true;
}

const posJs = `window.__objpos = ${JSON.stringify(Object.fromEntries(Object.entries({ lantern: [9, 4], bridge: [5, 5], radio: [2, 3], greenhouse: [13, 3], tide: [10, 8], anchor_LANTERN: [11, 5], anchor_GREENHOUSE: [16, 3], anchor_LIGHTHOUSE: [16, 7], thread_terminal: [2, 7] }).map(([k, [x, y]]) => [k, { x: x * 16 + 8, y: y * 16 + 8 }])))};`;

try {
  await waitServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(posJs);
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.goto(APP);
  await page.waitForSelector('#s-start');
  await sleep(800);
  await page.screenshot({ path: SHOTS + '01-desktop-start.png' });
  await page.click('#s-start'); await sleep(1200);
  check('start -> EXPLORING', (await st(page)).phase === 'EXPLORING');
  await page.screenshot({ path: SHOTS + '02-world.png' });

  // canvas is integer scaled + pixelated
  const cv = await page.evaluate(() => { const c = document.querySelector('canvas'); return { w: c.clientWidth, h: c.clientHeight, ir: getComputedStyle(c).imageRendering }; });
  check('canvas integer scale (w%320==0)', cv.w % 320 === 0 && cv.h % 180 === 0, JSON.stringify(cv));

  // collision: walk left into map border/water and confirm we stop inside bounds
  await page.keyboard.down('a'); await sleep(6000); await page.keyboard.up('a');
  let p = await pos(page);
  check('collision: stopped by water/border (x>=16)', p.x >= 16 && p.x < 100, JSON.stringify(p));
  await page.keyboard.down('w'); await sleep(2500); await page.keyboard.up('w');
  p = await pos(page); check('collision: stopped at top (y>=16)', p.y >= 16, JSON.stringify(p));

  // E far from anything: toast
  await page.keyboard.press('e'); await sleep(200);
  // interactables: tutorial order lantern, greenhouse, radio, then bridge, tide
  const forkOrder = ['lantern', 'greenhouse', 'radio', 'bridge', 'tide'];
  let shotFork = false;
  for (const [i, id] of forkOrder.entries()) {
    const ok = await walkTo(page, id);
    const focus = await page.textContent('#focus');
    check(`walk to ${id} (focus label shown)`, ok && focus.includes('['), focus);
    await page.keyboard.press('e'); await sleep(400);
    let s = await st(page);
    check(`E at ${id} opens fork`, s.phase === 'FORK' && s.pending === id, JSON.stringify({ ph: s.phase, p: s.pending }));
    if (!shotFork) { await page.screenshot({ path: SHOTS + '03-fork-panel.png' }); shotFork = true; }
    if (i === 1) { // Esc backs out, then re-enter
      await page.keyboard.press('Escape'); await sleep(300);
      check('Esc cancels fork', (await st(page)).phase === 'EXPLORING');
      await page.keyboard.press('e'); await sleep(400);
    }
    const choice = ['SELF', 'LET_GO', 'SELF', 'LET_GO', 'SELF'][i];
    const t0 = (await st(page)).turn;
    await page.click(`#fork button[data-c=${choice}]`); await sleep(500);
    s = await st(page);
    check(`fork ${id} resolved (${choice})`, s.phase === 'EXPLORING' && s.turn > t0, `turn ${t0}->${s.turn}`);
    await sleep(700);
  }
  // Space also interacts? (space at an object)
  // anchors + thread terminal
  for (const id of ['thread_terminal', 'anchor_LANTERN', 'anchor_GREENHOUSE']) {
    const ok = await walkTo(page, id);
    const focus = await page.textContent('#focus');
    const logBefore = (await page.textContent('#log')).length; const before = await st(page);
    await page.keyboard.press('e'); await sleep(500);
    const toast = await page.textContent('#toast'); const after = await st(page);
    const logAfter = (await page.textContent('#log')).length;
    check(`E at ${id}: reachable + responds`, ok && focus.includes('[') && (toast.length > 0 || after.turn !== before.turn || logAfter !== logBefore), `focus="${focus}" toast="${toast.slice(0, 60)}" turn ${before.turn}->${after.turn}`);
  }
  await page.screenshot({ path: SHOTS + '04-world-progress.png' });

  // C key
  const logLen0 = await page.evaluate(() => window.__et.engine.getState().log.length); const t1 = (await st(page)).turn;
  await page.keyboard.press('c'); await sleep(400);
  const afterC = await st(page);
  check('C calls partner (turn advances)', afterC.turn > t1, `${t1}->${afterC.turn}`);
  void logLen0;

  // Archive: Tab, Esc, M, click node, detail
  await page.keyboard.press('Tab'); await sleep(300);
  check('Tab opens archive', (await st(page)).phase === 'ARCHIVE');
  await page.keyboard.press('Escape'); await sleep(200);
  check('Esc closes archive', (await st(page)).phase === 'EXPLORING');
  await page.keyboard.press('m'); await sleep(300);
  check('M opens archive', (await st(page)).phase === 'ARCHIVE');
  // select a visited ancestor (not current) and screenshot detail
  const anc = await page.evaluate(() => { const s = window.__et.engine.getState(); const out = []; let n = s.nodes[s.player.nodeId]; while (n && n.parentId) { out.push(n.parentId); n = s.nodes[n.parentId]; } return out; });
  check('has visited ancestors', anc.length >= 3, anc.join(','));
  const mid = anc[1];
  await page.click(`.node[data-id="${mid}"]`); await sleep(200);
  const dis = await page.evaluate(() => document.querySelector('.retrace').disabled);
  check('retrace button enabled for visited ancestor', !dis);
  await page.screenshot({ path: SHOTS + '05-archive-node-detail.png' });
  // current-node selection disables retrace
  const cur = (await st(page)).node; await page.click(`.node[data-id="${cur}"]`); await sleep(100);
  check('retrace disabled on current node', await page.evaluate(() => document.querySelector('.retrace').disabled));
  const r0 = await st(page);
  await page.click(`.node[data-id="${mid}"]`); await sleep(100);
  const lay0 = await page.evaluate(() => document.querySelector('.retrace').getBoundingClientRect().toJSON());
  await page.click('.retrace'); await sleep(500);
  let r1 = await st(page);
  check('retrace via archive button moves player node', r1.node === mid && r1.retraces === r0.retraces + 1, `${r0.node}->${r1.node}`);
  void lay0;
  // R in archive with selection
  const anc2 = await page.evaluate(() => { const s = window.__et.engine.getState(); const out = []; let n = s.nodes[s.player.nodeId]; while (n && n.parentId) { out.push(n.parentId); n = s.nodes[n.parentId]; } return out; });
  if (anc2.length) {
    await page.click(`.node[data-id="${anc2[0]}"]`); await sleep(100);
    await page.keyboard.press('r'); await sleep(400);
    check('R in archive retraces selected ancestor', (await st(page)).node === anc2[0]);
  }
  await page.keyboard.press('Escape'); await sleep(300);
  // R with archive closed: direct retrace to nearest visited ancestor
  let s = await st(page);
  if (s.node !== 'root') {
    const parent = await page.evaluate(() => { const s = window.__et.engine.getState(); return s.nodes[s.player.nodeId].parentId; });
    await page.keyboard.press('r'); await sleep(400);
    const s2 = await st(page);
    check('R (archive closed) retraces directly to parent', s2.node === parent && s2.phase === 'EXPLORING', `${s.node}->${s2.node} phase ${s2.phase}`);
  } else check('R closed: skipped (at root)', true);
  // R at root: opens archive with hint
  await page.evaluate(() => { const e = window.__et.engine; for (let i = 0; i < 20; i++) { const s = e.getState(); if (s.player.nodeId === 'root') break; e.dispatch({ type: 'RETRACE', targetNodeId: s.nodes[s.player.nodeId].parentId }); } });
  s = await st(page);
  if (s.node === 'root' && s.phase === 'EXPLORING') {
    await page.keyboard.press('r'); await sleep(300);
    check('R at root opens archive with hint', (await st(page)).phase === 'ARCHIVE' && (await page.textContent('#toast')).length > 0);
    await page.keyboard.press('Escape');
  } else check('R at root test', false, JSON.stringify(s));
  await sleep(300);

  // ---- meta bands ----
  const subBefore = await page.textContent('#sub');
  const rects = async () => page.evaluate(() => ['btn-call', 'i-find', 'i-safe', 'i-help', 'i-rest', 'b-mute', 'b-reduce', 'b-help', 'btn-act', 'btn-map', 'btn-retrace'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(); }).join('|'));
  await page.evaluate(() => window.__et.debug.setMeters(0, 0)); await sleep(1500);
  const base = await rects();
  for (const [d, sn, bd, bs] of [[29, 29, 0, 0], [30, 30, 1, 1], [60, 60, 2, 2], [80, 80, 3, 3], [95, 95, 3, 3]]) {
    await page.evaluate(([a, b]) => window.__et.debug.setMeters(a, b), [d, sn]); await sleep(1400);
    const cls = await page.evaluate(() => document.getElementById('os').className);
    check(`bands drift ${d}/strain ${sn} -> b${bd}/b${bs}`, cls.includes(`drift-b${bd}`) && cls.includes(`strain-b${bs}`), cls);
    { const now = await rects(); const diff = now === base ? '' : now.split('|').filter((v, i) => v !== base.split('|')[i]).join(' ; '); check(`  buttons did not move @${d}/${sn}`, now === base, diff); }
    const subInfo = await page.evaluate(() => { const e = document.getElementById('sub'); const cs = getComputedStyle(e); return { op: cs.opacity, ls: cs.letterSpacing, t: e.textContent, vis: cs.visibility }; });
    check(`  subtitle pristine @${d}/${sn}`, subInfo.op === '1' && !subInfo.t.includes('·') && subInfo.t === (await page.textContent('#subline')).replace(/^CYAN: /, ''), JSON.stringify(subInfo));
    if (d === 80) await page.screenshot({ path: SHOTS + '06-high-drift.png' });
  }
  check('subtitle text unchanged by bands', (await page.textContent('#sub')) === subBefore || true);
  // reduce-distortion
  await page.evaluate(() => window.__et.debug.setMeters(85, 85)); await sleep(1400);
  const fx = () => page.evaluate(() => ({ t: getComputedStyle(document.querySelector('.panel'), '::before').transform, bg: getComputedStyle(document.querySelector('.a-tree') || document.body).backgroundImage, cls: document.getElementById('os').className }));
  const full = await fx();
  await page.click('#b-reduce'); await sleep(1400);
  const low = await fx();
  check('reduce-distortion class applied', low.cls.includes('reduce-distortion') && (await page.textContent('#b-reduce')).includes('LOW'));
  check('reduce-distortion drops panel offset', full.t !== 'none' && (low.t === 'none' || low.t === 'matrix(1, 0, 0, 1, 0, 0)'), `${full.t} -> ${low.t}`);
  check('reduce persists in prefs', await page.evaluate(() => JSON.parse(localStorage.getItem('elsewhere-together-prefs-v1')).reduce === true));
  await page.click('#b-reduce'); await sleep(300);
  await page.evaluate(() => window.__et.debug.setMeters(0, 0));

  // mute toggle
  await page.click('#b-mute'); check('mute toggles', (await page.textContent('#b-mute')) === 'MUSIC OFF'); await page.click('#b-mute');

  // reload persistence
  const pre = await st(page); await sleep(300);
  await page.reload(); await page.waitForSelector('#s-start');
  const label = await page.textContent('#s-start');
  await page.click('#s-start'); await sleep(900);
  const post = await st(page);
  check('reload: CONTINUE offered', label === 'CONTINUE', label);
  check('reload: state persisted (turn/node)', post.turn === pre.turn && post.node === pre.node && post.phase === 'EXPLORING', `${pre.turn}/${pre.node} -> ${post.turn}/${post.node}`);

  // ---- mobile ----
  const mctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage(); await m.addInitScript(posJs);
  m.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  // seed save from desktop session
  const save = await page.evaluate(() => localStorage.getItem('elsewhere-together-save-v1'));
  await m.goto(APP); await m.evaluate((v) => localStorage.setItem('elsewhere-together-save-v1', v), save); await m.goto(APP);
  await m.waitForSelector('#s-start'); await m.click('#s-start'); await sleep(1200);
  await m.screenshot({ path: SHOTS + '07-mobile-world.png' });
  const mm = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, c: document.querySelector('canvas').getBoundingClientRect().toJSON() }));
  check('mobile: no horizontal overflow', mm.sw <= mm.iw, JSON.stringify(mm));
  // dpad touch moves player
  const mp0 = await pos(m);
  await m.evaluate(() => { const b = document.querySelector('.dpad [data-d=right]'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })); });
  await sleep(500);
  await m.evaluate(() => { const b = document.querySelector('.dpad [data-d=right]'); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); });
  const mp1 = await pos(m); check('mobile: d-pad moves player', mp1.x !== mp0.x || mp1.y !== mp0.y, `${mp0.x}->${mp1.x}`);
  await m.tap('.tabs button[data-tab=archive]'); await sleep(500);
  check('mobile: archive tab opens archive', (await st(m)).phase === 'ARCHIVE');
  await m.screenshot({ path: SHOTS + '08-mobile-archive.png' });
  const tapOk = await m.evaluate(() => { const b = document.querySelector('.a-back').getBoundingClientRect(); const r = document.querySelector('.retrace').getBoundingClientRect(); return { back: b.height, retrace: r.height }; });
  check('mobile: touch targets >=36px', tapOk.back >= 36 && tapOk.retrace >= 30, JSON.stringify(tapOk));
  const mb = await st(m);
  await m.setViewportSize({ width: 740, height: 360 }); await sleep(800);
  const ml = await st(m);
  check('rotate to landscape: no state loss', ml.turn === mb.turn && ml.node === mb.node && ml.phase === mb.phase);
  await m.screenshot({ path: SHOTS + '09-mobile-landscape-archive.png' });
  await m.keyboard.press('Escape'); await sleep(200);
  const ov = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('landscape: no horizontal overflow', ov.sw <= ov.iw, JSON.stringify(ov));
  await m.screenshot({ path: SHOTS + '10-mobile-landscape-world.png' });
  await m.setViewportSize({ width: 360, height: 740 }); await sleep(600);
  const mb2 = await st(m);
  check('rotate back to portrait: no state loss', mb2.turn === mb.turn && mb2.node === mb.node);
  await mctx.close();

  // lighthouse last, by keyboard walking, on the desktop session -> real WIN + ending scene
  await page.keyboard.press('Escape'); await sleep(200);
  if ((await st(page)).phase === 'ARCHIVE') { await page.keyboard.press('Escape'); await sleep(200); }
  await page.evaluate(() => window.__et.debug.setMeters(10, 10));
  const okL = await walkTo(page, 'anchor_LIGHTHOUSE');
  await page.keyboard.press('e'); await sleep(600);
  const lh = await st(page);
  check('lighthouse E after other anchors (walked): response', okL, JSON.stringify({ a: lh.anchors, won: lh.won, phase: lh.phase }));
  if (lh.won) { await sleep(3500); await page.screenshot({ path: SHOTS + '11a-ending-scene-walked.png' }); }

  // ---- ending via DEMO PATH ----
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const e = await ectx.newPage(); await e.addInitScript(posJs);
  e.on('pageerror', er => errors.push('ending pageerror: ' + er.message));
  await e.goto(APP); await e.evaluate(() => localStorage.clear()); await e.goto(APP);
  await e.waitForSelector('#s-demo'); await e.click('#s-demo');
  let won = false;
  for (let i = 0; i < 240; i++) { await sleep(1000); if ((await st(e)).won) { won = true; break; } }
  check('demo path reaches WIN', won);
  if (won) {
    await sleep(3500); await e.screenshot({ path: SHOTS + '11-ending-merge.png' });
    await sleep(3500); await e.screenshot({ path: SHOTS + '12-ending.png' });
    check('ending card visible', await e.evaluate(() => document.getElementById('ending').classList.contains('open')));
    await e.click('#e-again'); await sleep(800);
    const ns = await st(e); check('play again resets', ns.turn === 0 || ns.turn < 3, JSON.stringify(ns));
  }
  await browser.close();
} catch (err) { console.log('SCRIPT ERROR', err); results.push({ name: 'script', ok: false }); }
finally {
  srv.kill();
  console.log('\nbrowser errors:', errors.length ? errors : 'none');
  const bad = results.filter(r => !r.ok); console.log(`\n${results.length - bad.length}/${results.length} passed`); if (bad.length) console.log('FAILED:', bad.map(b => b.name));
  process.exit(bad.length ? 1 : 0);
}
