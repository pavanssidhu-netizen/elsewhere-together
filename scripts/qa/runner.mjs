// Runner QA: plays the real built game with real key presses (a simple reacting bot), screenshots the special rows
// (moving broken anchors, the decoy anchor before and after it breaks) and the 4-lane layout. Usage: node scripts/qa/runner.mjs [outDir]
import fs from 'node:fs'; import { start, sleep, flowState } from './lib.mjs';
const out = process.argv[2] || '/tmp/runner'; fs.mkdirSync(out, { recursive: true });
const { open, errs, close } = await start();
const p = await open('jump=THREAD_RUNNER&char=SAM&seed=3');
await sleep(2500);
const snap = () => p.evaluate(() => {
  const sc = window.__dc.game.scene.getScene('RunnerScene'); const s = sc.sim; const st = s.state;
  const r = s.rows[st.nextRow]; const r2 = s.rows[st.nextRow + 1];
  const pick = (x) => x && { tick: x.tick, blocked: x.blocked, anchorLane: x.anchorLane, mover: x.mover, trapLane: x.trapLane };
  return { tick: st.tick, lane: st.lane, status: st.status, canMove: s.canMove, hits: st.hits, anchors: st.anchors, r: pick(r), r2: pick(r2), phase: sc.phase };
});
const shots = new Set(); let t0 = Date.now(); let log = [];
while (Date.now() - t0 < 70000) {
  const s = await snap();
  if (s.status !== 'playing' || !s.r) break;
  const r = s.r, tta = r.tick - s.tick;
  const tag = r.mover ? 'mover' : r.trapLane !== undefined ? 'trap' : null;
  if (tag) for (const [k, lo, hi] of [['far', 90, 130], ['mid', 52, 70], ['near', 12, 30]]) { const key = `${tag}-${r.tick}-${k}`; if (tta >= lo && tta <= hi && !shots.has(key) && shots.size < 14) { shots.add(key); await p.screenshot({ path: `${out}/${tag}-${k}-${shots.size}.png` }); } }
  // react like a player: look at the next row (as it looks at tta), dodge blocked lanes, collect anchors
  if (tta < 70 && s.canMove) {
    let blocked = r.blocked, anchor = r.anchorLane;
    if (r.mover) { const p0 = Math.max(0, Math.min(1, (56 + 34 - tta) / 56)); blocked = 1 << Math.round(r.mover.from + (r.mover.to - r.mover.from) * p0); }
    if (r.trapLane !== undefined && tta > 40) { blocked = 0; anchor = r.trapLane; }
    const good = l => !(blocked & (1 << l)) && (anchor < 0 || anchor === l);
    if (!good(s.lane)) { const c = [0, 1, 2, 3].filter(good).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane)); if (c.length) await p.keyboard.press(c[0] > s.lane ? 'ArrowRight' : 'ArrowLeft'); }
  }
  await sleep(25);
}
const end = await snap(); console.log('end', JSON.stringify({ status: end.status, hits: end.hits, anchors: end.anchors, tick: end.tick }), 'shots', [...shots].join(' '));
console.log('flow:', await flowState(p), 'errors:', errs.length ? errs : 'none'); await close();
