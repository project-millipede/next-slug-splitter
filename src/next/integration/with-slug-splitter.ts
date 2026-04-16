import path from 'node:path';
import process from 'node:process';

import type { NextConfig } from 'next';

import { createConfigError } from '../../utils/errors';
import { isFunction } from '../../utils/type-guards';
import { isNonEmptyString } from '../../utils/type-guards-extended';
import type { RouteHandlersConfig } from '../types';

import type { NextConfigLike } from '../shared/config/load-next-config';
import { isObjectRecord, readObjectProperty } from '../shared/config/shared';
import {
  createRouteHandlersAdapterPath,
  resolveSlugSplitterAdapterEntry
} from './adapter-entry';
import {
  registerSlugSplitterConfigPath,
  resolveSlugSplitterConfigPath
} from './slug-splitter-config';

/**
 * Supported Next config factory signature.
 */
type NextConfigFactory = (
  phase: string,
  context: {
    defaultConfig: NextConfig;
  }
) => NextConfigLike | Promise<NextConfigLike>;

/**
 * Supported Next config export shape for `withSlugSplitter(...)`.
 */
export type NextConfigExport = NextConfigLike | NextConfigFactory;

const isNextConfigFactory = (
  value: NextConfigExport
): value is NextConfigFactory => isFunction(value);

const resolveRouteHandlerEntrypointRootDir = (
  routeHandlersConfig: RouteHandlersConfig | undefined
): string => {
  const configuredRootDir = routeHandlersConfig?.app?.rootDir;
  if (
    isNonEmptyString(configuredRootDir) &&
    path.isAbsolute(configuredRootDir)
  ) {
    return configuredRootDir;
  }

  return process.cwd();
};

/**
 * Resolve the adapter path to inject and perform any required config-path
 * registration for the selected integration mode.
 *
 * @param input - Adapter-path resolution input.
 * @param input.entrypointRootDir - Absolute Next entrypoint root directory.
 * @param input.options - `withSlugSplitter(...)` options.
 * @returns Absolute adapter entry path.
 */
const resolveSlugSplitterAdapterPath = ({
  entrypointRootDir,
  options
}: {
  entrypointRootDir: string;
  options: WithSlugSplitterOptions;
}): string =>
  options.routeHandlersConfig != null
    ? createRouteHandlersAdapterPath(options.routeHandlersConfig)
    : (() => {
        const resolvedConfigPath = resolveSlugSplitterConfigPath({
          rootDir: entrypointRootDir,
          configPath: options.configPath
        });

        registerSlugSplitterConfigPath(resolvedConfigPath, {
          rootDir: entrypointRootDir
        });

        return resolveSlugSplitterAdapterEntry(entrypointRootDir);
      })();

/**
 * Input for `withSlugSplitter(...)`.
 */
export type WithSlugSplitterOptions =
  | {
      /**
       * Path to the app-owned next-slug-splitter config module.
       *
       * Relative paths are resolved from the true Next entrypoint root, which is
       * represented by `process.cwd()` at `next.config.*` evaluation time.
       */
      configPath: string;
      routeHandlersConfig?: never;
    }
  | {
      /**
       * App-owned route-handlers config object registered directly in the
       * current process.
       */
      routeHandlersConfig: RouteHandlersConfig;
      configPath?: never;
    };

/**
 * Inject next-slug-splitter's adapter into one evaluated Next config object.
 *
 * @param nextConfig - Evaluated Next config object.
 * @param resolvedAdapterPath - Absolute adapter entry path to install.
 * @returns Next config object with the adapter installed.
 */
const injectSlugSplitterAdapter = (
  nextConfig: NextConfigLike,
  resolvedAdapterPath: string
): NextConfigLike => {
  if (!isObjectRecord(nextConfig)) {
    throw createConfigError(
      'withSlugSplitter(...) requires the resolved Next config to be an object.'
    );
  }

  const configuredExperimental = readObjectProperty(nextConfig, 'experimental');
  if (
    configuredExperimental != null &&
    !isObjectRecord(configuredExperimental)
  ) {
    throw createConfigError(
      'withSlugSplitter(...) requires nextConfig.experimental to be an object when provided.'
    );
  }

  const existingAdapterPath = readObjectProperty(nextConfig, 'adapterPath');
  if (existingAdapterPath != null) {
    throw createConfigError(
      'withSlugSplitter(...) cannot be combined with an existing adapterPath.'
    );
  }

  const existingExperimentalAdapterPath =
    configuredExperimental == null
      ? undefined
      : readObjectProperty(configuredExperimental, 'adapterPath');
  if (existingExperimentalAdapterPath != null) {
    throw createConfigError(
      'withSlugSplitter(...) now installs the stable adapterPath option. Move any existing experimental.adapterPath to adapterPath before applying withSlugSplitter(...).'
    );
  }

  return {
    ...nextConfig,
    adapterPath: resolvedAdapterPath
  };
};

/**
 * Attach next-slug-splitter integration to a Next config export.
 *
 * Integration steps:
 * 1. Resolve and validate the app-owned config file path.
 * 2. Register that path for later adapter-side loading.
 * 3. Install the published adapter entrypoint into `adapterPath`.
 *
 * @param nextConfigExport - Next config object or config factory.
 * @param options - next-slug-splitter integration options.
 * @returns Wrapped Next config export with next-slug-splitter enabled.
 */
export function withSlugSplitter(
  nextConfigExport: NextConfigFactory,
  options: WithSlugSplitterOptions
): NextConfigFactory;
export function withSlugSplitter(
  nextConfigExport: NextConfigLike,
  options: WithSlugSplitterOptions
): NextConfigLike;
export function withSlugSplitter(
  nextConfigExport: NextConfigExport,
  options: WithSlugSplitterOptions
): NextConfigExport {
  const entrypointRootDir = resolveRouteHandlerEntrypointRootDir(
    options.routeHandlersConfig
  );
  const resolvedAdapterPath = resolveSlugSplitterAdapterPath({
    entrypointRootDir,
    options
  });

  if (isNextConfigFactory(nextConfigExport)) {
    return async (phase, context) =>
      injectSlugSplitterAdapter(
        await nextConfigExport(phase, context),
        resolvedAdapterPath
      );
  }

  return injectSlugSplitterAdapter(nextConfigExport, resolvedAdapterPath);
}
