/**
 * Identify whether a target manifest describes splitter or heavy-baseline
 * output.
 */
export type ManifestKind = 'splitter' | 'heavy-baseline';

export type SplitterRouteMetadata = {
  /**
   * Target-owned generated-handler path used by expanded diagnostics.
   */
  generatedHandlerPath: string | null;
};

/**
 * Tell browser measurement which JavaScript payload to find for one route.
 *
 * This is the browser-side representation of the adapter's successful
 * build-time selection:
 *
 * 1. `payloadChunk` identifies the exact selected facade pathname.
 * 2. The iframe loads the public route as a new document.
 * 3. The measurement requires that pathname as an initial external JavaScript
 *    resource of the document.
 * 4. When iframe load completes, the measurement reads buffered Resource
 *    Timing once and matches that exact pathname.
 * 5. The matching entry supplies status, encoded and decoded JavaScript bytes,
 *    and load duration.
 *
 * Empty and ambiguous selections have already failed during the target build.
 * Consequently, every published entry must be present in the completed initial
 * document load. An absent manifest entry is valid only for an intentionally
 * payload-free light splitter route.
 */
export type RoutePayloadManifestEntry = {
  /**
   * Generated-handler route retained for diagnostics, or null for a baseline.
   */
  generatedHandlerPath: string | null;
  /** Exact selected facade pathname required during initial document loading. */
  payloadChunk: string;
};

/**
 * Exact JavaScript payload measurement instructions keyed by public route.
 *
 * Each present entry connects one adapter-selected build artifact with one
 * browser-measured initial resource request.
 */
export type RoutePayloadManifest = {
  routes: Record<string, RoutePayloadManifestEntry>;
};

/**
 * Build-selected payload and diagnostic metadata resolved for one route.
 */
export type ResolvedRoutePayload = {
  /** Route metadata consumed by diagnostics and result components. */
  metadata: SplitterRouteMetadata;
  /** Exact facade payload path, or null for an intentional zero. */
  payloadChunk: string | null;
};
