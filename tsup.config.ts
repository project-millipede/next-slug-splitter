import { defineConfig } from 'tsup';

export default defineConfig({
  tsconfig: 'tsconfig.json',
  entry: {
    'next/index': 'src/next/index.ts',
    'next/config': 'src/next/config/index.ts',
    'next/adapter': 'src/next/adapter.ts',
    'next/lookup': 'src/next/lookup.ts',
    cli: 'src/cli/index.ts'
  },
  format: ['esm'],
  dts: {
    compilerOptions: {
      removeComments: true
    }
  },
  clean: true,
  splitting: false,
  treeshake: true,
  sourcemap: false,
  target: 'es2022',
  outDir: 'dist'
});
