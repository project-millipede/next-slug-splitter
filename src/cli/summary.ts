import type { RouteHandlerNextResult } from '../next/shared/types';

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
 * concrete number of emitted or prospective rewrite entries together with the
 * default-locale-specific rewrite contribution.
 *
 * @param rewriteCount - Baseline rewrite count before default-locale additions.
 * @param rewriteCountOfDefaultLocale - Extra rewrites contributed by the default locale.
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns Human-readable rewrite-count text.
 */
const formatRewriteSummary = (
  rewriteCount: number,
  rewriteCountOfDefaultLocale: number,
  analyzeOnly: boolean
): string =>
  `${analyzeOnly ? 'would produce' : 'produced'} ${
    rewriteCount + rewriteCountOfDefaultLocale
  } rewrite entries (${rewriteCount} rewrites + ${rewriteCountOfDefaultLocale} of default locale)`;

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
 * Builds per-target summaries from smaller clauses to maintain readability
 * while keeping generate and analyze-only wording aligned.
 *
 * @param results - Per-target runtime execution results.
 * @param analyzeOnly - Whether the CLI ran in analyze-only mode.
 * @returns Human-readable summary text.
 */
export const formatRouteHandlerCliSummary = (
  results: Array<RouteHandlerNextResult>,
  analyzeOnly: boolean
): string => {
  const summaries = results.map(result => {
    // 1. Prepare static analysis counts.
    const analyzedSummary = `analyzed ${result.analyzedCount} route paths`;
    const heavyRouteSummary = `selected ${result.heavyCount} heavy paths`;

    // 2. Format the handler generation summary with dynamic verb tenses.
    const handlerSummary = formatHandlerSummary(result.heavyCount, analyzeOnly);

    // 3. Format the rewrite entry summary to mirror the handler tense.
    const rewriteSummary = formatRewriteSummary(
      result.rewrites.length,
      result.rewritesOfDefaultLocale.length,
      analyzeOnly
    );

    // 4. Determine the optional trailing mode marker.
    const modeSuffix = formatAnalyzeOnlySuffix(analyzeOnly);

    // 5. Assemble the full comma-separated summary sentence.
    return `[${result.targetId}] ${analyzedSummary}, ${heavyRouteSummary}, ${handlerSummary}, ${rewriteSummary}${modeSuffix}.`;
  });

  return summaries.join('\n');
};
