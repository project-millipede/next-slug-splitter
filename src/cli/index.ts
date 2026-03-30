#!/usr/bin/env node

import process from 'process';

import { loadSlugSplitterConfigFromPath } from '../next/integration/slug-splitter-config-loader';
import { executeRouteHandlerNextPipeline } from '../next/runtime';
import { formatNextSlugSplitterMessage } from '../utils/errors';
import {
  resolveLocaleConfigFromArgv,
  resolveRouteHandlersConfigPathFromArgv
} from './options';

/**
 * Execute the next-slug-splitter CLI.
 *
 * @returns A promise that resolves once the requested analysis or generation
 * run has finished.
 *
 * @remarks
 * The CLI is a true standalone entrypoint. `process.cwd()` is used as the
 * explicit root base for relative config-path resolution and app-root
 * overrides.
 */
const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const rootDir = process.cwd();
  const analyzeOnly = argv.includes('--analyze-only');
  const jsonOutput = argv.includes('--json');
  const routeHandlersConfigPath = resolveRouteHandlersConfigPathFromArgv(
    argv,
    rootDir
  );
  const localeConfig = resolveLocaleConfigFromArgv(argv);
  const routeHandlersConfig = await loadSlugSplitterConfigFromPath(
    routeHandlersConfigPath
  );

  const result = await executeRouteHandlerNextPipeline({
    rootDir,
    localeConfig,
    routeHandlersConfig,
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
