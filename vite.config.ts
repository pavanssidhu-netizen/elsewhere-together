import { defineConfig } from 'vite';
// Phaser is split into its own long-cacheable vendor chunk (no lazy loading); the game chunk stays small.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) } },
  },
  test: { include: ['src/sim/tests/**/*.test.ts', 'src/flow/**/*.test.ts'] },
} as any);
