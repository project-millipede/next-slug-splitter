import { toHandlerId, toHandlerRelativePath } from './discovery';
import { selectEmittedComponentKeys } from './component-emission';
import {
  createRouteContext,
  createRouteHandlerRoutePlanner
} from './processor-runner';
import type {
  ContentLocaleMode,
  LocalizedRoutePath,
  PlannedHeavyRoute,
  ResolvedRouteHandlerProcessorConfig,
  RouteIdentity
} from './types';

type HeavyRoutePlannerConfig = {
  contentLocaleMode?: ContentLocaleMode;
  routeBasePath: string;
  targetId?: string;
};

type PlannedHeavyRouteIdentity = RouteIdentity &
  Pick<PlannedHeavyRoute, 'handlerId' | 'handlerRelativePath'>;

export type PlanHeavyRoute = (
  routePath: LocalizedRoutePath,
  capturedComponentKeys: Array<string>
) => Promise<PlannedHeavyRoute | null>;

/**
 * Create the stable route identity shared by processor context and final route
 * planning output.
 *
 * @param routePath - Localized route file being planned.
 * @param config - Fully resolved target config used for planning.
 * @returns Route identity plus generated handler id/path.
 */
const createPlannedHeavyRouteIdentity = (
  routePath: LocalizedRoutePath,
  config: HeavyRoutePlannerConfig
): PlannedHeavyRouteIdentity => ({
  locale: routePath.locale,
  slugArray: routePath.slugArray,
  handlerId: toHandlerId(routePath.locale, routePath.slugArray),
  handlerRelativePath: toHandlerRelativePath(
    routePath.locale,
    routePath.slugArray,
    {
      includeLocaleLeaf: config.contentLocaleMode !== 'default-locale'
    }
  )
});

/**
 * Create a reusable heavy-route planner.
 *
 * This helper is shared by eager all-route generation and lazy single-route
 * planning. It owns the shared classification decision:
 *
 * 1. If processor planning emits component entries, the route is heavy and the
 *    returned `PlannedHeavyRoute` is used by both modes.
 * 2. If processor planning emits no component entries, the route stays on the
 *    MDX component scope path and the returned planner yields `null`.
 *
 * Caller behavior differs by mode:
 * 1. The eager pipeline skips that route and continues collecting other heavy
 *    routes.
 * 2. The lazy single-route path converts `null` into a light analysis result.
 *
 * Processor module loading happens once when the planner is created. The
 * returned planner can then be reused for many eager routes or for one lazy
 * route reconstruction.
 *
 * @param rootDir - Application root used to resolve processor imports.
 * @param processorConfig - Resolved processor module configuration.
 * @param config - Fully resolved target config used for planning.
 * @returns Reusable route planner for captured MDX component keys.
 */
export const createHeavyRoutePlanner = async (
  rootDir: string,
  processorConfig: ResolvedRouteHandlerProcessorConfig,
  config: HeavyRoutePlannerConfig
): Promise<PlanHeavyRoute> => {
  const planRoute = await createRouteHandlerRoutePlanner(
    rootDir,
    processorConfig
  );

  return async (
    routePath: LocalizedRoutePath,
    capturedComponentKeys: Array<string>
  ): Promise<PlannedHeavyRoute | null> => {
    const plannedRouteIdentity = createPlannedHeavyRouteIdentity(
      routePath,
      config
    );

    const route = createRouteContext({
      filePath: routePath.filePath,
      handlerId: plannedRouteIdentity.handlerId,
      handlerRelativePath: plannedRouteIdentity.handlerRelativePath,
      locale: plannedRouteIdentity.locale,
      routeBasePath: config.routeBasePath,
      slugArray: plannedRouteIdentity.slugArray,
      targetId: config.targetId
    });

    const { factoryImport, factoryBindings, componentEntries } =
      await planRoute(route, capturedComponentKeys);

    const { emittedComponentKeys, hasEmittedComponentKeys } =
      selectEmittedComponentKeys(componentEntries);

    if (!hasEmittedComponentKeys) {
      return null;
    }

    return {
      ...plannedRouteIdentity,
      usedLoadableComponentKeys: emittedComponentKeys,
      factoryImport,
      factoryBindings,
      componentEntries
    };
  };
};
