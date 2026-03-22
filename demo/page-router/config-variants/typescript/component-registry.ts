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
// Types
// ---------------------------------------------------------------------------

/** One entry in the component registry. */
export type ComponentRegistryEntry = {
  /** Relative module path from the project root to the component file. */
  modulePath: string;
  /** Named export from the component module. */
  exportName: string;
};

/** Full registry keyed by the component tag name used in MDX source. */
type ComponentRegistry = Readonly<Record<string, ComponentRegistryEntry>>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const componentRegistry: ComponentRegistry = {
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
