import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    'next-adapter': 'src/next-adapter.ts'
  },
  format: ['esm'],
  platform: 'node',
  target: 'es2022'
});
