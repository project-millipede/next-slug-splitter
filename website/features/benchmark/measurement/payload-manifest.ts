import type { DemoRoute, DemoTarget } from '../../../lib/benchmark/catalog';

import { appendCacheBuster } from './cache-busting';
import type {
  ManifestKind,
  ResolvedRoutePayload,
  RoutePayloadManifest,
  RoutePayloadManifestEntry
} from './types';

/**
 * Static manifests connecting build-time payload selection with browser
 * measurement.
 *
 * The splitter manifest identifies the selected generated-handler artifact.
 * The heavy-baseline manifest identifies the corresponding unsplit artifact.
 * Their facade paths let the benchmark match build output against the exact
 * Resource Timing entry created by the real browser route load.
 */
const ROUTE_PAYLOAD_MANIFEST_PATHS: Record<ManifestKind, string> = {
  splitter: '_next/static/__benchmark/splitter-route-payload.json',
  'heavy-baseline':
    '_next/static/__benchmark/heavy-baseline-route-payload.json'
};

/**
 * Check whether an unknown value can be read as an object record.
 *
 * @param value Unknown manifest value to inspect.
 * @returns Whether the value is a non-array object record.
 */
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Check whether an unknown value is a string or explicit null.
 *
 * @param value Unknown generated-handler value to inspect.
 * @returns Whether the value is a valid generated-handler representation.
 */
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/**
 * Check whether an unknown value is one route payload manifest entry.
 *
 * @param value Unknown route-entry value to inspect.
 * @returns Whether the value contains one valid selected payload.
 */
const isRoutePayloadManifestEntry = (
  value: unknown
): value is RoutePayloadManifestEntry =>
  isObjectRecord(value) &&
  isNullableString(value.generatedHandlerPath) &&
  typeof value.payloadChunk === 'string';

/**
 * Check whether an unknown value contains valid manifest route entries.
 *
 * @param value Unknown route collection to inspect.
 * @returns Whether every route value is a valid route payload entry.
 */
const isRoutePayloadManifestRoutes = (
  value: unknown
): value is Record<string, RoutePayloadManifestEntry> =>
  isObjectRecord(value) &&
  Object.values(value).every(isRoutePayloadManifestEntry);

/**
 * Parse and validate one route payload manifest document.
 *
 * @param value JSON value returned by the target manifest request.
 * @param targetLabel Human-readable target label used in validation errors.
 * @returns Validated route payload manifest.
 * @throws When the document does not satisfy the expected schema.
 */
export const parseRoutePayloadManifest = (
  value: unknown,
  targetLabel: string
): RoutePayloadManifest => {
  if (!isObjectRecord(value) || !isRoutePayloadManifestRoutes(value.routes)) {
    throw new Error(`Invalid route payload manifest served by ${targetLabel}.`);
  }

  return {
    routes: value.routes
  };
};

/**
 * Fetch one target's static route payload manifest.
 *
 * @param target Target app whose manifest should be loaded.
 * @param kind Splitter or heavy-baseline manifest variant.
 * @param runId Unique cache-busting identifier for the measurement run.
 * @param signal Shared target-measurement cancellation signal.
 * @returns Validated route payload manifest.
 * @throws When the request is cancelled, loading fails, or schema validation
 * fails.
 */
export const fetchRoutePayloadManifest = async (
  target: DemoTarget,
  kind: ManifestKind,
  runId: string,
  signal: AbortSignal
): Promise<RoutePayloadManifest> => {
  const manifestPath = ROUTE_PAYLOAD_MANIFEST_PATHS[kind];
  const manifestUrl = appendCacheBuster(
    `${target.zonePath}/${manifestPath}`,
    runId
  );
  const response = await fetch(manifestUrl, {
    cache: 'no-store',
    signal,
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load ${kind} route payload manifest for ${target.label} with status ${response.status}.`
    );
  }

  const document: unknown = await response.json();
  return parseRoutePayloadManifest(document, target.label);
};

/**
 * Check whether a selected payload belongs to the target facade.
 *
 * @param payloadChunk Selected same-origin payload path.
 * @param target Target expected to own the payload path.
 * @returns Nothing after successful validation.
 * @throws When the payload path is outside the target's `_next` facade path.
 */
const assertPayloadBelongsToTarget = (
  payloadChunk: string,
  target: DemoTarget
): void => {
  const expectedPrefix = `${target.zonePath}/_next/`;

  if (!payloadChunk.startsWith(expectedPrefix)) {
    throw new Error(
      `Selected payload "${payloadChunk}" does not belong to ${target.label}.`
    );
  }
};

/**
 * Resolve one public route from a route payload manifest.
 *
 * Resolution rules:
 *
 * 1. A light splitter route must have no payload entry.
 * 2. A heavy splitter route must have a payload entry.
 * 3. Every heavy-baseline route must have a payload entry.
 * 4. Every published payload must belong to the target facade.
 *
 * @param manifest Validated manifest loaded from the target.
 * @param route Public route fixture being measured.
 * @param target Target expected to own the selected payload.
 * @param kind Splitter or heavy-baseline manifest variant.
 * @returns Route metadata plus the exact selected payload path.
 * @throws When route evidence conflicts with the explicit expectation.
 */
export const resolveRoutePayload = (
  manifest: RoutePayloadManifest,
  route: DemoRoute,
  target: DemoTarget,
  kind: ManifestKind
): ResolvedRoutePayload => {
  const entry = manifest.routes[route.path];

  if (kind === 'splitter' && route.kind === 'light') {
    if (entry !== undefined) {
      throw new Error(
        `Unexpected splitter payload entry for zero-payload route "${route.path}" in ${target.label}.`
      );
    }

    return {
      metadata: {
        generatedHandlerPath: null
      },
      payloadChunk: null
    };
  }

  if (entry === undefined) {
    throw new Error(
      `Missing ${kind} route payload entry for "${route.path}" in ${target.label}.`
    );
  }

  assertPayloadBelongsToTarget(entry.payloadChunk, target);

  return {
    metadata: {
      generatedHandlerPath: entry.generatedHandlerPath
    },
    payloadChunk: entry.payloadChunk
  };
};
