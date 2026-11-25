// Writes public/assets/game/audio/lines.json from src/game/content/lines.ts (read by scripts/audio/generate_audio.py).
// Run: npx vite-node scripts/audio/export_lines.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildLinesJson } from './lines_data';

mkdirSync('public/assets/game/audio', { recursive: true });
writeFileSync('public/assets/game/audio/lines.json', JSON.stringify(buildLinesJson(), null, 1) + '\n');
console.log('wrote public/assets/game/audio/lines.json');
