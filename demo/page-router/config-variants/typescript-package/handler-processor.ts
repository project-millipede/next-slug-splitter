/**
 * Route handler processor — package-exports variant (TypeScript).
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy route.
 *
 * Component imports reference the `@demo/components` workspace package
 * directly. Each captured component key already maps to a named export from
 * that package boundary, so this variant does not need a local module-map
 * lookup helper.
 *
 * In a full application (e.g. the millipede app), the processor is more
 * elaborate: it resolves per-component metadata, selects a factory import
 * based on runtime traits (selection, wrapper, none), and attaches metadata
 * to each component entry. This demo uses a simplified version that always
 * selects the `none` factory import.
 *
 * This file is compiled to JavaScript via a `prepare` step
 * (`tsconfig.processor.json`) before the pipeline loads it at runtime.
 */

import {
  defineRouteHandlerProcessor,
  packageModule,
  relativeModule
} from 'next-slug-splitter/next';

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

// Shared package boundary reused for every generated component import.
const componentsModule = packageModule('@demo/components');

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    return {
      factoryImport: relativeModule('lib/handler-factory/none'),
      components: capturedComponentKeys.map(key => ({
        key,
        componentImport: {
          source: componentsModule,
          kind: 'named',
          importedName: key
        }
      }))
    };
  }
});
