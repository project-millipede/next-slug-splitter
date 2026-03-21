import { toHandlerRelativePath } from '../../../core/discovery';
import {
  removeRenderedRouteHandlerPageIfPresent,
  type EmittedHandlerPageRemovalStatus
} from '../../../generator/output-lifecycle';
import { resolveRenderedHandlerPageLocation } from '../../../generator/rendered-page';

import type {
  RouteHandlerLazyOutputConfig,
  RouteHandlerLazyRequestIdentity
} from './types';

/**
 * Remove one lazily emitted handler file by explicit known output location.
 *
 * @param input - Removal input.
 * @param input.handlersDir - Target handlers-directory boundary.
 * @param input.pageFilePath - Absolute emitted page path to remove.
 * @returns Removal status for the file path.
 *
 * @remarks
 * This is the narrowest cleanup primitive used when a caller already knows the
 * exact file path that was previously emitted. The lazy discovery-snapshot
 * layer uses this form because it remembers the last emitted output location
 * even if the owning target later disappears.
 */
export const removeRouteHandlerLazyOutputAtKnownLocation = ({
  handlersDir,
  pageFilePath
}: {
  handlersDir: string;
  pageFilePath: string;
}): Promise<EmittedHandlerPageRemovalStatus> =>
  removeRenderedRouteHandlerPageIfPresent({
    pageFilePath,
    handlersDir
  });

/**
 * Remove the deterministic emitted handler file for one route identity.
 *
 * @param input - Removal input.
 * @param input.config - Minimal output config sufficient to derive the emitted
 * handler path.
 * @param input.identity - Locale/slug identity whose emitted output should no
 * longer exist.
 * @returns Removal status for the derived emitted page path.
 *
 * @remarks
 * This is the protocol counterpart to `renderRouteHandlerPage(...)` for the
 * "no output should exist anymore" case.
 *
 * It reuses the same deterministic handler-relative path rules as normal
 * emission:
 * - locale + slug array determine the handler-relative path
 * - emit format determines the final extension
 * - handlersDir determines the directory root
 *
 * That means stale-output cleanup does not need a previous manifest and does
 * not need the route to still be heavy. As long as we know which route
 * identity used to own the handler, we can deterministically remove the file
 * that would have been emitted for it.
 */
export const removeRouteHandlerLazyOutputForIdentity = ({
  config,
  identity
}: {
  config: RouteHandlerLazyOutputConfig;
  identity: Pick<RouteHandlerLazyRequestIdentity, 'locale' | 'slugArray'>;
}): Promise<EmittedHandlerPageRemovalStatus> => {
  const handlerRelativePath = toHandlerRelativePath(
    identity.locale,
    identity.slugArray,
    {
      includeLocaleLeaf: config.contentLocaleMode !== 'default-locale'
    }
  );
  const { pageFilePath } = resolveRenderedHandlerPageLocation({
    paths: config.paths,
    emitFormat: config.emitFormat,
    handlerRelativePath
  });

  return removeRenderedRouteHandlerPageIfPresent({
    pageFilePath,
    handlersDir: config.paths.handlersDir
  });
};
