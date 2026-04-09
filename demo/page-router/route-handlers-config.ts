import process from 'node:process';

import type { RouteHandlersConfig } from 'next-slug-splitter/next';

import { routeHandlersConfig as javascriptRouteHandlersConfig } from './config-variants/javascript/route-handlers-config.mjs';
// @ts-expect-error The dev proxy imports this stable selector through native
// ESM resolution, which requires the explicit `.ts` extension here.
import { routeHandlersConfig as typescriptRouteHandlersConfig } from './config-variants/typescript/route-handlers-config.ts';

/**
 * Stable demo route-handlers config selector.
 *
 * The page-router demo keeps two authoring-style variants, and both center on
 * the same package-module component boundary:
 * `packageModule('@demo/components')`.
 *
 * The TypeScript variant import keeps its `.ts` extension explicitly so the
 * dev-only proxy runtime can resolve the inactive variant correctly when this
 * stable selector module is imported outside the main Next build flow.
 */

const supportedVariants = {
  javascript: javascriptRouteHandlersConfig,
  typescript: typescriptRouteHandlersConfig
};

type SupportedVariant = keyof typeof supportedVariants;

/**
 * Pick the active variant from the lifecycle event of the
 * current package-runner script.
 *
 * `npm_lifecycle_event` is the invoked script key from `package.json`, not the
 * shell command body. That means `build` and `build:ts` can both run
 * `next build` while still selecting different route-handlers configs.
 */
const resolveActiveVariant = (
  lifecycleEvent: string | undefined
): SupportedVariant => {
  if (lifecycleEvent == null) {
    return 'javascript';
  }

  if (lifecycleEvent.endsWith(':ts')) {
    return 'typescript';
  }

  return 'javascript';
};

const selectedRouteHandlersConfig =
  supportedVariants[resolveActiveVariant(process.env.npm_lifecycle_event)];

export const routeHandlersConfig: RouteHandlersConfig = {
  ...selectedRouteHandlersConfig,
  app: {
    ...selectedRouteHandlersConfig.app,
    routing: {
      ...selectedRouteHandlersConfig.app?.routing,
      // Prewarm the dev proxy worker during Next startup for a smoother first
      // request in the demo.
      workerPrewarm: 'instrumentation'
    }
  }
};

export default routeHandlersConfig;
