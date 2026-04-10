import { createRuntimeError } from '../../utils/errors';
import { resolveNormalizedRouteHandlersTargetsFromAppConfig } from '../shared/config/resolve-configs';
import {
  loadSlugSplitterConfigFromPath
} from '../integration/slug-splitter-config-loader';
import {
  resolveRegisteredSlugSplitterConfigRegistration
} from '../integration/slug-splitter-config';
import { resolveRouteHandlersAppContext } from '../shared/bootstrap/route-handlers-bootstrap';

import type {
  ResolvedRouteHandlersRuntimeAttachments
} from '../shared/types';
import type { RouteHandlerProxyConfigRegistration } from './runtime/types';

/**
 * Runtime attachments keyed by normalized target id.
 */
export type RouteHandlerProxyRuntimeAttachmentsByTargetId = Record<
  string,
  ResolvedRouteHandlersRuntimeAttachments
>;

/**
 * Load only the runtime/executable target attachments needed by the proxy
 * worker.
 *
 * @param configRegistration - Adapter-owned config registration.
 * @returns Runtime attachments keyed by normalized target id.
 *
 * @remarks
 * This helper intentionally stays narrower than full target resolution:
 * - it may load the app config module
 * - it may resolve app context and normalized targets
 * - it must not run `prepare`
 * - it must not construct full resolved target configs
 * - it must not depend on locale-specific runtime semantics
 */
export const loadRouteHandlerProxyRuntimeAttachments = async (
  configRegistration: RouteHandlerProxyConfigRegistration
): Promise<RouteHandlerProxyRuntimeAttachmentsByTargetId> => {
  const rootDir = configRegistration.rootDir;

  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw createRuntimeError(
      'Route-handler proxy runtime attachments require a registered rootDir.'
    );
  }

  const resolvedRegistration =
    configRegistration.configPath == null
      ? resolveRegisteredSlugSplitterConfigRegistration(rootDir)
      : {
          configPath: configRegistration.configPath,
          rootDir
        };

  if (
    typeof resolvedRegistration.configPath !== 'string' ||
    resolvedRegistration.configPath.length === 0
  ) {
    throw createRuntimeError(
      'Route-handler proxy runtime attachments require an importable config module path. Register configPath explicitly or keep a conventional route-handlers config filename at the app root.'
    );
  }

  const routeHandlersConfig = await loadSlugSplitterConfigFromPath(
    resolvedRegistration.configPath
  );
  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    resolvedRegistration.rootDir
  );
  const normalizedTargets = resolveNormalizedRouteHandlersTargetsFromAppConfig(
    appContext.appConfig,
    appContext.routeHandlersConfig
  );

  return Object.fromEntries(
    normalizedTargets.map(({ options, runtime }) => [options.targetId, runtime])
  );
};
