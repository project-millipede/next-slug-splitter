/**
 * Route handler configuration for the App Router demo (TypeScript variant).
 *
 * Defines a single catch-all target under the `/docs/` route segment.
 * The processor is a local TypeScript file compiled to JavaScript via
 * the `prepare` step before the pipeline loads it at runtime. The preset
 * derives `generatedRootDir`, which later resolves to the canonical
 * `generated-handlers/` output leaf.
 */

import path from 'node:path';
import process from 'node:process';

import {
  createAppCatchAllRouteHandlersPreset,
  relativeModule,
  type DynamicRouteParam,
  type RouteHandlersConfig
} from 'next-slug-splitter/next';

// ---------------------------------------------------------------------------
// App paths
// ---------------------------------------------------------------------------

const rootDir = process.cwd();

// ---------------------------------------------------------------------------
// Route parameter
// ---------------------------------------------------------------------------

/**
 * Describes the dynamic segment shape for the `/docs/[...slug]` catch-all.
 * The `name` must match the parameter name used in the file-system route
 * (`app/docs/[...slug]/page.tsx`).
 */
const docsHandlerRouteParam: DynamicRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const routeHandlersConfig: RouteHandlersConfig = {
  routerKind: 'app',
  app: {
    rootDir,
    prepare: {
      tsconfigPath: relativeModule(
        'config-variants/typescript/tsconfig.processor.json'
      )
    }
  },
  targets: [
    createAppCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsHandlerRouteParam,
      contentDir: path.join(rootDir, 'content', 'pages'),
      contentLocaleMode: 'default-locale',
      /**
       * Preferred App Router contract:
       * the route folder owns one authored `route-contract.ts`, and both the
       * public page and generated heavy handlers delegate to it directly.
       */
      routeContract: relativeModule('app/docs/[...slug]/route-contract'),
      handlerBinding: {
        // `prepare` compiles the processor into the app-root `dist/` folder.
        // Runtime always loads prepared JavaScript artifacts, so both module
        // references must stay aligned with the prepare-step tsconfig `outDir`.
        processorImport: relativeModule('dist/handler-processor'),
        pageDataCompilerImport: relativeModule('dist/content-compiler')
      }
    })
  ]
};
