import { defineConfig } from 'tsup';

/**
 * Build the Node-only ballast generator used by the demo apps.
 *
 * Runtime React components are intentionally exported as source files so Next
 * can own their bundling and route splitting. Only this generator is compiled
 * ahead of time because package scripts should execute plain JavaScript.
 */
export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    generate: 'src/ballast/generate.ts'
  },
  format: ['esm'],
  outDir: 'dist/ballast',
  platform: 'node',
  splitting: false,
  target: 'es2022'
});
