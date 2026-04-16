import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import { loadRouteHandlersConfigOrRegistered } from '../../integration/route-handlers-config';
import { resolveRouteHandlersAppContext } from '../../shared/bootstrap/route-handlers-bootstrap';
import { requireAppRouteHandlersConfig } from './router-kind';
import { resolveRouteHandlersConfigBasesFromAppConfig } from './resolve-configs';

import type {
  ResolvedRouteHandlersConfigBase
} from '../types';

/**
 * Load and resolve one configured App Router target by `targetId`.
 */
export const loadResolvedAppRouteHandlersTargetById = async (
  targetId: string
): Promise<ResolvedRouteHandlersConfigBase> => {
  const routeHandlersConfig = await loadRouteHandlersConfigOrRegistered();

  if (routeHandlersConfig == null) {
    throw createConfigMissingError(
      'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before using withHeavyRouteFilter(...).'
    );
  }

  const typedRouteHandlersConfig = requireAppRouteHandlersConfig(
    routeHandlersConfig,
    'withHeavyRouteFilter({ targetId, generateStaticParams })'
  );
  const appContext = resolveRouteHandlersAppContext(typedRouteHandlersConfig);
  const resolvedTargets = await resolveRouteHandlersConfigBasesFromAppConfig(
    appContext.appConfig,
    typedRouteHandlersConfig
  );
  const resolvedTarget = resolvedTargets.find(
    target => target.targetId === targetId
  );

  if (resolvedTarget == null) {
    throw createConfigError(
      `No App Router route-handlers target found for targetId "${targetId}".`
    );
  }

  return resolvedTarget;
};
