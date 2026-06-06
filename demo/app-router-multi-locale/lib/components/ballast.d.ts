/**
 * Type declarations for generated ballast modules.
 *
 * The actual files (*-ballast.ts) are created at dev/build time by
 * `scripts/generate-ballast.mjs` and are git-ignored. This declaration
 * file ensures TypeScript can resolve the imports before generation runs.
 */

declare module './counter-ballast' {
  export const BALLAST_DATA: Array<{ id: number; k: string; v: string; d: string }>;
}

declare module './chart-ballast' {
  export const BALLAST_DATA: Array<{ id: number; k: string; v: string; d: string }>;
}

declare module './data-table-ballast' {
  export const BALLAST_DATA: Array<{ id: number; k: string; v: string; d: string }>;
}
