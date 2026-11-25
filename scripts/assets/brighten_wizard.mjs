// Makes the imported wizard sheet lighter and cuter (lilac robe instead of near-black). Run after import_assets.mjs.
import sharp from 'sharp';
import fs from 'node:fs';
const p = 'public/assets/game/wizard/wizard.png';
const buf = fs.readFileSync(p);
const out = await sharp(buf).modulate({ brightness: 2.3, saturation: 1.5, hue: 25 }).png().toBuffer();
fs.writeFileSync(p, out);
console.log('wizard sheet brightened', out.length);
