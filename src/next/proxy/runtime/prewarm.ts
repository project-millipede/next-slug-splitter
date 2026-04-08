import { debugRouteHandlerProxy } from '../observability/debug-log';
import { getRouteHandlerProxyBootstrapState } from './bootstrap-state';
import { resolveRouteHandlerProxyWorkerClientSession } from '../worker/host/client';

import type { RouteHandlerProxyOptions } from './types';

/**
 * Best-effort startup prewarm for the dev-only proxy worker session.
 *
 * @param options - Proxy runtime options captured by the generated root bridge.
 * @returns `void` after the current worker session has been prepared or the
 * prewarm attempt has been safely abandoned.
 *
 * @remarks
 * This helper intentionally does one thing only: create or reuse the current
 * long-lived worker session before the first proxied request arrives. It does
 * not classify any pathnames, emit handlers, or warm generated routes.
 */
export const prewarmRouteHandlerProxy = async ({
  localeConfig,
  configRegistration = {}
}: RouteHandlerProxyOptions): Promise<void> => {
  try {
    debugRouteHandlerProxy('prewarm:start', {
      hasConfigPath: configRegistration.configPath != null,
      hasRootDir: configRegistration.rootDir != null
    });

    const bootstrapState = await getRouteHandlerProxyBootstrapState(
      localeConfig,
      configRegistration
    );

    if (!bootstrapState.hasConfiguredTargets) {
      debugRouteHandlerProxy('prewarm:skip-no-targets', {
        bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken
      });
      return;
    }

    await resolveRouteHandlerProxyWorkerClientSession({
      localeConfig,
      bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken,
      configRegistration
    });

    debugRouteHandlerProxy('prewarm:ready', {
      bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken
    });
  } catch (error) {
    debugRouteHandlerProxy('prewarm:error', {
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
