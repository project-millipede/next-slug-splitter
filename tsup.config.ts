import { defineConfig } from 'tsup';

export default defineConfig([
  {
    tsconfig: 'tsconfig.json',
    entry: {
      'module-reference/index': 'src/module-reference/index.ts',
      'next/index': 'src/next/index.ts',
      'next/config': 'src/next/config/index.ts',
      'next/adapter': 'src/next/adapter.ts',
      'next/instrumentation': 'src/next/instrumentation/index.ts',
      'next/lookup': 'src/next/lookup.ts',
      'next/handler': 'src/next/handler-static-props.ts',
      'next/not-found-retry': 'src/next/not-found-retry.ts',
      'next/proxy': 'src/next/proxy/index.ts',
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
  },
  {
    tsconfig: 'tsconfig.json',
    entry: {
      /**
       * Internal worker bundle used by the proxy runtime via child-process
       * spawning.
       *
       * This file is intentionally built into `dist/`, but it is not part of
       * the published `package.json#exports` surface.
       */
      'next/proxy-lazy-worker': 'src/next/proxy/worker/runtime/entry.ts'
    },
    format: ['esm'],
    clean: false,
    dts: false,
    splitting: false,
    treeshake: true,
    sourcemap: false,
    target: 'es2022',
    outDir: 'dist'
  }
]);
