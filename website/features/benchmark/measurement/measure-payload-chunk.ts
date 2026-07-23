import {
  toZoneUrl,
  type DemoRoute,
  type DemoTarget
} from '../../../lib/benchmark/catalog';

import { appendCacheBuster } from './cache-busting';
import type {
  JsChunkLoadMeasurement,
  MeasuredJsChunk
} from './types';

type PerformanceEntryWithResponseStatus = PerformanceEntry & {
  readonly responseStatus: unknown;
};

/**
 * Check whether the current browser exposes `responseStatus` on a performance
 * entry.
 *
 * Checking the actual entry provides environment-level feature detection
 * without assuming that every browser implements the complete Resource Timing
 * interface.
 *
 * @param entry Browser performance entry to inspect.
 * @returns Whether the entry exposes the optional response-status API.
 */
const isResponseStatusAvailable = (
  entry: PerformanceEntry
): entry is PerformanceEntryWithResponseStatus =>
  'responseStatus' in entry;

/**
 * Load one target route in a hidden iframe.
 *
 * The iframe creates the real browser route load used for measurement. The
 * selected JavaScript payload is observed from that load's Resource Timing
 * buffer and is never fetched separately by the benchmark.
 *
 * Sequence:
 *
 * 1. Create a visually hidden, non-interactive, same-origin measurement frame.
 * 2. Attach navigation, error, and shared-cancellation listeners.
 * 3. Navigate through the cache-busted same-origin facade URL.
 * 4. Resolve only when the initial document load completes.
 * 5. Remove the pending frame and reject when loading fails or the shared
 *    target budget expires.
 *
 * @param src Cache-busted same-origin facade route URL.
 * @param signal Shared target-measurement cancellation signal.
 * @returns Promise resolving with the iframe after its load event.
 * @throws When the iframe reports an error or the signal is aborted.
 */
const loadMeasurementIframe = (
  src: string,
  signal: AbortSignal
): Promise<HTMLIFrameElement> =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');

    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.className = 'measurement-frame';

    /**
     * Remove every listener associated with the pending navigation.
     *
     * @returns Nothing.
     */
    const cleanup = (): void => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    /**
     * Resolve the completed iframe navigation.
     *
     * @returns Nothing.
     */
    const handleLoad = (): void => {
      cleanup();
      resolve(iframe);
    };

    /**
     * Reject and remove an iframe whose navigation failed.
     *
     * @returns Nothing.
     */
    const handleError = (): void => {
      cleanup();
      iframe.remove();
      reject(new Error(`Failed to load iframe route "${src}".`));
    };

    /**
     * Reject and remove an iframe cancelled by the shared target budget.
     *
     * @returns Nothing.
     */
    const handleAbort = (): void => {
      cleanup();
      iframe.remove();
      reject(new Error(`Route measurement for "${src}" was aborted.`));
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);
    signal.addEventListener('abort', handleAbort, { once: true });

    if (signal.aborted) {
      handleAbort();
      return;
    }

    iframe.src = src;
    document.body.appendChild(iframe);
  });

/**
 * Read a finite response status from a browser performance entry.
 *
 * Purpose and compatibility policy:
 *
 * 1. Use a finite status only to reject a known non-2xx response and to
 *    populate diagnostics.
 * 2. Never use status to calculate encoded size, decoded size, duration, or
 *    savings.
 * 3. Normalize missing, non-numeric, or non-finite values to null because
 *    Resource Timing implementations do not expose this field uniformly.
 * 4. Leave HTTP success or failure undecided when the status is unavailable.
 *
 * Resource Timing implementations can expose the exact resource, byte sizes,
 * and duration without exposing the newer `responseStatus` property. In that
 * case, the browser cannot independently prove that the resource returned 2xx,
 * but the remaining measurement evidence is still usable.
 *
 * @param entry Browser performance entry, when available.
 * @returns Finite browser-reported response status, or null when unavailable.
 */
const readResponseStatus = (
  entry: PerformanceEntry | undefined
): number | null => {
  if (entry === undefined || !isResponseStatusAvailable(entry)) {
    return null;
  }

  const { responseStatus } = entry;

  return typeof responseStatus === 'number' &&
    Number.isFinite(responseStatus)
    ? responseStatus
    : null;
};

/**
 * Read the response status of the iframe navigation.
 *
 * Navigation status is validation evidence rather than a timing input. Browser
 * support for exposing it can vary, so an unavailable value is represented as
 * null instead of being interpreted as either success or failure. The iframe
 * load event still proves that navigation completed, but not that it returned
 * a 2xx response.
 *
 * @param iframeWindow Loaded same-origin target iframe window.
 * @returns Navigation response status, or null when unavailable.
 */
const readNavigationStatus = (iframeWindow: Window): number | null => {
  const navigationEntry = iframeWindow.performance
    .getEntriesByType('navigation')
    .find(entry => entry.entryType === 'navigation');

  return readResponseStatus(navigationEntry);
};

/**
 * Reject a known unsuccessful navigation response.
 *
 * @param status Browser-reported navigation status.
 * @param routeUrl Browser-visible route URL used in the error.
 * @returns Nothing after successful validation.
 * @throws When the browser reports a status outside the 2xx range.
 */
const assertSuccessfulNavigationStatus = (
  status: number | null,
  routeUrl: string
): void => {
  if (status !== null && (status < 200 || status >= 300)) {
    throw new Error(`Route navigation "${routeUrl}" returned HTTP ${status}.`);
  }
};

/**
 * Read the exact selected resource from the completed document load.
 *
 * Runtime contract:
 *
 * 1. The measurement accepts the selected payload only when the route requests
 *    it as an initial external JavaScript resource.
 * 2. Once iframe load fires, the completed request must already have an exact
 *    buffered Resource Timing entry.
 * 3. A missing entry is a hard contract failure rather than a reason to keep
 *    waiting.
 *
 * @param entries Buffered performance entries from the loaded iframe.
 * @param payloadChunk Exact same-origin facade pathname to read.
 * @returns Exact Resource Timing entry for the selected resource.
 * @throws When the completed initial document load does not contain it.
 */
const readPayloadResourceEntry = (
  entries: ReadonlyArray<PerformanceEntry>,
  payloadChunk: string
): PerformanceResourceTiming => {
  const matchedEntry = entries.find(entry => {
    if (entry.entryType !== 'resource') {
      return false;
    }

    return new URL(entry.name).pathname === payloadChunk;
  });

  if (matchedEntry === undefined) {
    throw new Error(
      `The selected initial JavaScript resource "${payloadChunk}" was not present when iframe load completed.`
    );
  }

  return matchedEntry as PerformanceResourceTiming;
};

/**
 * Validate one selected payload Resource Timing entry.
 *
 * Response status is optional validation and diagnostic evidence. It does not
 * contribute to any measured value. When the browser exposes it, a non-2xx
 * status remains a hard failure. When it is unavailable, the browser cannot
 * independently confirm 2xx and the measurement relies on the exact selected
 * resource entry, positive byte sizes, and positive duration instead.
 *
 * @param entry Exact selected payload entry.
 * @param payloadChunk Selected payload pathname used in errors.
 * @returns Nothing after successful validation.
 * @throws When a known status is unsuccessful or size/duration evidence is
 * unusable.
 */
const assertUsablePayloadMeasurement = (
  entry: PerformanceResourceTiming,
  payloadChunk: string
): void => {
  const responseStatus = readResponseStatus(entry);

  if (
    responseStatus !== null &&
    (responseStatus < 200 || responseStatus >= 300)
  ) {
    throw new Error(
      `JavaScript payload "${payloadChunk}" returned HTTP ${responseStatus}.`
    );
  }

  if (
    !Number.isFinite(entry.encodedBodySize) ||
    !Number.isFinite(entry.decodedBodySize) ||
    entry.encodedBodySize <= 0 ||
    entry.decodedBodySize <= 0
  ) {
    throw new Error(
      `JavaScript payload "${payloadChunk}" did not expose usable encoded and decoded size metadata.`
    );
  }

  if (!Number.isFinite(entry.duration) || entry.duration <= 0) {
    throw new Error(
      `JavaScript payload "${payloadChunk}" did not expose a usable resource duration.`
    );
  }
};

/**
 * Convert one browser Resource Timing entry into a JavaScript measurement.
 *
 * `encodedBodySize` and `decodedBodySize` are fixed browser API property
 * names. Because the selected resource is JavaScript, this boundary maps them
 * to the repository-owned `encodedJsByteSize` and `decodedJsByteSize` fields.
 * "Decoded" means after HTTP content decoding—not parsed or evaluated
 * JavaScript.
 *
 * @param payloadChunk Exact facade JavaScript pathname.
 * @param entry Browser entry produced by the iframe request.
 * @returns Measured JavaScript payload representation.
 */
const createMeasuredPayloadChunk = (
  payloadChunk: string,
  entry: PerformanceResourceTiming
): MeasuredJsChunk => ({
  path: payloadChunk,
  responseStatus: readResponseStatus(entry),
  decodedJsByteSize: entry.decodedBodySize,
  encodedJsByteSize: entry.encodedBodySize,
  loadDurationMs: entry.duration
});

/**
 * Measure one exact selected payload through its real iframe request.
 *
 * Sequence:
 *
 * 1. Navigate the hidden iframe through the real facade route.
 * 2. Validate the document navigation when its load event fires.
 * 3. Return an empty chunk collection for an intentional light-route zero.
 * 4. Otherwise, read the iframe's buffered resource entries exactly once.
 * 5. Require the build-selected initial external JavaScript resource.
 * 6. Validate and translate its browser evidence into the benchmark result.
 *
 * @param target Target app being measured.
 * @param route Public route being loaded.
 * @param payloadChunk Exact payload, or null for intentional zero.
 * @param runId Unique cache-busting identifier for the navigation.
 * @param signal Shared target-measurement cancellation signal.
 * @returns Chunk-load result containing zero or one selected payload.
 * @throws When cancellation, navigation, or selected-resource evidence is
 * unsuccessful.
 */
export const measurePayloadChunk = async (
  target: DemoTarget,
  route: DemoRoute,
  payloadChunk: string | null,
  runId: string,
  signal: AbortSignal
): Promise<JsChunkLoadMeasurement> => {
  const routeUrl = appendCacheBuster(toZoneUrl(target, route.path), runId);
  const iframe = await loadMeasurementIframe(routeUrl, signal);

  try {
    const iframeWindow = iframe.contentWindow;

    if (iframeWindow === null) {
      throw new Error('Unable to access iframe window.');
    }

    const navigationStatus = readNavigationStatus(iframeWindow);
    assertSuccessfulNavigationStatus(navigationStatus, routeUrl);

    if (payloadChunk === null) {
      return {
        chunks: [],
        navigationStatus
      };
    }

    const entry = readPayloadResourceEntry(
      iframeWindow.performance.getEntriesByType('resource'),
      payloadChunk
    );

    assertUsablePayloadMeasurement(entry, payloadChunk);

    return {
      chunks: [createMeasuredPayloadChunk(payloadChunk, entry)],
      navigationStatus
    };
  } finally {
    iframe.remove();
  }
};
