import { GENERATED_HANDLERS_SEGMENT, stripZonePath } from './common';
import type {
  AdapterBuildContext,
  AdapterRewrite,
  BenchmarkRouteChunkCandidates,
  RouterChunkResolver
} from './types';

/**
 * Check whether an adapter rewrite can be used as a route rewrite.
 *
 * @param rewrite Adapter rewrite metadata.
 * @returns True when the rewrite has string source and destination values.
 */
const hasRouteRewriteShape = (
  rewrite: AdapterRewrite
): rewrite is AdapterRewrite & {
  source: string;
  destination: string;
} =>
  typeof rewrite.source === 'string' && typeof rewrite.destination === 'string';

/**
 * Resolve payload candidates from splitter-generated rewrites.
 *
 * Splitter routes are represented in Next's adapter routing metadata as public
 * route rewrites into generated-handler destinations. Stable multi-locale
 * Pages builds may preserve a leading locale, for example
 * `/en/docs/generated-handlers/...`. This helper retains that actual
 * destination in benchmark metadata while the router resolver normalizes only
 * the build-manifest lookup key when required.
 *
 * @param context Adapter build context supplied by Next.
 * @param resolveChunks Router-specific chunk resolver selected by the adapter.
 * @param zonePath Browser-visible facade prefix owned by the benchmark website.
 * @returns Route candidate collections keyed by public route path.
 */
export const resolveSplitterRoutes = async (
  context: AdapterBuildContext,
  resolveChunks: RouterChunkResolver,
  zonePath: string
): Promise<Record<string, BenchmarkRouteChunkCandidates>> => {
  const routes: Record<string, BenchmarkRouteChunkCandidates> = {};
  const rewrites = context.routing.beforeFiles;

  for (const rewrite of rewrites) {
    if (
      hasRouteRewriteShape(rewrite) &&
      !rewrite.source.includes(GENERATED_HANDLERS_SEGMENT) &&
      rewrite.destination.includes(GENERATED_HANDLERS_SEGMENT)
    ) {
      const routePath = stripZonePath(zonePath, rewrite.source);
      const generatedHandlerPath = stripZonePath(zonePath, rewrite.destination);
      const chunks = await resolveChunks(
        context,
        zonePath,
        generatedHandlerPath
      );

      routes[routePath] = {
        generatedHandlerPath,
        chunks
      };
    }
  }

  return routes;
};
