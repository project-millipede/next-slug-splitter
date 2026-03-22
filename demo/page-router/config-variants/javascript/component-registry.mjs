/**
 * Component registry — pure metadata, no actual component imports.
 *
 * This registry maps component keys to their module locations and metadata.
 * It is intentionally decoupled from the actual component implementations
 * so that importing the registry never pulls in component code or ballast.
 *
 * The processor uses this registry to tell next-slug-splitter where each
 * component lives, and the generated handlers import only the specific
 * component files they need.
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see the TypeScript variant for native type definitions)
// ---------------------------------------------------------------------------

/**
 * One entry in the component registry.
 *
 * @typedef {object} ComponentRegistryEntry
 * @property {string} modulePath  — Relative module path from the project root to the component file.
 * @property {string} exportName  — Named export from the component module.
 */

/**
 * Full registry keyed by the component tag name used in MDX source.
 *
 * @typedef {Readonly<Record<string, ComponentRegistryEntry>>} ComponentRegistry
 */

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** @type {ComponentRegistry} */
export const componentRegistry = {
  Counter: {
    modulePath: 'lib/components/counter',
    exportName: 'Counter'
  },
  Chart: {
    modulePath: 'lib/components/chart',
    exportName: 'Chart'
  },
  DataTable: {
    modulePath: 'lib/components/data-table',
    exportName: 'DataTable'
  }
};
