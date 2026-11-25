import { start, sleep } from './qa_lib.mjs';
const { open, errs, close } = await start();
const p = await open('jump=TIME_MASTER_OFFICE&char=SAM');
await sleep(1500);
for (let i = 0; i < 5; i++) { await p.keyboard.press('Space'); await sleep(900); await p.keyboard.press('Space'); await sleep(700); }
await sleep(1500);
await p.screenshot({ path: process.env.OUT || '/tmp/office_after.png' });
console.log('errors:', errs.length ? errs : 'none');
await close();
