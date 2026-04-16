import { resolveRouteHandlersConfigsFromAppConfig } from '../config/resolve-configs';
import { requireAppRouteHandlersConfig } from '../config/router-kind';
import { loadRouteHandlersConfigOrRegistered } from '../../integration/route-handlers-config';
import {
  loadResolvedRouteHandlersConfigsWithRuntimeHarness,
  type LoadResolvedRouteHandlersConfigsInput as SharedLoadResolvedRouteHandlersConfigsInput
} from '../../shared/runtime/config';

import type {
  RouteHandlersConfig,
  ResolvedRouteHandlersConfig
} from '../types';

export type LoadResolvedRouteHandlersConfigsInput =
  SharedLoadResolvedRouteHandlersConfigsInput<RouteHandlersConfig>;

export const loadResolvedRouteHandlersConfigs = async ({
  rootDir,
  localeConfig,
  routeHandlersConfig
}: LoadResolvedRouteHandlersConfigsInput): Promise<
  Array<ResolvedRouteHandlersConfig>
> => {
  const loadedRouteHandlersConfig = requireAppRouteHandlersConfig(
    await loadRouteHandlersConfigOrRegistered(routeHandlersConfig),
    'The App Router runtime'
  );

  return await loadResolvedRouteHandlersConfigsWithRuntimeHarness(
    {
      rootDir,
      localeConfig,
      routeHandlersConfig: loadedRouteHandlersConfig
    },
    {
      requireTypedRouteHandlersConfig: requireAppRouteHandlersConfig,
      resolveConfigsFromAppConfig: resolveRouteHandlersConfigsFromAppConfig,
      runtimeLabel: 'The App Router runtime'
    }
  );
};
