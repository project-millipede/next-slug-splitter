import type {
  ResolvedRouteHandlersConfig as SharedResolvedRouteHandlersConfig,
  ResolvedRouteHandlersConfigBase as SharedResolvedRouteHandlersConfigBase,
  RouteHandlersConfigBase,
  RouteHandlersTargetConfigBase
} from '../shared/types';

/**
 * Placeholder App Router target config.
 *
 * App Router-specific fields will be introduced here as that integration
 * contract is designed. For now this file exists to keep router-specific type
 * work out of `next/shared/types.ts`.
 */
export type RouteHandlersTargetConfig = RouteHandlersTargetConfigBase;

/**
 * Placeholder App Router config container.
 */
export type RouteHandlersConfig =
  RouteHandlersConfigBase<RouteHandlersTargetConfig>;

/**
 * Placeholder resolved App Router base config.
 */
export type ResolvedRouteHandlersConfigBase =
  SharedResolvedRouteHandlersConfigBase;

/**
 * Placeholder resolved App Router config.
 */
export type ResolvedRouteHandlersConfig = SharedResolvedRouteHandlersConfig;
