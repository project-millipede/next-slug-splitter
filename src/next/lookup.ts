import {
  withHeavyRouteFilter as withPagesHeavyRouteFilter
} from './pages/lookup';
import {
  withHeavyRouteStaticParamsFilter
} from './app/static-params';

import type { GetStaticPaths } from 'next';
import type {
  AppRouteGenerateStaticParams,
  AppRouteStaticParams,
  WithHeavyRouteStaticParamsFilterOptions
} from './app/static-params';
import type {
  WithHeavyRouteFilterOptions as WithPagesHeavyRouteFilterOptions
} from './pages/lookup';

/**
 * Low-level Pages Router heavy-route filter helper.
 */
export { filterStaticPathsAgainstHeavyRoutes } from './pages/lookup';

/**
 * Low-level App Router heavy-route filter helper.
 */
export { filterStaticParamsAgainstHeavyRoutes } from './app/static-params';

/**
 * App Router static-params helper types re-exported from the dedicated App
 * lookup module.
 */
export type {
  AppRouteGenerateStaticParams,
  AppRouteStaticParamValue,
  AppRouteStaticParams,
  FilterStaticParamsAgainstHeavyRoutesOptions
} from './app/static-params';

/**
 * Pages Router wrapper options re-exported under the unified lookup surface.
 */
export type {
  WithHeavyRouteFilterOptions as WithHeavyRouteFilterPagesOptions
} from './pages/lookup';

/**
 * App Router wrapper options re-exported under the unified lookup surface.
 */
export type {
  WithHeavyRouteStaticParamsFilterOptions as WithHeavyRouteFilterAppOptions
} from './app/static-params';

/**
 * Router-specific Pages Router wrapper options.
 */
type HeavyRouteFilterOptionsPages = WithPagesHeavyRouteFilterOptions;

/**
 * Router-specific App Router wrapper options.
 *
 * @template TArgs - Additional arguments forwarded into
 *   `generateStaticParams`.
 * @template TParams - Static params object returned from
 *   `generateStaticParams`.
 */
type HeavyRouteFilterOptionsApp<
  TArgs extends Array<unknown> = [],
  TParams extends AppRouteStaticParams = AppRouteStaticParams
> = WithHeavyRouteStaticParamsFilterOptions<TArgs, TParams>;

/**
 * Unified heavy-route filter options accepted by the public lookup wrapper.
 *
 * Variants:
 * 1. Pages Router options that wrap `getStaticPaths`.
 * 2. App Router options that wrap `generateStaticParams`.
 *
 * @template TArgs - Additional arguments forwarded into
 *   `generateStaticParams`.
 * @template TParams - Static params object returned from
 *   `generateStaticParams`.
 */
export type WithHeavyRouteFilterOptions<
  TArgs extends Array<unknown> = [],
  TParams extends AppRouteStaticParams = AppRouteStaticParams
> =
  | HeavyRouteFilterOptionsPages
  | HeavyRouteFilterOptionsApp<TArgs, TParams>;

/**
 * Determine whether the provided lookup options target the Pages Router path.
 *
 * @param options - Unified heavy-route filter options.
 * @returns `true` when the Pages Router `getStaticPaths` wrapper should be
 *   used.
 */
const isPagesHeavyRouteFilterOptions = (
  options: WithHeavyRouteFilterOptions
): options is HeavyRouteFilterOptionsPages => 'getStaticPaths' in options;

/**
 * Wrap a Pages Router `getStaticPaths` implementation so heavy routes can be
 * removed from the public catch-all page.
 *
 * @param options - Pages Router wrapper options.
 * @returns Wrapped `getStaticPaths` implementation.
 */
export function withHeavyRouteFilter(
  options: HeavyRouteFilterOptionsPages
): GetStaticPaths;

/**
 * Wrap an App Router `generateStaticParams` implementation so heavy routes can
 * be removed from the public catch-all page.
 *
 * @param options - App Router wrapper options.
 * @returns Wrapped `generateStaticParams` implementation.
 * @template TArgs - Additional arguments forwarded into
 *   `generateStaticParams`.
 * @template TParams - Static params object returned from
 *   `generateStaticParams`.
 */
export function withHeavyRouteFilter<
  TArgs extends Array<unknown>,
  TParams extends AppRouteStaticParams
>(
  options: HeavyRouteFilterOptionsApp<TArgs, TParams>
): AppRouteGenerateStaticParams<TArgs, TParams>;

/**
 * Wrap either the Pages Router `getStaticPaths` seam or the App Router
 * `generateStaticParams` seam with heavy-route filtering.
 *
 * Selection rule:
 * 1. Pages Router when `options.getStaticPaths` is present.
 * 2. App Router otherwise.
 *
 * @param options - Router-specific heavy-route filter options.
 * @returns Router-specific wrapped static route enumeration function.
 * @template TArgs - Additional arguments forwarded into
 *   `generateStaticParams`.
 * @template TParams - Static params object returned from
 *   `generateStaticParams`.
 */
export function withHeavyRouteFilter<
  TArgs extends Array<unknown>,
  TParams extends AppRouteStaticParams
>(
  options: WithHeavyRouteFilterOptions<TArgs, TParams>
) {
  return isPagesHeavyRouteFilterOptions(options)
    ? withPagesHeavyRouteFilter(options)
    : withHeavyRouteStaticParamsFilter(options);
}
