import { toFacadeChunkPath } from '../common';
import {
  readAppClientReferenceManifest,
  resolveAppRouteManifestPath
} from './manifests';
import type { RouterChunkResolver } from '../types';

/**
 * Check whether a client-reference entry is the generated page itself.
 *
 * Next stores App Router client entries by source module path, for example:
 * `[project]/demo/app/app/[locale]/docs/generated-handlers/foo/page`.
 * The route resolver returns the route pattern without the trailing `/page`,
 * so the comparison has to include the source page suffix explicitly.
 *
 * @param entryPath Client-reference manifest entry path.
 * @param appRoutePath App Router route pattern without the trailing `/page`.
 * @returns True when the entry represents the generated page route.
 */
const isGeneratedPageEntry = (
  entryPath: string,
  appRoutePath: string
): boolean => {
  const generatedPageEntrySuffix =
    appRoutePath === '/' ? '/app/page' : `/app${appRoutePath}/page`;

  return entryPath.endsWith(generatedPageEntrySuffix);
};

/**
 * Resolve route-specific App Router client chunks for one generated handler.
 *
 * App Router client-reference manifests include the generated page entry and
 * shared entries such as layouts. The splitter metric only wants the generated
 * page chunks that are not also present in those shared entries.
 *
 * @param context Adapter build context supplied by Next.
 * @param zonePath Browser-visible facade prefix owned by the benchmark website.
 * @param routePath App Router route to resolve without the facade prefix.
 * @returns Same-origin facade JavaScript chunk URLs for the generated route.
 */
export const resolveAppChunks: RouterChunkResolver = async (
  context,
  zonePath,
  routePath
) => {
  const resolvedRoute = resolveAppRouteManifestPath(
    context.outputs.appPages,
    routePath
  );

  if (resolvedRoute == null) {
    return [];
  }

  const manifest = await readAppClientReferenceManifest(
    resolvedRoute.manifestPath
  );
  const entryJsFiles = manifest?.entryJSFiles;

  if (entryJsFiles == null) {
    return [];
  }

  const generatedEntry = Object.entries(entryJsFiles).find(([entryPath]) =>
    isGeneratedPageEntry(entryPath, resolvedRoute.appRoutePath)
  );

  if (generatedEntry == null) {
    return [];
  }

  const [generatedEntryPath, generatedEntryChunks] = generatedEntry;
  const sharedChunks = new Set(
    Object.entries(entryJsFiles)
      .filter(([entryPath]) => entryPath !== generatedEntryPath)
      .flatMap(([, chunks]) => chunks)
  );

  return generatedEntryChunks
    .filter(chunk => !sharedChunks.has(chunk))
    .map(chunk => toFacadeChunkPath(zonePath, chunk));
};
