// BMFont text (.fnt) -> BMFont XML. Phaser's bitmapFont loader parses XML/JSON only, so the text .fnt files from the font pack fail to load.
// Usage: node scripts/fnt_to_xml.mjs public/assets/dc/fonts/*.fnt   (rewrites in place; skips files that are already XML)
import fs from 'node:fs';
const q = v => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
for (const f of process.argv.slice(2)) {
  const txt = fs.readFileSync(f, 'utf8');
  if (txt.trimStart().startsWith('<')) continue;
  const groups = { info: [], common: [], page: [], char: [], kerning: [] };
  let chars = 0, kerns = 0;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^(\w+)\s*(.*)$/); if (!m || !(m[1] in groups)) { if (m && m[1] === 'chars') chars = Number(/count=(\d+)/.exec(m[2])?.[1] ?? 0); if (m && m[1] === 'kernings') kerns = Number(/count=(\d+)/.exec(m[2])?.[1] ?? 0); continue; }
    const attrs = [...m[2].matchAll(/(\w+)=("[^"]*"|\S+)/g)].map(a => `${a[1]}="${q(a[2].replace(/^"|"$/g, ''))}"`).join(' ');
    groups[m[1]].push(`<${m[1]} ${attrs}/>`);
  }
  const xml = `<?xml version="1.0"?>\n<font>\n${groups.info.join('\n')}\n${groups.common.join('\n')}\n<pages>\n${groups.page.join('\n')}\n</pages>\n<chars count="${chars || groups.char.length}">\n${groups.char.join('\n')}\n</chars>\n<kernings count="${kerns || groups.kerning.length}">\n${groups.kerning.join('\n')}\n</kernings>\n</font>\n`;
  fs.writeFileSync(f, xml);
  console.log('converted', f, groups.char.length, 'chars');
}
