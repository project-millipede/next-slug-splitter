import process from 'node:process';

import type { NextConfig } from 'next';

import { createConfigError } from '../../utils/errors';
import { isFunction } from '../../utils/type-guards';

import type { NextConfigLike } from '../config/load-next-config';
import { isObjectRecord, readObjectProperty } from '../config/shared';
import { resolveSlugSplitterAdapterEntry } from './adapter-entry';
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

/**
 * Input for `withSlugSplitter(...)`.
 */
export type WithSlugSplitterOptions = {
  /**
   * Path to the app-owned next-slug-splitter config module.
   *
   * Relative paths are resolved from the true Next entrypoint root, which is
   * represented by `process.cwd()` at `next.config.*` evaluation time.
   */
  configPath: string;
};

/**
 * Attach next-slug-splitter integration to a Next config export.
 *
 * Integration steps:
 * 1. Resolve and validate the app-owned config file path.
 * 2. Register that path for later adapter-side loading.
 * 3. Install the published adapter entrypoint into `experimental.adapterPath`.
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
  { configPath }: WithSlugSplitterOptions
): NextConfigExport {
  const rootDir = process.cwd();
  const resolvedConfigPath = resolveSlugSplitterConfigPath({
    rootDir,
    configPath
  });
  const resolvedAdapterPath = resolveSlugSplitterAdapterEntry({
    rootDir
  });

  registerSlugSplitterConfigPath(resolvedConfigPath);

  const applyRouteHandlers = (nextConfig: NextConfigLike): NextConfigLike => {
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

    const existingAdapterPath =
      configuredExperimental == null
        ? undefined
        : readObjectProperty(configuredExperimental, 'adapterPath');
    if (existingAdapterPath != null) {
      throw createConfigError(
        'withSlugSplitter(...) cannot be combined with an existing experimental.adapterPath.'
      );
    }

    return {
      ...nextConfig,
      experimental: {
        ...(configuredExperimental ?? {}),
        adapterPath: resolvedAdapterPath
      }
    };
  };

  if (isNextConfigFactory(nextConfigExport)) {
    return async (phase, context) =>
      applyRouteHandlers(await nextConfigExport(phase, context));
  }

  return applyRouteHandlers(nextConfigExport);
}
