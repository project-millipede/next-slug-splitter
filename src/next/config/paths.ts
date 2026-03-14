import path from 'path';

import { appRelativeModule } from '../../module-reference';
import { createConfigError } from '../../utils/errors';
import type {
  AppRelativeModuleReference,
  DynamicRouteParam,
  RouteHandlerTargetPaths
} from '../types';

import { isNonEmptyString } from './shared';

/**
 * Input for resolving a configured path option.
 */
export type ResolveConfiguredPathOptionInput = {
  /**
   * Application root directory.
   */
  rootDir: string;
  /**
   * Raw configured path value.
   */
  value: unknown;
  /**
   * Human-readable config label for error messages.
   */
  label: string;
};

/**
 * Resolve an optional config path value relative to the application root.
 *
 * @param input - Path resolution input.
 * @returns The resolved absolute path, or `undefined` when the option is not
 * provided.
 */
export const resolveConfiguredPathOption = ({
  rootDir,
  value,
  label
}: ResolveConfiguredPathOptionInput): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw createConfigError(`${label} must be a non-empty string path.`);
  }

  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
};

/**
 * Build the import specifier of the source page whose `getStaticProps` should
 * be proxied by generated handler pages.
 *
 * @param input - Static-props import construction input.
 * @returns Source page module reference relative to the app root.
 */
export const createCatchAllBaseStaticPropsImport = ({
  routeSegment,
  handlerRouteParam
}: {
  /**
   * Route segment owned by the target.
   */
  routeSegment: string;
  /**
   * Dynamic route parameter descriptor for the source page.
   */
  handlerRouteParam: DynamicRouteParam;
}): AppRelativeModuleReference => {
  const routeSegments = routeSegment.split('/');
  const pageSegment =
    handlerRouteParam.kind === 'single'
      ? `[${handlerRouteParam.name}]`
      : handlerRouteParam.kind === 'catch-all'
        ? `[...${handlerRouteParam.name}]`
        : `[[...${handlerRouteParam.name}]]`;

  return appRelativeModule(['pages', ...routeSegments, pageSegment].join('/'));
};

/**
 * Build the public route base path for one catch-all target.
 *
 * @param routeSegment - Normalized route segment.
 * @returns Public route base path for the target.
 */
export const createCatchAllRouteBasePath = (routeSegment: string): string =>
  `/${routeSegment}`;

/**
 * Build the target-local path values implied by a catch-all preset.
 *
 * @param input - Preset path input.
 * @returns Target-local path values that still need app-level root resolution.
 */
export const createCatchAllRouteHandlerNextPaths = ({
  routeSegment,
  contentPagesDir
}: {
  /**
   * Normalized route segment for the target.
   */
  routeSegment: string;
  /**
   * Source content pages directory or import path.
   */
  contentPagesDir: string;
}): Partial<RouteHandlerTargetPaths> => {
  if (!isNonEmptyString(contentPagesDir)) {
    throw createConfigError(
      'contentPagesDir must be a non-empty string path.'
    );
  }

  // The preset keeps these paths app-relative. App-level config owns the root
  // directory and resolves them later.
  const routeSegments = routeSegment.split('/');

  return {
    contentPagesDir,
    handlersDir: path.join('pages', ...routeSegments, '_handlers')
  };
};
