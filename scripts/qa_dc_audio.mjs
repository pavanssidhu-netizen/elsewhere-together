// Headless Chromium QA for src/dc/audio (no sound can be heard; this checks errors + analyser levels). Node 22, no deps.
// Usage: node scripts/qa_dc_audio.mjs   (starts its own vite on :5199 and chrome on :9333, then stops both)
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';

const CHROME = (() => {
  const base = homedir() + '/.cache/ms-playwright/';
  const d = readdirSync(base).find(n => n.startsWith('chromium-') && !n.includes('headless'));
  return base + d + '/chrome-linux64/chrome';
})();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=/tmp/dcaudio-qa-profile', '--autoplay-policy=document-user-activation-required', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { vite.kill(); chrome.kill(); };
process.on('exit', cleanup);

let ws, id = 0; const pending = new Map(); const problems = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
};
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(250); } }
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5199/')).ok) break; } catch { await sleep(250); } }
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) problems.push('console.' + d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/404|Failed to load resource/.test(d.params.entry.text + '')) problems.push('log: ' + d.params.entry.text);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Page.navigate', { url: 'http://localhost:5199/src/dc/audio/qa/qa.html' });
  await sleep(3000);
  const out = {};
  out.beforeUnlock = await ev(`(async()=>{const q=__qa;q.audio.playMusic('cosmic');q.audio.playSfx('beep');await q.audio.playVoice('jensen_hmm');return q.debug().ctxState})()`);
  // real user gesture
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 60, y: 120, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 60, y: 120, button: 'left', clickCount: 1 });
  await sleep(1200);
  out.afterUnlock = await ev(`__qa.debug()`);
  await sleep(2500); out.cosmicPeak = await ev(`__qa.peak(2000)`);
  // every music id with crossfade, same-id no-op
  out.music = {};
  for (const id of ['forest', 'final_minute', 'office', 'runner', 'reunion', 'cosmic']) {
    await ev(`__qa.audio.playMusic('${id}',{fadeMs:800}); __qa.audio.playMusic('${id}'); 0`);
    await sleep(1400);
    out.music[id] = { peak: await ev(`__qa.peak(800)`), dbg: await ev(`(()=>{const d=__qa.debug();return d.musicId+':'+d.musicBacking})()`) };
  }
  // stress
  const base = await ev(`__qa.peak(600)`);
  await ev(`__qa.audio.setBondStress(1);0`); await sleep(1200);
  const stressed = await ev(`__qa.peak(600)`);
  await ev(`__qa.audio.setBondStress(0);0`); await sleep(1200);
  out.stress = { base, stressed, restored: await ev(`__qa.peak(600)`) };
  // voice: duration scaling + skip + replace
  out.voice = await ev(`(async()=>{const a=__qa.audio,r={};const dur=async id=>{const t=performance.now();await a.playVoice(id);return Math.round(performance.now()-t)};
    r.oh=await dur('tm_intro_4'); r.long=await dur('tm_intro_2'); r.unknown=await dur('nope');
    const p=a.playVoice('tm_intro_8'); await new Promise(x=>setTimeout(x,300)); r.voicePeak=await __qa.peak(200); const t=performance.now(); a.skipVoice(); await p; r.skipMs=Math.round(performance.now()-t);
    const p1=a.playVoice('tm_intro_8'); await new Promise(x=>setTimeout(x,200)); const t2=performance.now(); const p2=a.playVoice('sam_hmm'); await p1; r.replacedMs=Math.round(performance.now()-t2); await p2;
    return r})()`);
  // each line renders without error and each sfx
  out.allVoices = await ev(`(async()=>{let n=0;for(const l of __qa.LINES){const p=__qa.audio.playVoice(l.id);await new Promise(x=>setTimeout(x,40));__qa.audio.skipVoice();await p;n++}return n})()`);
  out.sfx = {};
  for (const s of await ev(`__qa.SFX_IDS`)) { await ev(`__qa.audio.playSfx('${s}');0`); out.sfx[s] = +(await ev(`__qa.peak(250)`)).toFixed(3); await sleep(200); }
  // mute
  await ev(`__qa.audio.setMuted(true);0`); await sleep(300);
  out.mutedPeak = await ev(`(async()=>{__qa.audio.playSfx('cosmic_boom');return __qa.peak(500)})()`);
  await ev(`__qa.audio.setMuted(false);0`); await sleep(300);
  out.unmutedPeak = await ev(`(async()=>{__qa.audio.playSfx('cosmic_boom');return __qa.peak(500)})()`);
  await ev(`__qa.audio.stopMusic(300);0`); await sleep(800);
  out.afterStop = await ev(`(async()=>__qa.peak(400))()`);
  out.requested = await ev(`__qa.debug().requested`);
  out.problems = problems;
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.log('QA FAILED', e.message, problems); process.exitCode = 1; } finally { cleanup(); }
process.exit(process.exitCode ?? 0);
