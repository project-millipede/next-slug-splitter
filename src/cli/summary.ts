import type { RouteHandlerNextResult } from '../next/types';

/**
 * Formats the handler-count clause for the standalone CLI summary.
 *
 * Adjusts the verb tense based on whether the CLI is reporting an
 * analyze-only preview or executing a real generation run.
 *
 * @param heavyCount - Number of heavy routes, equal to generated handlers.
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns Human-readable handler-count text.
 */
const formatHandlerSummary = (
  heavyCount: number,
  analyzeOnly: boolean
): string =>
  `${analyzeOnly ? 'would generate' : 'generated'} ${heavyCount} handlers`;

/**
 * Formats the rewrite-count clause for the standalone CLI summary.
 *
 * Mirrors the handler summary tense selection while reporting the
 * concrete number of emitted or prospective rewrite entries.
 *
 * @param rewriteCount - Number of rewrite entries in the runtime result.
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns Human-readable rewrite-count text.
 */
const formatRewriteSummary = (
  rewriteCount: number,
  analyzeOnly: boolean
): string =>
  `${analyzeOnly ? 'would produce' : 'produced'} ${rewriteCount} rewrite entries`;

/**
 * Formats the optional analyze-only suffix for the standalone CLI summary.
 *
 * Appends an explicit trailing marker exclusively for preview runs, allowing
 * the main sentence to remain shared between analyze and generate modes.
 *
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns The analyze-only marker or an empty string.
 */
const formatAnalyzeOnlySuffix = (analyzeOnly: boolean): string =>
  analyzeOnly ? ' (analyze-only)' : '';

/**
 * Formats the standalone CLI result summary.
 *
 * Builds the full summary from smaller clauses to maintain readability
 * while keeping generate and analyze-only wording aligned.
 *
 * @param result - Runtime execution result.
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns Human-readable summary text.
 */
export const formatRouteHandlerCliSummary = (
  result: RouteHandlerNextResult,
  analyzeOnly: boolean
): string => {
  // 1. Prepare static analysis counts.
  const analyzedSummary = `analyzed ${result.analyzedCount} route paths`;
  const heavyRouteSummary = `selected ${result.heavyCount} heavy paths`;

  // 2. Format the handler generation summary with dynamic verb tenses.
  const handlerSummary = formatHandlerSummary(result.heavyCount, analyzeOnly);

  // 3. Format the rewrite entry summary to mirror the handler tense.
  const rewriteSummary = formatRewriteSummary(
    result.rewrites.length,
    analyzeOnly
  );

  // 4. Determine the optional trailing mode marker.
  const modeSuffix = formatAnalyzeOnlySuffix(analyzeOnly);

  // 5. Assemble the full comma-separated summary sentence.
  return `${analyzedSummary}, ${heavyRouteSummary}, ${handlerSummary}, ${rewriteSummary}${modeSuffix}.`;
};
