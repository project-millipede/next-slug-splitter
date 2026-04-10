import path from 'path';

import {
  isModuleReference,
  resolveModuleReferenceToFilePath
} from '../../../module-reference';
import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import { isUndefined } from '../../../utils/type-guards';
import { isNonEmptyString as isNonEmptyResolvedString } from '../../../utils/type-guards-extended';
import type {
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlerPreparation,
  RouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

import { resolveConfiguredPathOption } from '../../pages/config/paths';
import { resolveRouteHandlersRoutingPolicy } from './routing-policy';
import {
  isNonEmptyString,
  isObjectRecord,
  readObjectProperty
} from './shared';

/**
 * Read the app-level `RouteHandlersConfig.app` object.
 *
 * @param routeHandlersConfig - App-owned config object that may contain an `app`
 * section.
 * @returns The raw app config object, or an empty object when no app section is
 * configured.
 * @throws If `app` is present but not an object.
 */
const readConfiguredRouteHandlersApp = (
  routeHandlersConfig: RouteHandlersConfig | undefined
): Record<string, unknown> => {
  const configuredApp = isUndefined(routeHandlersConfig)
    ? undefined
    : readObjectProperty(routeHandlersConfig, 'app');

  if (isUndefined(configuredApp)) {
    return {};
  }

  if (!isObjectRecord(configuredApp)) {
    throw createConfigError('routeHandlersConfig.app must be an object.');
  }

  return configuredApp;
};

/**
 * Resolve the configured application root for next-slug-splitter.
 *
 * @param input - Resolver input.
 * @returns The resolved application root directory, or `undefined` when neither
 * source provided one.
 *
 * @remarks
 * Library internals do not fall back to `process.cwd()` anymore. Relative
 * `app.rootDir` values are only valid when an explicit `rootDir` override is
 * available to resolve them against.
 */
const resolveConfiguredAppRootDir = ({
  rootDir,
  configuredRootDirValue
}: {
  rootDir?: string;
  configuredRootDirValue: unknown;
}): string | undefined => {
  if (!isUndefined(rootDir)) {
    return resolveConfiguredPathOption({
      rootDir,
      value: configuredRootDirValue,
      label: 'app.rootDir'
    });
  }

  if (!isNonEmptyString(configuredRootDirValue)) {
    return undefined;
  }

  if (!path.isAbsolute(configuredRootDirValue)) {
    throw createConfigError(
      'routeHandlersConfig.app.rootDir must be absolute when no rootDir override is provided.'
    );
  }

  return configuredRootDirValue;
};

/**
 * Input for resolving the route handlers app config.
 *
 * @remarks
 * This resolver requires explicit app context. Generic library code receives
 * app context through `routeHandlersConfig.app` or explicit entrypoint
 * arguments; `process.cwd()` is not probed implicitly.
 */
export type ResolveRouteHandlersAppConfigInput = RouteHandlersEntrypointInput;

/**
 * Resolve the optional app-owned preparation step or steps.
 *
 * @param input - Resolver input.
 * @returns Fully resolved preparation steps.
 */
export const resolveRouteHandlerPreparations = ({
  rootDir,
  routeHandlersConfig
}: {
  rootDir: string;
  routeHandlersConfig: RouteHandlersConfig | undefined;
}): Array<ResolvedRouteHandlerPreparation> => {
  const configuredApp = readConfiguredRouteHandlersApp(routeHandlersConfig);
  const configuredPrepare = readObjectProperty(configuredApp, 'prepare');

  if (isUndefined(configuredPrepare)) {
    return [];
  }

  if (!Array.isArray(configuredPrepare) && !isObjectRecord(configuredPrepare)) {
    throw createConfigError(
      'routeHandlersConfig.app.prepare must be an object or array when provided.'
    );
  }

  const configuredPreparations = Array.isArray(configuredPrepare)
    ? configuredPrepare
    : [configuredPrepare];
  const resolvedPreparations: Array<ResolvedRouteHandlerPreparation> = [];

  for (const [index, preparation] of configuredPreparations.entries()) {
    if (!isObjectRecord(preparation)) {
      throw createConfigError(
        `routeHandlersConfig.app.prepare[${index}] must be an object.`
      );
    }

    const tsconfigPathReference = readObjectProperty(
      preparation,
      'tsconfigPath'
    );

    if (!isModuleReference(tsconfigPathReference)) {
      throw createConfigError(
        `routeHandlersConfig.app.prepare[${index}].tsconfigPath must be a module reference object.`
      );
    }

    try {
      resolvedPreparations.push({
        tsconfigPath: resolveModuleReferenceToFilePath(
          rootDir,
          tsconfigPathReference
        )
      });
    } catch {
      throw createConfigError(
        `routeHandlersConfig.app.prepare[${index}].tsconfigPath could not be resolved from "${rootDir}".`
      );
    }
  }

  return resolvedPreparations;
};

/**
 * Resolve the application-level config shared by all targets.
 *
 * @param input - Resolver input.
 * @returns Fully resolved application-level config required by the Next
 * integration layer.
 */
export const resolveRouteHandlersAppConfig = ({
  rootDir,
  routeHandlersConfig
}: ResolveRouteHandlersAppConfigInput): ResolvedRouteHandlersAppConfig => {
  const configuredApp = readConfiguredRouteHandlersApp(routeHandlersConfig);
  const configuredRootDirValue = readObjectProperty(configuredApp, 'rootDir');
  const configuredRootDir = resolveConfiguredAppRootDir({
    rootDir,
    configuredRootDirValue
  });
  let resolvedRootDir = rootDir;
  if (configuredRootDir != null) {
    resolvedRootDir = configuredRootDir;
  }

  if (!isNonEmptyResolvedString(resolvedRootDir)) {
    throw createConfigMissingError(
      'Missing routeHandlersConfig.app.rootDir. Provide it in routeHandlersConfig.app or pass rootDir explicitly.'
    );
  }

  return {
    rootDir: resolvedRootDir,
    // The app-level routing policy is resolved here so the rest of the
    // integration stack can consume one already-validated contract instead of
    // re-reading raw `routeHandlersConfig.app.routing` shape in multiple
    // places.
    routing: resolveRouteHandlersRoutingPolicy(configuredApp)
  };
};
