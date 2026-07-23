import { defineConfig } from 'tsup';

/**
 * Build the reusable MDX page-data compiler helpers and their worker runtime.
 *
 * `compile-heavy-page-data.ts` spawns `compile-heavy-page-data-worker.js` by
 * sibling filename, so both entries must be emitted into this package's `dist`
 * directory together.
 */
export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    'compile-heavy-page-data': 'src/compile-heavy-page-data.ts',
    'compile-heavy-page-data-worker': 'src/compile-heavy-page-data-worker.ts',
    'heavy-mdx-page-data-compiler': 'src/heavy-mdx-page-data-compiler.ts'
  },
  format: ['esm'],
  outDir: 'dist',
  platform: 'node',
  splitting: false,
  target: 'es2022'
});
