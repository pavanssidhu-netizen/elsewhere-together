// Writes public/assets/dc/audio/lines.json from src/dc/content/lines.ts (read by scripts/generate_dc_audio.py).
// Run: npx vite-node scripts/export_dc_lines.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildLinesJson } from './dc_lines_data';

mkdirSync('public/assets/dc/audio', { recursive: true });
writeFileSync('public/assets/dc/audio/lines.json', JSON.stringify(buildLinesJson(), null, 1) + '\n');
console.log('wrote public/assets/dc/audio/lines.json');
