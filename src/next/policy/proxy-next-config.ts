import type { NextConfigLike } from '../config/load-next-config';
import type { RouteHandlerRoutingStrategy } from './routing-strategy';

/**
 * Apply proxy-specific Next config adjustments if needed.
 *
 * @param input - Policy input.
 * @param input.config - Current effective Next config.
 * @param input.routingStrategy - Explicit route-handler routing strategy.
 * @returns Next config, unchanged for proxy mode.
 *
 * @remarks
 * The proxy runtime does not require any special Next config flags. The
 * heavy/light routing decision is based solely on the public pathname, which
 * Next normalizes from data requests automatically. This function exists as a
 * hook for future proxy-specific config adjustments.
 */
export const applyRouteHandlerProxyNextConfigPolicy = <
  TConfig extends NextConfigLike
>({
  config
}: {
  config: TConfig;
  routingStrategy: RouteHandlerRoutingStrategy;
}): TConfig => {
  return config;
};
