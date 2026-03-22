/**
 * Route handler configuration for the demo.
 *
 * Defines a single catch-all target under the `/docs/` route segment.
 * The configuration tells next-slug-splitter:
 *
 * - Where content pages live on disk (`contentPagesDir`).
 * - How the catch-all route parameter is shaped (`handlerRouteParam`).
 * - Where to find the component registry, the handler processor, and the
 *   runtime factory used by generated handler pages (`handlerBinding`).
 *
 * Module references use `appRelativeModule` so the code generator emits
 * import paths relative to the application root, independent of the
 * working directory at build time.
 */

import path from 'node:path';
import process from 'node:process';

import {
  appRelativeModule,
  createCatchAllRouteHandlersPreset
} from 'next-slug-splitter/next';

// ---------------------------------------------------------------------------
// App paths
// ---------------------------------------------------------------------------

const rootDir = process.cwd();
const nextConfigPath = path.resolve(rootDir, 'next.config.mjs');

// ---------------------------------------------------------------------------
// Route parameter
// ---------------------------------------------------------------------------

/**
 * Describes the dynamic segment shape for the `/docs/[...slug]` catch-all.
 * The `name` must match the parameter name used in the file-system route
 * (`pages/docs/[...slug].tsx`).
 */
/** @type {import('next-slug-splitter/next').DynamicRouteParam} */
const docsHandlerRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** @type {import('next-slug-splitter/next').RouteHandlersConfig} */
export const routeHandlersConfig = {
  app: {
    rootDir,
    nextConfigPath
  },
  targets: [
    createCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsHandlerRouteParam,
      contentPagesDir: path.join(rootDir, 'content', 'pages'),
      contentLocaleMode: 'default-locale',

      /**
       * Handler binding — connects generated handler pages to the app's
       * component resolution and rendering pipeline.
       *
       * - `componentsImport` — module exporting the component registry
       *    (pure metadata, no component code).
       * - `processorImport` — module exporting the route handler processor
       *    that maps captured keys to component imports and a factory variant.
       * - `runtimeFactory.importBase` — base path for factory variant modules
       *    (e.g. `lib/handler-factory/none`).
       */
      handlerBinding: {
        componentsImport: appRelativeModule('component-registry.mjs'),
        processorImport: appRelativeModule('handler-processor'),
        runtimeFactory: {
          importBase: appRelativeModule('lib/handler-factory')
        }
      }
    })
  ]
};
