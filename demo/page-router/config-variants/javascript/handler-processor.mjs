/**
 * Route handler processor — module-map variant (JavaScript).
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy route.
 *
 * Component imports are resolved through a module map (`componentRegistry`) —
 * a pure metadata module that maps keys to explicit file paths and export
 * names.
 *
 * In a full application (e.g. the millipede app), the processor is more
 * elaborate: it resolves per-component metadata, selects a factory import
 * based on runtime traits (selection, wrapper, none), and attaches metadata
 * to each component entry. This demo uses a simplified version that always
 * selects the `none` factory import.
 */

import {
  defineRouteHandlerProcessor,
  relativeModule
} from 'next-slug-splitter/next';
import { componentRegistry } from './component-registry.mjs';

// ---------------------------------------------------------------------------
// Types (JSDoc only — see the TypeScript variant for native type definitions)
// ---------------------------------------------------------------------------

/**
 * Resolved component entries for one route-local planning run.
 *
 * Maps each captured component key to its module-map entry, or `undefined`
 * when the key has no matching record.
 *
 * @typedef {Readonly<Record<string, import('./component-registry.mjs').ComponentRegistryEntry | undefined>>} ResolvedComponentMap
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve each captured key against the component module map.
 *
 * @param {readonly string[]} capturedComponentKeys
 * @returns {ResolvedComponentMap}
 */
const resolveComponentsByCapturedKey = capturedComponentKeys => {
  const resolved = {};

  for (const key of capturedComponentKeys) {
    resolved[key] = componentRegistry[key];
  }

  return resolved;
};

/**
 * Build a component import from one module-map entry.
 *
 * @param {import('./component-registry.mjs').ComponentRegistryEntry} entry
 * @returns {import('next-slug-splitter/next').ComponentImportSpec}
 */
const buildComponentImport = entry => ({
  source: relativeModule(entry.modulePath),
  kind: 'named',
  importedName: entry.exportName
});

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * The exported processor implements the `RouteHandlerProcessor` contract.
 *
 * `resolve` produces the final generation plan for one heavy route. This demo
 * still uses a small module-map lookup helper first so it can validate each
 * key before returning component imports and the `none` factory.
 *
 * @type {import('next-slug-splitter/next').RouteHandlerProcessor}
 */
export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    const resolvedEntries = resolveComponentsByCapturedKey(
      capturedComponentKeys
    );

    return {
      factoryImport: relativeModule('lib/handler-factory/none'),
      components: capturedComponentKeys.map(key => {
        const entry = resolvedEntries[key];
        if (entry == null) {
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
