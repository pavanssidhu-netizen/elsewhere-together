// Real-browser test of the V2 shell: node e2e/run.mjs   (spawns vite dev server, drives headless Chromium via playwright)
// Env: CHROME_PATH (chromium/headless-shell executable), PLAYWRIGHT_PATH (playwright module), STYLE (art style query), SHOTS_DIR.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_PATH || '/home/pavsidh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const STYLE = process.env.STYLE ? `&style=${process.env.STYLE}` : '';
const PORT = 5199, APP = `http://localhost:${PORT}/?debug=1${STYLE}`;
const SHOTS = (process.env.SHOTS_DIR || new URL('../docs/shots/v2/', import.meta.url).pathname).replace(/\/?$/, '/');
fs.mkdirSync(SHOTS, { recursive: true });

const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];
async function waitServer() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {} await sleep(500); } throw new Error('server'); }

const st = (page) => page.evaluate(() => { const s = window.__et.engine.getState(); return { phase: s.phase, turn: s.turn, node: s.player.nodeId, won: s.won, ending: s.v2?.ending, tick: s.v2?.tick, gx: s.v2?.gridX, gy: s.v2?.gridY, id: s.v2?.playerIdentity, events: s.events.length, nodes: Object.keys(s.nodes).length, journey: s.v2?.journey.length }; });
const screen = (page) => page.evaluate(() => document.getElementById('os').dataset.screen);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);

/** Legal MOVE steps (topology BFS) until adjacent to the object. */
async function walkObj(page, id) {
  return page.evaluate(async (id) => {
    const E = window.__et, T = E.debug.topo;
    for (let i = 0; i < 80; i++) {
      const s = E.engine.getState(); const w = s.nodes[s.player.nodeId];
      const from = { tx: s.v2.gridX, ty: s.v2.gridY };
      if (T.getNearbyInteractables(w.world, w.flags, from, s.v2.realm).includes(id)) return true;
      const p = T.pathTo(w.world, w.flags, from, id, s.v2.realm);
      if (!p || !p.length) return false;
      const step = p[0].tx === from.tx && p[0].ty === from.ty ? p[1] : p[0];
      if (!step) return false;
      E.send({ type: 'MOVE', tx: step.tx, ty: step.ty });
      await new Promise(r => setTimeout(r, 40));
    }
    return false;
  }, id);
}

async function freshToPlay(page, who = 'id-amber') {
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.goto(APP);
  await page.waitForSelector('#t-play'); await sleep(500);
  await page.click('#t-play'); await page.waitForSelector('#f-skip');
  await page.click('#f-skip'); await page.waitForSelector(`#${who}`, { state: 'visible' });
  await sleep(300);
}

try {
  await waitServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/home/pavsidh/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // ---------- title -> facts -> intro -> identity ----------
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.goto(APP);
  await page.waitForSelector('#t-play'); await sleep(600);
  check('title screen shown', (await screen(page)) === 'title');
  check('title has Play/Demo/About/Sound', (await vis(page, '#t-play')) && (await vis(page, '#t-demo')) && (await vis(page, '#t-about')) && (await vis(page, '#t-mute')));
  await page.screenshot({ path: SHOTS + 'shell-01-title.png' });
  await page.click('#t-about'); await sleep(200);
  const about = await page.textContent('#about');
  check('About lists Kenney CC0, ElevenLabs, Everett, Zurek, Bronstein', ['Kenney', 'CC0', 'ElevenLabs', 'Everett', 'Zurek', 'Bronstein', 'DeWitt'].every(w => about.includes(w)));
  await page.screenshot({ path: SHOTS + 'shell-02-about.png' });
  await page.click('#about-close');
  await page.click('#t-play'); await page.waitForSelector('#f-skip'); await sleep(300);
  check('loading facts shown, skippable', (await screen(page)) === 'facts' && (await page.textContent('#f-text')).length > 40);
  await page.screenshot({ path: SHOTS + 'shell-03-facts.png' });
  await page.click('#f-skip'); await sleep(300);
  check('skip -> intro', (await screen(page)) === 'intro');
  await sleep(1500); await page.screenshot({ path: SHOTS + 'shell-04-intro-together.png' });
  await page.waitForSelector('#id-amber', { state: 'visible' }); await sleep(4200);
  await page.screenshot({ path: SHOTS + 'shell-05-identity.png' });
  check('both identity choices visible', (await vis(page, '#id-amber')) && (await vis(page, '#id-cyan')));
  await page.click('#id-cyan'); await sleep(1200);
  let s = await st(page);
  check('CYAN identity set, play view', (await screen(page)) === 'play' && s.id === 'cyan' && s.phase !== 'BOOT', JSON.stringify(s));
  await page.screenshot({ path: SHOTS + 'shell-06-play-desktop.png' });

  // ---------- no dashboard ----------
  const dash = await page.evaluate(() => ['#log', '#m-drift', '#m-strain', '#fork', '.col-link', '.tabs', '#anchors', '#conflict', '#sub', '.meter'].filter(q => document.querySelector(q)));
  check('no dashboard elements in DOM (log/meters/fork/link panel)', dash.length === 0, dash.join(','));
  const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar button')].map(b => b.textContent.trim()));
  check('minimal top bar (sound, distortion, style, help, L)', bar.length <= 5 && bar.some(t => t.startsWith('SOUND')) && bar.some(t => t.startsWith('DISTORTION')) && bar.some(t => t.startsWith('STYLE')) && bar.includes('HELP'), bar.join('|'));
  const canvasW = await page.evaluate(() => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0);
  check('world canvas visible (>=600px wide)', canvasW >= 600, String(canvasW));

  // ---------- keyboard moves ----------
  const g0 = await st(page);
  await page.keyboard.down('d'); await sleep(450); await page.keyboard.up('d'); await sleep(200);
  const g1 = await st(page);
  check('WASD moves the player (grid pos or tick changes)', g1.gx !== g0.gx || g1.gy !== g0.gy || g1.tick !== g0.tick, `${g0.gx},${g0.gy},t${g0.tick} -> ${g1.gx},${g1.gy},t${g1.tick}`);

  // ---------- walk to a fork object, interact, bloom ----------
  const reached = await walkObj(page, 'lantern');
  check('legal MOVEs reach the lantern', reached);
  await sleep(400);
  const focus = await page.evaluate(() => window.__et.focus());
  check('scene focuses lantern -> contextual verb buttons', focus === 'lantern' && (await vis(page, '#v-self')) && (await vis(page, '#v-echo')) && (await vis(page, '#v-let')), `focus=${focus}`);
  await page.screenshot({ path: SHOTS + 'shell-07-near-object.png' });
  const e0 = (await st(page)).events;
  await page.keyboard.press('e'); await sleep(120);
  let bloomed = await page.evaluate(() => document.getElementById('bloom').classList.contains('on'));
  let s2 = await st(page);
  const keyWorked = s2.events > e0;
  check('E key at focused fork interacts (fork resolves)', keyWorked, `events ${e0}->${s2.events}`);
  if (!keyWorked) { // fall back to the same legal command so the rest of the flow is still exercised
    await page.evaluate(() => window.__et.send({ type: 'INTERACT', objectId: 'lantern', choice: 'LET_GO' })); await sleep(120);
    bloomed = await page.evaluate(() => document.getElementById('bloom').classList.contains('on'));
  }
  check('fork -> dusty pink bloom class applied', bloomed);
  const bg = await page.evaluate(() => getComputedStyle(document.getElementById('bloom')).boxShadow);
  check('bloom is a pink inset box-shadow', bg.includes('inset') && bg.includes('232, 160, 180'), bg);
  await page.screenshot({ path: SHOTS + 'shell-08-bloom.png' });
  await sleep(900);
  check('bloom clears after <1s', !(await page.evaluate(() => document.getElementById('bloom').classList.contains('on'))));
  const capTxt = await page.evaluate(() => [...document.querySelectorAll('#caps .cap')].map(c => c.textContent));
  check('transient caption shown after fork', capTxt.length > 0, capTxt.join(' / ').slice(0, 100));
  await sleep(5200);
  check('captions fade away', (await page.evaluate(() => document.querySelectorAll('#caps .cap').length)) === 0);
  await page.keyboard.press('l'); await sleep(150);
  check('L replays last caption', (await page.evaluate(() => document.querySelectorAll('#caps .cap').length)) === 1);
  await page.keyboard.press('?'); await sleep(150);
  check('help opens', await page.evaluate(() => document.getElementById('help').classList.contains('open')));
  await page.keyboard.press('Escape');

  // ---------- reduced distortion/motion: static tint ----------
  await page.click('#b-reduce'); await page.evaluate(() => window.__et.shell.bloom()); await sleep(100);
  const red = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('bloom')); return { an: c.animationName, op: c.opacity }; });
  check('reduced distortion: bloom is static tint (no animation)', red.an === 'none' && +red.op > 0, JSON.stringify(red));
  await page.click('#b-reduce');

  // ---------- old save -> offer new game ----------
  const old = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const op = await old.newPage(); op.on('pageerror', e => errors.push('old pageerror: ' + e.message));
  await op.goto(APP); await op.evaluate(() => localStorage.setItem('elsewhere-together-save-v1', JSON.stringify({ version: 1, seed: 1, turn: 5, nodes: {}, player: {}, partner: {} }))); await op.goto(APP);
  await op.waitForSelector('#t-new', { state: 'visible' }); await sleep(300);
  check('old save: notice + NEW GAME offered, Continue hidden', (await vis(op, '#t-stale')) && (await vis(op, '#t-new')) && !(await vis(op, '#t-play')));
  await op.screenshot({ path: SHOTS + 'shell-09-old-save.png' });
  await op.click('#t-new'); await op.waitForSelector('#f-skip');
  check('old save: NEW GAME starts flow', (await screen(op)) === 'facts');
  await old.close();

  // ---------- DEMO: planWin to an ending ----------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await dctx.newPage(); d.on('pageerror', e => errors.push('demo pageerror: ' + e.message));
  await d.goto(APP); await d.evaluate(() => localStorage.clear()); await d.goto(APP);
  await d.waitForSelector('#t-demo'); await d.click('#t-demo'); await sleep(2500);
  check('DEMO starts in play view', (await screen(d)) === 'play');
  const d1 = await st(d); await sleep(2500); const d2 = await st(d);
  check('DEMO advances step by step', d2.tick > d1.tick, `tick ${d1.tick} -> ${d2.tick}`);
  await d.screenshot({ path: SHOTS + 'shell-10-demo-running.png' });
  let ended = false;
  for (let i = 0; i < 300; i++) { await sleep(1000); if ((await screen(d)) === 'ending') { ended = true; break; } }
  const ds = await st(d);
  check('DEMO reaches an ending card', ended, JSON.stringify(ds));
  if (ended) {
    check('demo ending is WIN', ds.ending === 'WIN' && (await d.evaluate(() => document.getElementById('ending').dataset.end)) === 'WIN');
    await d.screenshot({ path: SHOTS + 'shell-11-ending-win.png' });
    await d.click('#e-archive'); await sleep(900);
    check('archive screen open', (await screen(d)) === 'archive');
    const ar = await d.evaluate(() => ({ nodes: document.querySelectorAll('.ar-svg .node').length, chosen: document.querySelectorAll('.ar-svg .node.chosen').length, un: document.querySelectorAll('.ar-svg .node.unchosen').length, pT: document.querySelectorAll('.ar-svg .trail[data-actor=player]').length, qT: document.querySelectorAll('.ar-svg .trail[data-actor=partner]').length, n: Object.keys(window.__et.engine.getState().nodes).length }));
    check('archive renders every node', ar.nodes === ar.n && ar.nodes > 3, JSON.stringify(ar));
    check('archive has chosen and unchosen nodes', ar.chosen > 0 && ar.un > 0, JSON.stringify(ar));
    check('archive has two actor trails', ar.pT > 0 && ar.qT > 0, JSON.stringify(ar));
    const cols = await d.evaluate(() => [document.querySelector('.trail[data-actor=player]')?.getAttribute('stroke'), document.querySelector('.trail[data-actor=partner]')?.getAttribute('stroke')]);
    check('trails coloured amber (me, amber identity) / cyan (partner)', cols[0] === '#e6b66e' && cols[1] === '#7be0df', cols.join());
    await d.screenshot({ path: SHOTS + 'shell-12-archive.png' });
    const nid = await d.evaluate(() => { const g = [...document.querySelectorAll('.ar-svg .node.chosen')].find(n => n.dataset.id !== 'root'); return g?.dataset.id; });
    await d.evaluate((id) => { const g = document.querySelector(`.ar-svg .node[data-id="${id}"]`); const r = g.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 7 }; g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointerup', o)); }, nid);
    await sleep(200);
    const det = await d.textContent('#ar-detail');
    check('click node -> detail (event/cause/effect/who paid)', /CAUSE/.test(det) && /EFFECT/.test(det) && /WHO PAID/.test(det) && /AFTER/.test(det), det.slice(0, 120));
    await d.screenshot({ path: SHOTS + 'shell-13-archive-detail.png' });
    const tr0 = await d.evaluate(() => document.querySelector('.ar-svg .vp').getAttribute('transform'));
    await d.click('[data-a=zin]'); const tr1 = await d.evaluate(() => document.querySelector('.ar-svg .vp').getAttribute('transform'));
    check('zoom button changes transform', tr0 !== tr1);
    await d.mouse.move(500, 400); await d.mouse.wheel(0, -300); const tr2 = await d.evaluate(() => document.querySelector('.ar-svg .vp').getAttribute('transform'));
    check('wheel zoom', tr2 !== tr1);
    await d.mouse.move(500, 400); await d.mouse.down(); await d.mouse.move(560, 440, { steps: 4 }); await d.mouse.up();
    const tr3 = await d.evaluate(() => document.querySelector('.ar-svg .vp').getAttribute('transform'));
    check('drag pans', tr3 !== tr2);
    await d.click('[data-a=focus]'); await sleep(200);
    check('focus my path dims others', await d.evaluate(() => document.querySelector('.ar-svg').classList.contains('focus-me')));
    await d.screenshot({ path: SHOTS + 'shell-14-archive-focus.png' });
    await d.click('[data-a=restart]'); await sleep(600);
    const rs = await st(d);
    check('restart -> intro, fresh state', (await screen(d)) === 'intro' && rs.tick === 0 && rs.events === 0, JSON.stringify(rs));
  }

  // ---------- FADE ending card (distinct) ----------
  await page.evaluate(() => { const s = structuredClone(window.__et.engine.getState()); s.v2.ending = 'FADE'; s.phase = 'FADE'; window.__et.shell.showEnding(s); });
  await sleep(300);
  check('FADE ending text differs from WIN', (await page.textContent('#e-title')).includes('FADED') && (await page.evaluate(() => document.getElementById('ending').dataset.end)) === 'FADE');
  await page.screenshot({ path: SHOTS + 'shell-15-ending-fade.png' });

  // ---------- mobile 360x740 ----------
  const mctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage(); m.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await freshToPlay(m, 'id-amber');
  await m.screenshot({ path: SHOTS + 'shell-20-mobile-identity.png' });
  await m.tap('#id-amber'); await sleep(1200);
  check('mobile: play view', (await screen(m)) === 'play');
  await m.screenshot({ path: SHOTS + 'shell-21-mobile-play.png' });
  const mm = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dp: [...document.querySelectorAll('.dpad button')].map(b => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))), cv: document.querySelector('canvas').getBoundingClientRect().width }));
  check('mobile: no horizontal overflow', mm.sw <= mm.iw, JSON.stringify(mm));
  check('mobile: d-pad buttons >=44px', mm.dp.length === 4 && mm.dp.every(v => v >= 44), mm.dp.join());
  const mp0 = await st(m);
  await m.evaluate(() => { const b = document.querySelector('.dpad [data-d=right]'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })); });
  await sleep(500);
  await m.evaluate(() => { const b = document.querySelector('.dpad [data-d=right]'); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); });
  const mp1 = await st(m);
  check('mobile: d-pad moves player', mp1.gx !== mp0.gx || mp1.gy !== mp0.gy || mp1.tick !== mp0.tick, `${mp0.gx},${mp0.gy} -> ${mp1.gx},${mp1.gy}`);
  await m.evaluate(() => window.__et.shell.setVerbs('fork', 'LANTERN')); await sleep(100);
  const vb = await m.evaluate(() => ['#v-self', '#v-echo', '#v-let'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.right), Math.round(r.bottom)]; }));
  check('mobile: verb buttons >=44px and on screen', vb.every(([w, h, r, b]) => w >= 44 && h >= 44 && r <= 360 && b <= 740), JSON.stringify(vb));
  await m.screenshot({ path: SHOTS + 'shell-22-mobile-verbs.png' });
  await m.evaluate(() => window.__et.shell.setVerbs(null));
  // mobile archive: finish via the planner on this engine
  await m.evaluate(async () => { const E = window.__et; const plan = E.planWin(); for (const c of plan) { E.send(c); if (E.engine.getState().v2.ending) break; } });
  await sleep(6500);
  const ms = await screen(m);
  check('mobile: ending reached via planWin commands', ms === 'ending', ms);
  if (ms === 'ending') {
    await m.screenshot({ path: SHOTS + 'shell-23-mobile-ending.png' });
    await m.tap('#e-archive'); await sleep(800);
    const ma = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, n: document.querySelectorAll('.ar-svg .node').length, btn: [...document.querySelectorAll('.ar-tools button')].map(b => Math.round(b.getBoundingClientRect().height)) }));
    check('mobile archive: nodes + no overflow + tools >=44px', ma.n > 3 && ma.sw <= ma.iw && ma.btn.every(h => h >= 44), JSON.stringify(ma));
    await m.screenshot({ path: SHOTS + 'shell-24-mobile-archive.png' });
  }
  await mctx.close();
  await browser.close();
} catch (err) { console.log('SCRIPT ERROR', err); results.push({ name: 'script', ok: false }); }
finally {
  srv.kill();
  console.log('\nbrowser errors:', errors.length ? errors : 'none');
  const bad = results.filter(r => !r.ok); console.log(`\n${results.length - bad.length}/${results.length} passed`); if (bad.length) console.log('FAILED:', bad.map(b => b.name));
  process.exit(bad.length ? 1 : 0);
}
