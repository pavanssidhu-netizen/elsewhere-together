// Director's Cut asset importer. Copies ONLY the files the game uses from the extracted zips into public/assets/game/,
// resizes the oversized ones with sharp, and writes public/assets/game/manifest.json (source pack, path, licence, transform).
// Usage: node scripts/assets/import_assets.mjs <extracted-root>     (extracted-root = folder holding one folder per zip)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve(process.argv[2] || '/tmp/A');
const OUT = path.resolve('public/assets/game');
fs.mkdirSync(OUT, { recursive: true });

const PACKS = {
  brackeys: { name: "Brackeys' VFX Bundle v1 (flipbook/particle credits: Picster, Kenney, Thomas Iche, CodeManu)", license: 'CC0', url: 'https://brackeysgames.itch.io/brackeys-vfx-bundle', dir: 'brackeys_vfx_bundle/brackeys_vfx_bundle' },
  myconid: { name: 'Myconid animated sprite sheet', license: 'Royalty-free, no redistribution as assets (pack README)', url: '(supplied by creative director)', dir: 'Myconid/Myconid' },
  mushrooms: { name: 'Animated Mushrooms', license: 'No licence file supplied; creative director to confirm', url: '(supplied by creative director)', dir: 'Mushrooms/Mushrooms' },
  wizard: { name: 'Top Down Pixel Art Wizard (GandalfHardcore)', license: 'Commercial use OK; no resale/redistribution of assets; no AI TRAINING or NFT use (we do neither)', url: 'https://gandalfhardcore.itch.io/', dir: 'Top_Down_Pixel_Art_Wizard/Top Down Pixel Art Wizard' },
  office: { name: 'Pixel Office (2dPig)', license: 'CC0', url: 'https://2dpig.itch.io/pixel-office', dir: 'PixelOffice' },
  nasha: { name: "Nasha's Cozy Free Home Starter Kit v1.0", license: 'Use in games OK; no redistribution as assets; no ML training use (we do neither)', url: '(supplied by creative director)', dir: 'Nashas_Cozy_Free_Home_Starter_Kit_v1.0' },
  portals: { name: 'Free Pixel Portals & Runes v1.1.0 (Mira Forge)', license: 'Free for commercial use; no resale/redistribution as assets', url: 'https://miraforge.itch.io', dir: 'free-pixel-portals-and-runes-v1.1.0/Free_Pixel_Portals_and_Runes' },
  void: { name: 'Void Pixel Space Kit Lite v1.0', license: 'Free for commercial use; no redistribution as assets', url: '(supplied by creative director)', dir: 'VoidPixelSpaceKit_Lite_v1.0' },
  spacebg: { name: 'Space Background Pack (blue version)', license: 'See public-license.pdf in pack', url: '(supplied by creative director)', dir: 'space_background_pack/space_background_pack/Assets/Blue Version' },
  runner: { name: 'Space Runner Assets (27-11-20)', license: 'CC0', url: '(supplied by creative director)', dir: 'Space_Runner_Assets_-_27-11-20/Space Runner Assets - 27-11-20' },
  ui: { name: 'Pixel Fantasy UI Pack', license: 'No licence file supplied; creative director to confirm', url: '(supplied by creative director)', dir: 'ui-pack' },
  fonts: { name: 'Pixel Fonts 16x16 Free5', license: 'CC0', url: '(supplied by creative director)', dir: 'PixelFonts16x16_Free5/PixelFonts16x16_Free5' },
};

const manifest = [];
/** job: [pack, srcRelPath, outRelPath, opts?]  opts.resize = {w,h} | opts.scale = 0..1 */
async function put(pack, rel, out, opts = {}) {
  const p = PACKS[pack];
  const from = path.join(SRC, p.dir, rel);
  if (!fs.existsSync(from)) throw new Error('missing ' + from);
  const to = path.join(OUT, out);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  let transform = 'none';
  if (opts.resize || opts.scale) {
    const meta = await sharp(from).metadata();
    const w = opts.resize ? opts.resize.w : Math.round(meta.width * opts.scale);
    const h = opts.resize ? opts.resize.h : Math.round(meta.height * opts.scale);
    await sharp(from).resize(w, h, { fit: 'fill', kernel: opts.kernel || 'lanczos3' }).png({ compressionLevel: 9 }).toFile(to);
    transform = `resized ${meta.width}x${meta.height} -> ${w}x${h}`;
  } else fs.copyFileSync(from, to);
  const m = await sharp(to).metadata().catch(() => ({}));
  manifest.push({ key: out.replace(/\.[a-z]+$/, ''), outputPath: 'assets/game/' + out, pack: p.name, license: p.license, sourceUrl: p.url, sourcePath: rel, width: m.width ?? null, height: m.height ?? null, transform });
}
const ls = (pack, rel) => fs.readdirSync(path.join(SRC, PACKS[pack].dir, rel));

// ---- Brackeys: pre-drawn flipbooks (cells halved to keep the bundle small) + a handful of particle textures
const PRE = { vortex: [6, 5], electric_ring: [6, 5], wavy_blue: [6, 5], wavy_purple: [6, 5], charge: [7, 6], explosion: [6, 5], star_explosion: [6, 5], big_hit: [6, 5], impact_white: [6, 4], lightstreaks: [6, 5] };
for (const [n, [c, r]] of Object.entries(PRE)) {
  const f = `${n}_${c}x${r}.png`;
  const meta = await sharp(path.join(SRC, PACKS.brackeys.dir, 'predrawn', f)).metadata();
  const cw = Math.floor(meta.width / c / 2), ch = Math.floor(meta.height / r / 2);
  await put('brackeys', `predrawn/${f}`, `vfx/${n}.png`, { resize: { w: cw * c, h: ch * r } });
  manifest[manifest.length - 1].frame = { cols: c, rows: r, w: cw, h: ch, frames: c * r };
}
for (const n of ['circle_05', 'light_01', 'light_02', 'flare_01', 'magic_02', 'magic_05', 'spark_03', 'spark_05', 'star_01', 'star_04', 'smoke_08', 'twirl_01']) {
  if (fs.existsSync(path.join(SRC, PACKS.brackeys.dir, 'particles/alpha', n + '_a.png'))) await put('brackeys', `particles/alpha/${n}_a.png`, `vfx/p_${n}.png`);
}

// ---- Characters
for (const c of ['red', 'blue', 'green', 'purple']) await put('myconid', `myconid_${c}_outline.png`, `myconid/${c}.png`);
fs.copyFileSync(path.join(SRC, PACKS.myconid.dir, 'myconid.json'), path.join(OUT, 'myconid/myconid.json'));
for (const c of ['Blue', 'Pink', 'Red']) await put('mushrooms', `AnimatedMushroom${c}.png`, `mushrooms/${c.toLowerCase()}.png`);
await put('wizard', 'Wizard sheet.png', 'wizard/wizard.png');

// ---- Office
await put('office', 'PixelOffice.png', 'office/office.png');
await put('office', 'PixelOfficeAssets.png', 'office/office_assets.png');
for (const f of ['round_wall_clock', 'tiny_cuckoo_clock', 'tall_bookshelf_with_books', 'floor_lamp', 'potted_fern', 'framed_photo', 'candle_lantern']) {
  const rel = fs.existsSync(path.join(SRC, PACKS.nasha.dir, 'sprites/decor', f + '.png')) ? `sprites/decor/${f}.png` : `sprites/living_room/${f}.png`;
  await put('nasha', rel, `home/${f}.png`);
}
for (const f of ['tall_bookshelf_with_books', 'floor_lamp', 'potted_fern', 'armchair', 'stack_of_books', 'coffee_mug', 'low_coffee_table', 'large_patterned_rug']) {
  const rel = ['decor', 'living_room', 'kitchen', 'bedroom'].map(d => `sprites/${d}/${f}.png`).find(r => fs.existsSync(path.join(SRC, PACKS.nasha.dir, r)));
  if (rel) await put('nasha', rel, `home/${f}.png`).catch(() => {});
}
for (const f of ['wood_planks_light', 'parquet_basketweave', 'red_and_cream_checker', 'wallpaper_cream_stripes', 'wallpaper_sage_stripes', 'cream_plaster_wall']) {
  const rel = ['floors', 'walls'].map(d => `tiles/${d}/${f}.png`).find(r => fs.existsSync(path.join(SRC, PACKS.nasha.dir, r)));
  if (rel) await put('nasha', rel, `tiles/${f}.png`);
}

// ---- Forest (Nasha garden kit): tiles + objects
for (const f of ['front_lawn', 'garden_gravel_path', 'flower_bed_soil']) await put('nasha', `tiles/floors/${f}.png`, `tiles/${f}.png`);
for (const d of ls('nasha', 'tiles/transitions')) for (const f of ls('nasha', 'tiles/transitions/' + d)) if (f.endsWith('.png')) await put('nasha', `tiles/transitions/${d}/${f}`, `tiles/transitions/${d}/${f}`);
for (const f of ls('nasha', 'sprites/garden_and_outside')) if (f.endsWith('.png')) await put('nasha', `sprites/garden_and_outside/${f}`, `garden/${f}`);

// ---- Portals & runes (cyan "tide" theme + purple arcane for the split)
const P = 'effects';
for (const [theme, folder] of [['tide', '04_tide_portal'], ['arcane', '01_arcane_portal']]) for (const a of ['open', 'idle', 'close']) await put('portals', `${P}/${folder}/128x128/${theme}_portal_128x128_${a}_strip.png`, `portals/${theme}_${a}.png`);
await put('portals', `${P}/08_tide_rune_circle/64x64/tide_rune_circle_64x64_sheet.png`, 'portals/tide_rune_circle.png');
await put('portals', `${P}/12_tide_teleport/64x64/tide_teleport_64x64_sheet.png`, 'portals/tide_teleport.png');
await put('portals', `${P}/11_ember_teleport/64x64/ember_teleport_64x64_sheet.png`, 'portals/ember_teleport.png');
await put('portals', `${P}/09_arcane_teleport/64x64/arcane_teleport_64x64_sheet.png`, 'portals/arcane_teleport.png');
for (const d of fs.readdirSync(path.join(SRC, PACKS.portals.dir, 'glyphs/16_tide_runes'))) {
  const full = path.join(SRC, PACKS.portals.dir, 'glyphs/16_tide_runes', d);
  if (fs.statSync(full).isDirectory()) for (const f of fs.readdirSync(full)) if (f.endsWith('sheet.png') || f.endsWith('strip.png')) { await put('portals', `glyphs/16_tide_runes/${d}/${f}`, `runes/${d}_${f}`); break; }
  else if (d.endsWith('.png') && /64/.test(d)) await put('portals', `glyphs/16_tide_runes/${d}`, `runes/${d}`);
}

// ---- Space
for (const f of ['blue-back', 'blue-stars', 'prop-planet-big', 'prop-planet-small', 'asteroid-1', 'asteroid-2']) await put('spacebg', `layered/${f}.png`, `space/${f}.png`);
for (const f of ['starfield_white_far', 'starfield_white_mid', 'starfield_white_near']) await put('void', `backgrounds/starfield/${f}.png`, `space/${f}.png`);
await put('void', 'backgrounds/nebula/nebula_violet.png', 'space/nebula_violet.png');
for (const f of ['cratered_moon_64', 'gas_giant_64', 'terran_64']) await put('void', `planets/${f}.png`, `space/${f}.png`);
for (const f of ['Other sprites/Diamond', 'Other sprites/GlassShards', 'Other sprites/RockShards', 'Effects/sparkle-effect']) await put('runner', `${f}.png`, `runner/${f.split('/')[1]}.png`);

// ---- UI + fonts (UI art is 2736x912: scale to a third)
await put('ui', 'misc/dialog-box.png', 'ui/dialog-box.png', { scale: 0.3 });
await put('ui', 'buttons/button-normal.png', 'ui/button-normal.png', { scale: 0.25 });
await put('ui', 'buttons/button-hover.png', 'ui/button-hover.png', { scale: 0.25 });
await put('ui', 'buttons/button-pressed.png', 'ui/button-pressed.png', { scale: 0.25 });
await put('ui', 'panels/panel-frame.png', 'ui/panel-frame.png', { scale: 0.3 });
for (const f of ['Aurora16-Smooth', 'Jelly16-Regular', 'Pepper16-Bold', 'Karma16-Regular']) for (const ext of ['png', 'fnt']) {
  const rel = `Bitmap/${f}/${f}.${ext}`;
  if (ext === 'png') await put('fonts', rel, `fonts/${f}.png`);
  else { fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true }); fs.copyFileSync(path.join(SRC, PACKS.fonts.dir, rel), path.join(OUT, 'fonts', `${f}.fnt`)); }
}

import { execFileSync } from 'node:child_process';
execFileSync('node', ['scripts/assets/fnt_to_xml.mjs', ...fs.readdirSync(path.join(OUT, 'fonts')).filter(f => f.endsWith('.fnt')).map(f => path.join(OUT, 'fonts', f))], { stdio: 'inherit' });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
let bytes = 0; for (const m of manifest) bytes += fs.statSync(path.join('public', m.outputPath)).size;
console.log(manifest.length, 'files imported,', (bytes / 1e6).toFixed(1), 'MB');

// ---- ADD:CUT1 (agent CUT-1 may add `await put(...)` lines here)
// ---- ADD:CUT2 (agent CUT-2 may add `await put(...)` lines here)
for (const f of ['barrel_of_pickles', 'bowl_of_cake_batter']) await put('nasha', `sprites/food/${f}.png`, `food/${f}.png`);
for (const f of ['whistling_tea_kettle', 'tall_milk_churn', 'bread_bin', 'kitchen_counter_with_a_four_burner_stove_top', 'small_round_wooden_table']) await put('nasha', `sprites/kitchen/${f}.png`, `kitchen/${f}.png`);
// ---- ADD:FOREST (agent FOREST may add `await put(...)` lines here)
// ---- ADD:RUNNER (agent RUNNER may add `await put(...)` lines here)

// ---- generate the typed registry the Phaser BootScene loads from
const SHEET_SIZES = [
  [/^myconid\/(red|blue|green|purple)$/, 64, 64], [/^mushrooms\//, 128, 128], [/^wizard\/wizard$/, 48, 48],
  [/^portals\/(tide|arcane)_(open|idle|close)$/, 128, 128], [/^portals\/.*(rune_circle|teleport)$/, 64, 64], [/^runes\/64x64_/, 64, 64], [/^runes\/32x32_/, 32, 32],
];
const images = [], sheets = [], seen = new Set();
for (const m of manifest) {
  if (seen.has(m.key)) continue; seen.add(m.key);
  if (m.key.startsWith('fonts/')) continue;
  if (m.frame) { sheets.push({ key: m.key, url: m.outputPath, fw: m.frame.w, fh: m.frame.h }); continue; }
  const sh = SHEET_SIZES.find(([re]) => re.test(m.key));
  if (sh) sheets.push({ key: m.key, url: m.outputPath, fw: sh[1], fh: sh[2] });
  else images.push({ key: m.key, url: m.outputPath });
}
const fonts = ['Aurora16-Smooth', 'Jelly16-Regular', 'Pepper16-Bold', 'Karma16-Regular'].map(f => ({ key: 'fonts/' + f, png: `assets/game/fonts/${f}.png`, fnt: `assets/game/fonts/${f}.fnt` }));
fs.writeFileSync('src/game/assets.generated.ts', `// GENERATED by scripts/assets/import_assets.mjs. Do not edit. Texture key = manifest key (e.g. 'myconid/red').\n` +
  `export const DC_IMAGES: { key: string; url: string }[] = ${JSON.stringify(images)};\n` +
  `export const DC_SHEETS: { key: string; url: string; fw: number; fh: number }[] = ${JSON.stringify(sheets)};\n` +
  `export const DC_FONTS: { key: string; png: string; fnt: string }[] = ${JSON.stringify(fonts)};\n`);
console.log('registry:', images.length, 'images,', sheets.length, 'sheets,', fonts.length, 'fonts');
