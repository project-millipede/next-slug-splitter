import path from 'path';

import {
  isModuleReference,
  resolveModuleReferenceToFilePath
} from '../../module-reference';
import {
  createConfigError,
  createConfigMissingError
} from '../../utils/errors';
import { isUndefined } from '../../utils/type-guards';
import { isNonEmptyString as isNonEmptyResolvedString } from '../../utils/type-guards-extended';
import type {
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlerPreparation,
  RouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

import { resolveConfiguredPathOption } from './paths';
import {
  isNonEmptyString,
  isObjectRecord,
  isStringArray,
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
  const configuredApp =
    isUndefined(routeHandlersConfig)
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
 * Resolve app-owned preparation tasks.
 *
 * @param input - Resolver input.
 * @returns Fully resolved preparation tasks.
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

  if (!Array.isArray(configuredPrepare)) {
    throw createConfigError(
      'routeHandlersConfig.app.prepare must be an array when provided.'
    );
  }

  const resolvedPreparations: Array<ResolvedRouteHandlerPreparation> = [];

  for (const [index, preparation] of configuredPrepare.entries()) {
    if (!isObjectRecord(preparation)) {
      throw createConfigError(
        `routeHandlersConfig.app.prepare[${index}] must be an object.`
      );
    }

    const id = readObjectProperty(preparation, 'id');
    if (!isNonEmptyString(id)) {
      throw createConfigError(
        `routeHandlersConfig.app.prepare[${index}].id must be a non-empty string.`
      );
    }

    const kind = readObjectProperty(preparation, 'kind');
    if (kind === 'tsc-project') {
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
          id,
          kind,
          tsconfigPath: resolveModuleReferenceToFilePath({
            rootDir,
            reference: tsconfigPathReference
          })
        });
      } catch {
        throw createConfigError(
          `routeHandlersConfig.app.prepare[${index}].tsconfigPath could not be resolved from "${rootDir}".`
        );
      }

      continue;
    }

    if (kind === 'command') {
      const command = readObjectProperty(preparation, 'command');
      if (!isStringArray(command) || command.length === 0) {
        throw createConfigError(
          `routeHandlersConfig.app.prepare[${index}].command must be a non-empty string array.`
        );
      }

      const configuredCwd = readObjectProperty(preparation, 'cwd');
      const cwd =
        isUndefined(configuredCwd)
          ? rootDir
          : resolveConfiguredPathOption({
              rootDir,
              value: configuredCwd,
              label: `routeHandlersConfig.app.prepare[${index}].cwd`
            });
      if (!isNonEmptyString(cwd)) {
        throw createConfigError(
          `routeHandlersConfig.app.prepare[${index}].cwd must resolve to a non-empty string path.`
        );
      }

      resolvedPreparations.push({
        id,
        kind,
        command: [...command],
        cwd
      });
      continue;
    }

    throw createConfigError(
      `routeHandlersConfig.app.prepare[${index}].kind must be "tsc-project" or "command".`
    );
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
  nextConfigPath,
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

  let resolvedNextConfigPath = nextConfigPath;
  if (resolvedNextConfigPath == null) {
    resolvedNextConfigPath = resolveConfiguredPathOption({
      rootDir: resolvedRootDir,
      value: readObjectProperty(configuredApp, 'nextConfigPath'),
      label: 'app.nextConfigPath'
    });
  }

  if (!isNonEmptyResolvedString(resolvedNextConfigPath)) {
    throw createConfigMissingError(
      'Missing routeHandlersConfig.app.nextConfigPath. Provide it in routeHandlersConfig.app or pass nextConfigPath explicitly.'
    );
  }

  return {
    rootDir: resolvedRootDir,
    nextConfigPath: resolvedNextConfigPath
  };
};
