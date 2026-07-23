import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  entry: ['scripts/run-benchmark-stack.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'es2022'
});
