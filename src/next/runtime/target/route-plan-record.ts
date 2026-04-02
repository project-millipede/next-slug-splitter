import { captureReferencedComponentNames } from '../../../core/capture';
import {
  sortStringArray,
  toHandlerId,
  toHandlerRelativePath
} from '../../../core/discovery';
import {
  createRouteContext,
  createRouteHandlerRoutePlanner
} from '../../../core/processor-runner';
import { isModuleReference } from '../../../module-reference';
import type {
  LoadableComponentEntry,
  LocalizedRoutePath,
  PlannedHeavyRoute,
  ResolvedFactoryBindingValue,
  ResolvedFactoryBindings,
  ResolvedComponentImportSpec
} from '../../../core/types';
import { isArrayOf, isObjectOf, isString } from '../../../utils/type-guards';
import {
  isObjectRecordOf,
  readObjectProperty
} from '../../../utils/type-guards-custom';
import { isJsonObject } from '../../../utils/type-guards-json';

import type { RouteHandlerPlannerConfig } from '../../types';

/**
 * Version number for persisted one-file route-plan records.
 *
 * @remarks
 * This version is shared by:
 * - target-wide incremental planning cache
 * - dev-proxy lazy single-route cache
 *
 * Keeping the persisted one-file record format centralized means both cache
 * layers can reuse the same validation and record-construction logic while
 * still remaining separate higher-level subsystems.
 */
const ROUTE_PLAN_RECORD_VERSION = 4;

/**
 * Persisted planning result for one localized content file.
 *
 * @remarks
 * `plannedHeavyRoute: null` is intentional and meaningful. It records that the
 * file was analyzed and definitively classified as light for the current target
 * identity, which is valuable reusable knowledge in both target-wide and
 * single-route lazy caching flows.
 */
export type PersistedRoutePlanRecord = {
  version: number;
  plannedHeavyRoute: PlannedHeavyRoute | null;
};

/**
 * Runtime validator for one persisted component-import descriptor.
 *
 * @param value - Candidate persisted value.
 * @returns `true` when the value matches the expected persisted shape.
 */
const isResolvedComponentImportSpec = (
  value: unknown
): value is ResolvedComponentImportSpec => {
  if (!isObjectRecordOf<ResolvedComponentImportSpec>(value)) {
    return false;
  }

  const kind = readObjectProperty(value, 'kind');
  return (
    isModuleReference(readObjectProperty(value, 'source')) &&
    (kind === 'default' || kind === 'named') &&
    isString(readObjectProperty(value, 'importedName'))
  );
};

/**
 * Runtime validator for an ordered factory-binding import list.
 *
 * @param value - Candidate persisted binding value.
 * @returns `true` when the value is an array of resolved component imports.
 */
const isResolvedComponentImportSpecArray = isArrayOf(
  isResolvedComponentImportSpec
);

/**
 * Runtime validator for one persisted factory-binding value.
 *
 * Factory bindings may persist as either:
 * - one resolved component import descriptor, or
 * - an ordered array of resolved component import descriptors
 *
 * @param value - Candidate persisted binding value.
 * @returns `true` when the value matches either supported binding shape.
 */
const isResolvedFactoryBindingValue = (
  value: unknown
): value is ResolvedFactoryBindingValue =>
  isResolvedComponentImportSpec(value) ||
  isResolvedComponentImportSpecArray(value);

/**
 * Runtime validator for persisted route-level factory bindings.
 *
 * @param value - Candidate persisted bindings object.
 * @returns `true` when the value is a non-null object whose values all match
 * supported factory-binding shapes.
 */
const isResolvedFactoryBindings = (
  value: unknown
): value is ResolvedFactoryBindings =>
  isObjectOf(isResolvedFactoryBindingValue)(value);

/**
 * Runtime validator for the optional persisted `factoryBindings` field.
 *
 * The persisted route-plan shape allows this property to be absent. When it is
 * present, it must satisfy {@link isResolvedFactoryBindings}.
 *
 * @param value - Candidate persisted `factoryBindings` field value.
 * @returns `true` when the field is absent or a valid bindings object.
 */
const isOptionalResolvedFactoryBindings = (
  value: unknown
): value is ResolvedFactoryBindings | undefined =>
  value == null || isResolvedFactoryBindings(value);

/**
 * Runtime validator for one persisted loadable-component entry.
 *
 * @param value - Candidate persisted value.
 * @returns `true` when the value matches the expected persisted shape.
 */
const isLoadableComponentEntry = (
  value: unknown
): value is LoadableComponentEntry => {
  if (!isObjectRecordOf<LoadableComponentEntry>(value)) {
    return false;
  }

  return (
    isString(readObjectProperty(value, 'key')) &&
    isResolvedComponentImportSpec(
      readObjectProperty(value, 'componentImport')
    ) &&
    isJsonObject(readObjectProperty(value, 'metadata'))
  );
};

/**
 * Runtime validator for one persisted heavy-route payload.
 *
 * @param value - Candidate persisted value.
 * @returns `true` when the value matches the expected persisted shape.
 */
const isPlannedHeavyRoute = (value: unknown): value is PlannedHeavyRoute => {
  if (!isObjectRecordOf<PlannedHeavyRoute>(value)) {
    return false;
  }

  const isStringArray = isArrayOf(isString);
  const isComponentEntryArray = isArrayOf(isLoadableComponentEntry);

  return (
    isString(readObjectProperty(value, 'locale')) &&
    isStringArray(readObjectProperty(value, 'slugArray')) &&
    isString(readObjectProperty(value, 'handlerId')) &&
    isString(readObjectProperty(value, 'handlerRelativePath')) &&
    isStringArray(readObjectProperty(value, 'usedLoadableComponentKeys')) &&
    isModuleReference(readObjectProperty(value, 'factoryImport')) &&
    isOptionalResolvedFactoryBindings(
      readObjectProperty(value, 'factoryBindings')
    ) &&
    isComponentEntryArray(readObjectProperty(value, 'componentEntries'))
  );
};

/**
 * Read and validate a persisted route-plan record.
 *
 * @param value - Candidate persisted metadata value.
 * @returns Valid record when the value matches the expected shape, otherwise
 * `null`.
 *
 * @remarks
 * Persisted metadata should be self-healing. If the on-disk shape no longer
 * matches what the current code expects, callers treat the record as a cache
 * miss and recompute rather than trusting malformed state.
 */
export const readPersistedRoutePlanRecord = (
  value: unknown
): PersistedRoutePlanRecord | null => {
  if (!isObjectRecordOf<PersistedRoutePlanRecord>(value)) {
    return null;
  }

  const plannedHeavyRoute = readObjectProperty(value, 'plannedHeavyRoute');
  return readObjectProperty(value, 'version') === ROUTE_PLAN_RECORD_VERSION &&
    (plannedHeavyRoute === null || isPlannedHeavyRoute(plannedHeavyRoute))
    ? {
        version: ROUTE_PLAN_RECORD_VERSION,
        plannedHeavyRoute
      }
    : null;
};

/**
 * Build the persisted one-file route-plan record for a localized route file.
 *
 * @param routePath - Localized content route to analyze.
 * @param config - Fully resolved target config used for planning.
 * @param planRoute - Prepared processor-backed route planner.
 * @returns Persisted one-file route-plan record.
 *
 * @remarks
 * This helper is the shared "one file in, one persisted plan record out" seam
 * used by both cache subsystems. It performs:
 * - MDX capture for the single route file
 * - light/heavy classification based on captured component keys
 * - heavy-route processor planning when needed
 *
 * It intentionally does not know anything about higher-level cache layout or
 * request routing.
 */
export const createPersistedRoutePlanRecord = async (
  routePath: LocalizedRoutePath,
  config: RouteHandlerPlannerConfig,
  planRoute: Awaited<ReturnType<typeof createRouteHandlerRoutePlanner>>
): Promise<PersistedRoutePlanRecord> => {
  const usedLoadableComponentKeys = sortStringArray(
    await captureReferencedComponentNames({
      filePath: routePath.filePath,
      mdxCompileOptions: config.runtime.mdxCompileOptions
    })
  );

  if (usedLoadableComponentKeys.length === 0) {
    // Negative-result caching is first-class here. Light routes are still
    // analyzed knowledge and should be reusable without another capture build.
    return {
      version: ROUTE_PLAN_RECORD_VERSION,
      plannedHeavyRoute: null
    };
  }

  const plannedRouteBase: Omit<
    PlannedHeavyRoute,
    'factoryImport' | 'factoryBindings' | 'componentEntries'
  > = {
    locale: routePath.locale,
    slugArray: routePath.slugArray,
    handlerId: toHandlerId(routePath.locale, routePath.slugArray),
    handlerRelativePath: toHandlerRelativePath(
      routePath.locale,
      routePath.slugArray,
      {
        includeLocaleLeaf: config.contentLocaleMode !== 'default-locale'
      }
    ),
    usedLoadableComponentKeys
  };

  const route = createRouteContext({
    filePath: routePath.filePath,
    handlerId: plannedRouteBase.handlerId,
    handlerRelativePath: plannedRouteBase.handlerRelativePath,
    locale: routePath.locale,
    routeBasePath: config.routeBasePath,
    slugArray: routePath.slugArray,
    targetId: config.targetId
  });

  const { factoryImport, factoryBindings, componentEntries } = await planRoute({
    route,
    capturedComponentKeys: usedLoadableComponentKeys
  });

  return {
    version: ROUTE_PLAN_RECORD_VERSION,
    plannedHeavyRoute: {
      ...plannedRouteBase,
      factoryImport,
      factoryBindings,
      componentEntries
    }
  };
};
