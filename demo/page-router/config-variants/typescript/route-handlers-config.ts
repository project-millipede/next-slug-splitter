/**
 * Route handler configuration for the demo (TypeScript module-map variant).
 *
 * Defines a single catch-all target under the `/docs/` route segment.
 * The processor is a local TypeScript file compiled to JavaScript via
 * the `prepare` step before the pipeline loads it at runtime.
 */

import path from 'node:path';
import process from 'node:process';

import {
  relativeModule,
  createCatchAllRouteHandlersPreset,
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
 * (`pages/docs/[...slug].tsx`).
 */
const docsHandlerRouteParam: DynamicRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const routeHandlersConfig: RouteHandlersConfig = {
  app: {
    rootDir,
    prepare: {
      tsconfigPath: relativeModule(
        'config-variants/typescript/tsconfig.processor.json'
      )
    }
  },
  targets: [
    createCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsHandlerRouteParam,
      contentPagesDir: path.join(rootDir, 'content', 'pages'),
      contentLocaleMode: 'default-locale',

      handlerBinding: {
        // `prepare` compiles the processor into the app-root `dist/` folder.
        // Runtime always loads that compiled artifact, so `processorImport`
        // must stay aligned with the processor tsconfig `outDir`.
        processorImport: relativeModule('dist/handler-processor')
      }
    })
  ]
};
