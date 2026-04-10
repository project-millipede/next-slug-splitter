#!/usr/bin/env node

import process from 'process';

import { loadSlugSplitterConfigFromPath } from '../next/integration/slug-splitter-config-loader';
import { executeRouteHandlerNextPipeline } from '../next/shared/runtime';
import {
  formatNextSlugSplitterMessage,
  formatNextSlugSplitterMessageLines
} from '../utils/messages';
import {
  resolveLocaleConfigFromArgv,
  resolveRouteHandlersConfigPathFromArgv
} from './options';
import { formatRouteHandlerCliSummary } from './summary';

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

  const results = await executeRouteHandlerNextPipeline({
    rootDir,
    localeConfig,
    routeHandlersConfig,
    mode: analyzeOnly ? 'analyze' : 'generate'
  });

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results)}\n`);
    return;
  }

  console.log(
    formatNextSlugSplitterMessageLines(
      formatRouteHandlerCliSummary(results, analyzeOnly)
    )
  );
};

main().catch(error => {
  console.error(formatNextSlugSplitterMessage('generation failed'));
  console.error(error);
  process.exit(1);
});
