/**
 * Route handler configuration for the App Router demo.
 *
 * Defines a single catch-all target under the `/docs/` route segment.
 * The configuration tells next-slug-splitter:
 *
 * - Where source MDX/content pages live on disk (`contentDir`).
 * - How the catch-all route parameter is shaped (`handlerRouteParam`).
 * - Where to find the handler processor that maps captured keys to
 *   component imports and a factory import (`handlerBinding`).
 * - Which route-owned contract the light page and generated heavy pages
 *   should both delegate to (`routeContract`).
 * - The preset derives `generatedRootDir`, which later resolves to the
 *   canonical `generated-handlers/` output leaf.
 *
 * Module references use `relativeModule` so the code generator emits
 * import paths relative to the application root, independent of the
 * working directory at build time.
 */

import path from 'node:path';
import process from 'node:process';

import {
  createAppCatchAllRouteHandlersPreset,
  relativeModule
} from 'next-slug-splitter/next';

// ---------------------------------------------------------------------------
// App paths
// ---------------------------------------------------------------------------

const rootDir = process.cwd();

// ---------------------------------------------------------------------------
// Route parameter
// ---------------------------------------------------------------------------

/**
 * Describes the dynamic segment shape for the `/[locale]/docs/[...slug]`
 * catch-all.
 * The `name` must match the parameter name used in the file-system route
 * (`app/[locale]/docs/[...slug]/page.tsx`).
 */
/** @type {import('next-slug-splitter/next').DynamicRouteParam} */
const docsHandlerRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

const localeConfig = {
  locales: ['en', 'de'],
  defaultLocale: 'en'
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** @type {import('next-slug-splitter/next').RouteHandlersConfig} */
export const routeHandlersConfig = {
  routerKind: 'app',
  app: {
    rootDir,
    localeConfig
  },
  targets: [
    createAppCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsHandlerRouteParam,
      contentDir: path.join(rootDir, 'content', 'pages'),
      contentLocaleMode: 'filename',
      routeContract: relativeModule(
        'app/[locale]/docs/[...slug]/route-contract'
      ),
      /**
       * Handler binding — connects generated handler pages to the app's
       * component resolution and rendering pipeline.
       *
       * `processorImport` — module exporting the route handler processor
       * that maps captured keys to component imports and a factory import.
       */
      handlerBinding: {
        processorImport: relativeModule(
          'config-variants/javascript/handler-processor'
        ),
        pageDataCompilerImport: relativeModule(
          'config-variants/javascript/content-compiler.mjs'
        )
      }
    })
  ]
};
