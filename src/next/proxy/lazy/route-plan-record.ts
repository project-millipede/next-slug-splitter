import { captureRouteHandlerComponentGraph } from '../../../core/capture';
import { sortStringArray } from '../../../core/discovery';
import type { LocalizedRoutePath } from '../../../core/types';
import {
  isObjectRecordOf,
  isStringArray,
  readObjectProperty
} from '../../../utils/type-guards-custom';

import type { RouteHandlerLazyPlannerConfig } from './types';

/**
 * Stage 1 persisted record helpers for lazy single-route reuse.
 *
 * @remarks
 * This module intentionally keeps two closely related responsibilities
 * together:
 * - persist only MDX-capture facts needed for Stage 1 reuse
 * - reconstruct full in-memory heavy-route plans from cached component keys
 *
 * The persisted record is deliberately smaller than `PlannedHeavyRoute`. It
 * stores only the route-derived capture facts that let the lazy path skip MDX
 * analysis when the root entry file and all persisted transitive MDX module
 * paths remain unchanged.
 */

/**
 * Version number for persisted Stage 1 route-capture records.
 */
const ROUTE_CAPTURE_RECORD_VERSION = 5;

/**
 * Persisted Stage 1 capture facts for one localized route file.
 *
 * @remarks
 * The root entry file is always `routePath.filePath` and is intentionally not
 * duplicated here. `transitiveModulePaths` therefore contains only non-root
 * reachable MDX module paths discovered during capture. Stage 1 validity must
 * always validate the root entry file separately before validating each
 * persisted transitive module path.
 */
export type PersistedRouteCaptureRecord = {
  /**
   * App-owned schema version for this persisted record.
   */
  version: number;
  /**
   * Sorted custom component names captured from the reachable MDX graph.
   *
   * Stage 1 predates processor-level filtering and keeps this persisted field
   * name for cache compatibility. The values are captured before processor
   * filtering runs.
   *
   * Cached here:
   * Every custom component name found during MDX capture, including names that
   * the processor may later omit from generated handler emission.
   *
   * Not cached here:
   * 1. processor-selected component entries emitted into generated handlers.
   * 2. the final heavy/light route classification after processor filtering.
   *
   * Example: a page using `<Callout />` and `<Chart />` stores both names here,
   * even if only `Chart` is later emitted into a generated handler.
   */
  usedLoadableComponentKeys: Array<string>;
  /**
   * Sorted non-root reachable MDX module paths discovered during capture.
   *
   * @remarks
   * This array must never contain the root entry file path. The root entry
   * file is always known separately as `routePath.filePath` and is validated
   * separately from these transitive module paths.
   */
  transitiveModulePaths: Array<string>;
};

/**
 * Normalize one unordered string array into a sorted unique list.
 *
 * @param values - Candidate string values to normalize.
 * @returns Sorted unique string values.
 */
const normalizeSortedUniqueStrings = (values: Array<string>): Array<string> =>
  sortStringArray(Array.from(new Set(values)));

/**
 * Normalize one route's persisted transitive MDX module paths.
 *
 * @remarks
 * The root entry path is filtered here even though the capture seam already
 * excludes it. That keeps the root-versus-transitive separation enforced at
 * the persistence boundary rather than relying only on capture internals.
 *
 * @param entryFilePath - Absolute path to the root entry MDX file.
 * @param transitiveModulePaths - Candidate non-root module paths discovered
 * during capture.
 * @returns Sorted unique non-root transitive module paths.
 */
const normalizePersistedTransitiveModulePaths = (
  entryFilePath: string,
  transitiveModulePaths: Array<string>
): Array<string> =>
  normalizeSortedUniqueStrings(
    transitiveModulePaths.filter(
      transitiveModulePath => transitiveModulePath !== entryFilePath
    )
  );

/**
 * Read and validate one persisted Stage 1 route-capture record.
 *
 * @remarks
 * Persisted metadata must be self-healing. If old on-disk data no longer
 * matches the current Stage 1 record shape, callers treat that value as a
 * cache miss and recompute rather than trusting malformed state.
 *
 * @param value - Candidate persisted metadata value.
 * @returns Valid Stage 1 capture record when the value matches the expected
 * shape, otherwise `null`.
 */
export const readPersistedRouteCaptureRecord = (
  value: unknown
): PersistedRouteCaptureRecord | null => {
  if (!isObjectRecordOf<PersistedRouteCaptureRecord>(value)) {
    return null;
  }

  const version = readObjectProperty(value, 'version');
  const usedLoadableComponentKeys = readObjectProperty(
    value,
    'usedLoadableComponentKeys'
  );
  const transitiveModulePaths = readObjectProperty(
    value,
    'transitiveModulePaths'
  );

  if (version !== ROUTE_CAPTURE_RECORD_VERSION) {
    return null;
  }

  if (!isStringArray(usedLoadableComponentKeys)) {
    return null;
  }

  if (!isStringArray(transitiveModulePaths)) {
    return null;
  }

  return {
    version: ROUTE_CAPTURE_RECORD_VERSION,
    usedLoadableComponentKeys: normalizeSortedUniqueStrings(
      usedLoadableComponentKeys
    ),
    transitiveModulePaths: normalizeSortedUniqueStrings(transitiveModulePaths)
  };
};

/**
 * Create one persisted Stage 1 route-capture record for a localized route
 * file.
 *
 * @remarks
 * This helper performs only MDX capture work. It intentionally does not
 * perform heavy-route processor planning, because Stage 1 reuse persists only
 * the capture facts needed to skip MDX analysis on later valid hits.
 *
 * @param routePath - Localized route file to capture.
 * @param config - Fully resolved target config used for route capture.
 * @returns Persisted Stage 1 route-capture record.
 */
export const createPersistedRouteCaptureRecord = async (
  routePath: LocalizedRoutePath,
  config: RouteHandlerLazyPlannerConfig
): Promise<PersistedRouteCaptureRecord> => {
  const { usedComponentNames, transitiveModulePaths } =
    await captureRouteHandlerComponentGraph(
      routePath.filePath,
      config.runtime.mdxCompileOptions
    );

  return {
    version: ROUTE_CAPTURE_RECORD_VERSION,
    usedLoadableComponentKeys: normalizeSortedUniqueStrings(usedComponentNames),
    transitiveModulePaths: normalizePersistedTransitiveModulePaths(
      routePath.filePath,
      transitiveModulePaths
    )
  };
};
