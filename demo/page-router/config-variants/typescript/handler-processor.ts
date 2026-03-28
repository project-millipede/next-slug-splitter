/**
 * Route handler processor — module-map variant (TypeScript).
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy route.
 *
 * Component imports are resolved through a module map (`componentRegistry`)
 * that maps keys to explicit file paths and export names.
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
  relativeModule,
  type ComponentImportSpec
} from 'next-slug-splitter/next';

import {
  componentRegistry,
  type ComponentRegistryEntry
} from './component-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resolved component entries for one route-local planning run.
 *
 * Maps each captured component key to its module-map entry, or `undefined`
 * when the key has no matching record.
 */
type ResolvedComponentMap = Readonly<
  Record<string, ComponentRegistryEntry | undefined>
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve each captured key against the component module map.
 */
const resolveComponentsByCapturedKey = (
  capturedComponentKeys: readonly string[]
): ResolvedComponentMap => {
  const resolved: Record<string, ComponentRegistryEntry | undefined> = {};

  for (const key of capturedComponentKeys) {
    resolved[key] = componentRegistry[key];
  }

  return resolved;
};

/**
 * Build a component import from one module-map entry.
 */
const buildComponentImport = (
  entry: ComponentRegistryEntry
): ComponentImportSpec => ({
  source: relativeModule(entry.modulePath),
  kind: 'named',
  importedName: entry.exportName
});

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    const resolvedEntries = resolveComponentsByCapturedKey(
      capturedComponentKeys
    );

    return {
      factoryImport: relativeModule('lib/handler-factory/none'),
      components: capturedComponentKeys.map(key => {
        const entry = resolvedEntries[key];
        if (!entry) {
          throw new Error(
            `Unknown component key "${key}" — not found in module map.`
          );
        }

        return {
          key,
          componentImport: buildComponentImport(entry)
        };
      })
    };
  }
});
