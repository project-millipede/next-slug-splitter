import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Node, type Expression } from 'ts-morph';

import {
  GENERATED_HANDLERS_SEGMENT,
  isObjectRecord,
  isStringArray,
  routePatternToRegExp
} from '../common';
import { extractStaticAssignment } from '../parsers/static-javascript';
import type {
  AdapterAppPageOutput,
  AppClientReferenceManifest
} from '../types';

const RSC_MANIFEST_ASSIGNMENT = 'globalThis.__RSC_MANIFEST[...]';

/**
 * Identify the page-scoped client-reference manifest in an App Page asset map.
 *
 * Next traces this manifest as a necessary asset of the corresponding page
 * output.
 */
const APP_CLIENT_REFERENCE_MANIFEST_FILENAME =
  'page_client-reference-manifest.js';

/**
 * Check whether an assignment target writes one App Router RSC manifest entry.
 *
 * Next emits client-reference manifests as:
 * `globalThis.__RSC_MANIFEST["/route/page"] = {...}`.
 *
 * @param left Left-hand side of a parsed assignment expression.
 * @returns True when the assignment stores one manifest entry.
 */
const isRscManifestEntryAssignment = (left: Expression): boolean =>
  Node.isElementAccessExpression(left) &&
  left.getExpression().getText() === 'globalThis.__RSC_MANIFEST';

/**
 * Check whether a parsed App Router client-reference manifest has the needed shape.
 *
 * @param value Candidate manifest value extracted from `__RSC_MANIFEST`.
 * @returns True when the value exposes optional `entryJSFiles` arrays.
 */
const isAppClientReferenceManifest = (
  value: unknown
): value is AppClientReferenceManifest => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const entryJsFiles = value.entryJSFiles;
  return (
    entryJsFiles == null ||
    (isObjectRecord(entryJsFiles) &&
      Object.values(entryJsFiles).every(isStringArray))
  );
};

/**
 * Read an App Router page client-reference manifest.
 *
 * Next writes these files as JavaScript assignments rather than plain JSON. The
 * script is parsed as static JavaScript data so the needed `entryJSFiles` field
 * can be read without executing the generated file.
 *
 * @param clientReferenceManifestPath Absolute path to `page_client-reference-manifest.js`.
 * @returns Parsed client-reference manifest, or null when the shape is unexpected.
 */
export const readAppClientReferenceManifest = async (
  clientReferenceManifestPath: string
): Promise<AppClientReferenceManifest | null> => {
  const source = await readFile(clientReferenceManifestPath, 'utf8');
  const manifestCandidate = extractStaticAssignment(
    source,
    clientReferenceManifestPath,
    RSC_MANIFEST_ASSIGNMENT,
    isRscManifestEntryAssignment
  );

  return isAppClientReferenceManifest(manifestCandidate)
    ? manifestCandidate
    : null;
};

/**
 * Match an optional App source-directory prefix.
 *
 * Current adapter `sourcePage` values such as `/[locale]/docs/page` normally
 * omit this prefix. It remains a defensive normalization for compatible
 * `sourcePage` shapes.
 *
 * Examples:
 * - `app/[locale]/docs/page` -> `/[locale]/docs/page`
 * - `/app/[locale]/docs/page` -> `/[locale]/docs/page`
 * - `/[locale]/docs/page` remains unchanged
 */
const APP_SOURCE_DIRECTORY_PREFIX = /^\/?app\//;

/**
 * Match the filesystem-only suffix identifying an App Router page module.
 *
 * Examples:
 * - `/docs/[slug]/page` -> `/docs/[slug]`
 * - `/[locale]/page` -> `/[locale]`
 * - `/page` -> an empty intermediate pattern, later returned as `/`
 */
const APP_PAGE_MODULE_SUFFIX = /\/page$/;

/**
 * Match an App Router route-group segment.
 *
 * Route groups affect the source hierarchy but are not visible in the URL.
 * These examples assume the trailing `/page` has already been removed:
 *
 * - `/(default)` -> `/`
 * - `/(marketing)/about` -> `/about`
 * - `/[locale]/docs` remains unchanged
 */
const APP_ROUTE_GROUP_SEGMENT = /^\(.+\)$/;

/**
 * Normalize an adapter page output to the route pattern used by App Router.
 *
 * @param output App Router page output from the adapter build context.
 * @returns Normalized App route pattern.
 */
const readAppOutputRoutePattern = (output: AdapterAppPageOutput): string => {
  const normalizedRoutePattern = output.sourcePage
    .replace(APP_SOURCE_DIRECTORY_PREFIX, '/')
    .replace(APP_PAGE_MODULE_SUFFIX, '');
  const visibleSegments = normalizedRoutePattern
    .split('/')
    .filter(segment => !APP_ROUTE_GROUP_SEGMENT.test(segment));

  return visibleSegments.join('/') || '/';
};

/**
 * Resolve an App Router page's client-reference manifest from adapter assets.
 *
 * Next exposes necessary manifests through each App Page output's `assets` map.
 * The resolution therefore selects the actual adapter-provided asset instead
 * of manufacturing a path by replacing the page output filename.
 *
 * The resolution flow is:
 *
 * 1. Read the directory containing the adapter's page output.
 * 2. Inspect the absolute asset paths supplied for that output.
 * 3. Select `page_client-reference-manifest.js` from the same directory.
 *
 * @param output App Router page output from the adapter build context.
 * @returns Adapter-provided absolute manifest path, or null when unavailable.
 */
const resolveAppOutputClientReferenceManifestPath = (
  output: AdapterAppPageOutput
): string | null => {
  const pageOutputDir = path.dirname(output.filePath);
  const clientReferenceManifestPath = Object.values(output.assets).find(
    assetPath =>
      path.dirname(assetPath) === pageOutputDir &&
      path.basename(assetPath) === APP_CLIENT_REFERENCE_MANIFEST_FILENAME
  );

  if (clientReferenceManifestPath == null) {
    return null;
  }

  return clientReferenceManifestPath;
};

/**
 * Resolve a generated handler URL to its App Router manifest file.
 *
 * The benchmark splitter manifest starts from a concrete generated handler
 * path, while Next's App Router build indexes client references by app route
 * pattern. This helper bridges those two representations.
 *
 * @param appPages App Router page outputs from the adapter build context.
 * @param generatedHandlerPath Generated handler route without the facade prefix.
 * @returns Matching app route and client-reference manifest path, or null.
 */
export const resolveAppRouteManifestPath = (
  appPages: ReadonlyArray<AdapterAppPageOutput>,
  generatedHandlerPath: string
): {
  appRoutePath: string;
  manifestPath: string;
} | null => {
  const matchingEntries = appPages.flatMap(output => {
    const routePattern = readAppOutputRoutePattern(output);
    const manifestPath = resolveAppOutputClientReferenceManifestPath(output);

    if (
      manifestPath == null ||
      !routePatternToRegExp(routePattern).test(generatedHandlerPath)
    ) {
      return [];
    }

    return [
      {
        routePattern,
        manifestPath
      }
    ];
  });

  // Prefer a generated-handler entry when it and a broader catch-all route
  // both match. Heavy-baseline routes fall back to their first ordinary match.
  let matchingEntry = matchingEntries.find(({ routePattern }) =>
    routePattern.includes(GENERATED_HANDLERS_SEGMENT)
  );

  if (matchingEntry == null) {
    const [firstMatchingEntry] = matchingEntries;
    matchingEntry = firstMatchingEntry;
  }

  if (matchingEntry == null) {
    return null;
  }

  return {
    appRoutePath: matchingEntry.routePattern,
    manifestPath: matchingEntry.manifestPath
  };
};
