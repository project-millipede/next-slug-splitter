/**
 * Type declaration for generated ballast modules.
 *
 * The actual file (`flow-composer-ballast.ts`) is created at dev/build time by
 * `pnpm generate:ballast` and is git-ignored. This declaration file ensures
 * TypeScript can resolve the import before generation runs.
 */
import type { BallastRecord } from '../types';

export declare const BALLAST_DATA: Array<BallastRecord>;
