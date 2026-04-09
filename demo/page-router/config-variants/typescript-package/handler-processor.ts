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
 * This variant demonstrates inline per-entry metadata. The processor keeps a
 * small keyed metadata map locally and attaches the matching JSON metadata
 * object to each returned component entry.
 *
 * The demo uses one small runtime-aware factory that reads the emitted
 * metadata at render time. This keeps the runtime-trait example visible
 * without introducing a separate app-specific runtime split into the demo.
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
const metadataByKey: Readonly<
  Partial<Record<string, { runtimeTraits: string[] }>>
> = {
  Chart: {
    runtimeTraits: ['wrapper']
  },
  Counter: {
    runtimeTraits: ['wrapper', 'selection']
  },
  DataTable: {
    runtimeTraits: ['selection']
  }
};

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    return {
      factoryImport: relativeModule('lib/handler-factory/runtime'),
      components: capturedComponentKeys.map(key => ({
        key,
        componentImport: {
          source: componentsModule,
          kind: 'named',
          importedName: key
        },
        ...(metadataByKey[key] == null ? {} : { metadata: metadataByKey[key] })
      }))
    };
  }
});
