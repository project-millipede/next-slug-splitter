import { JsonObject } from '../utils/type-guards-json';
import type { RouteHandlerProcessor } from './types';

/**
 * Public identity helper for app-owned route-handler processors.
 *
 * The function intentionally preserves the exact generic types inferred from
 * the passed processor object.
 */
export const defineRouteHandlerProcessor = <TResolved, TMeta = JsonObject>(
  processor: RouteHandlerProcessor<TResolved, TMeta>
): RouteHandlerProcessor<TResolved, TMeta> => processor;
