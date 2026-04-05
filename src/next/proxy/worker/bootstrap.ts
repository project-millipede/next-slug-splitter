import process from 'node:process';

import { createRuntimeError } from '../../../utils/errors';
import { loadRouteHandlerProxyRuntimeAttachments } from '../../internal/runtime-attachments';
import { doesRouteHandlerProxyLocaleConfigMatch } from '../runtime/shared';
import {
  createRouteHandlerLazyResolvedTargetsFromProxyBootstrap,
  createRouteHandlerPlannerConfigsByIdFromProxyBootstrap,
  readRouteHandlerProxyBootstrap
} from '../bootstrap-persisted';

import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerPlannerConfig } from '../../types';
import type { RouteHandlerLazyResolvedTarget } from '../lazy/types';
import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../runtime/types';

/**
 * In-memory worker bootstrap state reused across many lazy-miss requests.
 *
 * @remarks
 * State aspects:
 * - Identity: `bootstrapGenerationToken` ties all derived state to one parent
 *   bootstrap generation.
 * - Reuse: lazy-miss requests reuse resolved targets and planner configs from
 *   this value object instead of repeating bootstrap work.
 * - Boundary: the state contains derived values only; it does not keep the
 *   original app config-loading inputs around for request-time use.
 */
export type RouteHandlerProxyWorkerBootstrapState = {
  /**
   * Parent-issued token that identifies the current bootstrap generation.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;
  /**
   * Lightweight target shapes used for request-to-file resolution.
   */
  lazyResolvedTargets: Array<RouteHandlerLazyResolvedTarget>;
  /**
   * Fully prepared planner configs keyed by stable target id.
   */
  resolvedConfigsByTargetId: ReadonlyMap<string, RouteHandlerPlannerConfig>;
};

/**
 * Bootstrap the long-lived worker session for one proxy generation.
 *
 * @param bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param localeConfig - Locale semantics for the current worker generation.
 * @param configRegistration - Adapter-owned config registration for runtime
 * attachment reloading.
 * @returns Bootstrapped planning state for later lazy-miss requests.
 *
 * @remarks
 * Bootstrap aspects:
 * - Ownership: this reads the adapter-written structural manifest and uses the
 *   bootstrap request's config registration to reload runtime attachments
 *   instead of re-running full config loading, app-context resolution,
 *   `prepare`, and target resolution.
 * - Timing: bootstrap work runs once per generation, not once per lazy miss.
 * - Output: per-request lazy misses consume only the derived value state
 *   returned here.
 */
export const bootstrapRouteHandlerProxyWorker = async (
  bootstrapGenerationToken: BootstrapGenerationToken,
  localeConfig: LocaleConfig,
  configRegistration: RouteHandlerProxyConfigRegistration
): Promise<RouteHandlerProxyWorkerBootstrapState> => {
  const rootDir = configRegistration.rootDir ?? process.cwd();
  const manifest = await readRouteHandlerProxyBootstrap(rootDir);

  if (manifest == null) {
    throw createRuntimeError(
      'Missing route-handler proxy bootstrap manifest. Proxy worker bootstrap requires a bootstrap-generated `.next/cache/route-handlers-worker-bootstrap.json` manifest.'
    );
  }

  if (manifest.bootstrapGenerationToken !== bootstrapGenerationToken) {
    throw createRuntimeError(
      'Route-handler proxy worker bootstrap manifest does not match the requested bootstrap generation token.'
    );
  }

  if (
    !doesRouteHandlerProxyLocaleConfigMatch(
      localeConfig,
      manifest.localeConfig
    )
  ) {
    throw createRuntimeError(
      'Route-handler proxy worker bootstrap manifest localeConfig does not match the requested worker localeConfig.'
    );
  }

  // Structural target state comes from the persisted manifest; runtime
  // attachments are reloaded separately from the explicit bootstrap request.
  const runtimeAttachmentsByTargetId =
    await loadRouteHandlerProxyRuntimeAttachments(configRegistration);
  const structuralConfigsByTargetId =
    createRouteHandlerPlannerConfigsByIdFromProxyBootstrap(manifest);
  const resolvedConfigsByTargetId = new Map<string, RouteHandlerPlannerConfig>();

  for (const [targetId, structuralConfig] of structuralConfigsByTargetId) {
    const runtimeAttachments = runtimeAttachmentsByTargetId[targetId];

    if (runtimeAttachments == null) {
      throw createRuntimeError(
        `Route-handler proxy runtime attachments are missing target "${targetId}".`
      );
    }

    resolvedConfigsByTargetId.set(targetId, {
      ...structuralConfig,
      runtime: runtimeAttachments
    });
  }

  for (const targetId of Object.keys(runtimeAttachmentsByTargetId)) {
    if (!structuralConfigsByTargetId.has(targetId)) {
      throw createRuntimeError(
        `Route-handler proxy runtime attachments returned unexpected target "${targetId}".`
      );
    }
  }

  return {
    bootstrapGenerationToken,
    lazyResolvedTargets:
      createRouteHandlerLazyResolvedTargetsFromProxyBootstrap(manifest),
    resolvedConfigsByTargetId
  };
};
