#!/usr/bin/env node

import process from 'process';

import { requireAppRouteHandlersConfig } from '../next/app/config/router-kind';
import { loadSlugSplitterConfigFromPath } from '../next/integration/slug-splitter-config-loader';
import { executeRouteHandlerNextPipeline as executeAppRouteHandlerNextPipeline } from '../next/app/runtime/pipeline';
import { requirePagesRouteHandlersConfig } from '../next/pages/config/router-kind';
import { executeRouteHandlerNextPipeline } from '../next/pages/runtime';
import { resolveRouteHandlerRouterKind } from '../next/shared/config/router-kind';
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
  const results =
    resolveRouteHandlerRouterKind(routeHandlersConfig) === 'app'
      ? await executeAppRouteHandlerNextPipeline({
          rootDir,
          localeConfig,
          routeHandlersConfig: requireAppRouteHandlersConfig(
            routeHandlersConfig,
            'The App Router CLI path'
          ),
          mode: analyzeOnly ? 'analyze' : 'generate'
        })
      : await executeRouteHandlerNextPipeline({
          rootDir,
          localeConfig,
          routeHandlersConfig: requirePagesRouteHandlersConfig(
            routeHandlersConfig,
            'The Pages Router CLI path'
          ),
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
