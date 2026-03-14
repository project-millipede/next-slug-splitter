#!/usr/bin/env node

import process from 'process';

import {
  DEFAULT_NEXT_CONFIG_FILENAMES
} from '../next/config/index';
import { executeRouteHandlerNextPipeline } from '../next/runtime';
import {
  createCliError,
  formatNextSlugSplitterMessage
} from '../utils/errors';
import { isNonEmptyString } from '../utils/type-guards-extended';
import { resolveNextConfigPath } from './config-path';

/**
 * Execute the next-slug-splitter CLI.
 *
 * @returns A promise that resolves once the requested analysis or generation
 * run has finished.
 *
 * @remarks
 * The CLI is a true entrypoint. `process.cwd()` is used here as the default
 * application root for config discovery.
 */
const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const rootDir = process.cwd();
  const analyzeOnly = argv.includes('--analyze-only');
  const jsonOutput = argv.includes('--json');
  const nextConfigPath = resolveNextConfigPath({ argv, rootDir });

  if (!isNonEmptyString(nextConfigPath)) {
    throw createCliError(
      `Unable to locate a Next config file in ${rootDir}. Pass --config or add one of: ${DEFAULT_NEXT_CONFIG_FILENAMES.join(', ')}.`
    );
  }

  const result = await executeRouteHandlerNextPipeline({
    rootDir,
    nextConfigPath,
    mode: analyzeOnly ? 'analyze' : 'generate'
  });

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  console.log(
    formatNextSlugSplitterMessage(
      `analyzed ${result.analyzedCount} route paths, selected ${result.heavyCount} heavy paths, produced ${result.rewrites.length} rewrite entries${
        analyzeOnly ? ' (analyze-only)' : ''
      }.`
    )
  );
};

main().catch(error => {
  console.error(formatNextSlugSplitterMessage('generation failed'));
  console.error(error);
  process.exit(1);
});
