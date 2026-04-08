import process from 'node:process';

import type { RouteHandlersConfig } from 'next-slug-splitter/next';

import { routeHandlersConfig as javascriptRouteHandlersConfig } from './config-variants/javascript/route-handlers-config.mjs';
// @ts-expect-error The dev proxy imports this stable selector through native
// ESM resolution, which requires the explicit `.ts` extension here.
import { routeHandlersConfig as typescriptRouteHandlersConfig } from './config-variants/typescript/route-handlers-config.ts';
import { routeHandlersConfig as javascriptPackageRouteHandlersConfig } from './config-variants/javascript-package/route-handlers-config.mjs';
// @ts-expect-error The dev proxy imports this stable selector through native
// ESM resolution, which requires the explicit `.ts` extension here.
import { routeHandlersConfig as typescriptPackageRouteHandlersConfig } from './config-variants/typescript-package/route-handlers-config.ts';

/**
 * Stable demo route-handlers config selector.
 *
 * The active variant is derived from the current package-runner lifecycle
 * event, and this file exports the selected config object.
 *
 * The TypeScript variant imports keep their `.ts` extensions explicitly so
 * the dev-only proxy runtime can resolve the inactive variants correctly when
 * this stable selector module is imported outside the main Next build flow.
 */

const supportedVariants = {
  javascript: javascriptRouteHandlersConfig,
  typescript: typescriptRouteHandlersConfig,
  'javascript-package': javascriptPackageRouteHandlersConfig,
  'typescript-package': typescriptPackageRouteHandlersConfig
};

type SupportedVariant = keyof typeof supportedVariants;

/**
 * Pick the active config variant from the lifecycle event of the current
 * package-runner script.
 *
 * The selector only cares about the shared variant suffixes (`:ts`,
 * `:js-pkg`, `:ts-pkg`) so `dev`, `build`, and `start` stay aligned without
 * each integration point needing its own variant switch.
 *
 * `npm_lifecycle_event` is the invoked script key from `package.json`, not the
 * shell command body. That means `build` and `build:ts` can both run
 * `next build` while still selecting different route-handlers configs.
 *
 * Examples:
 * - `pnpm build` -> `npm_lifecycle_event = "build"` -> `javascript`
 * - `pnpm build:ts` -> `npm_lifecycle_event = "build:ts"` -> `typescript`
 * - `pnpm start:js-pkg` -> `npm_lifecycle_event = "start:js-pkg"` ->
 *   `javascript-package`
 *
 * @param lifecycleEvent - Invoked `package.json` script key from
 * `npm_lifecycle_event`.
 * @returns Selected config variant for the current lifecycle event.
 */
const resolveActiveVariant = (
  lifecycleEvent: string | undefined
): SupportedVariant => {
  if (lifecycleEvent == null) {
    return 'javascript';
  }

  if (lifecycleEvent.endsWith(':ts-pkg')) {
    return 'typescript-package';
  }

  if (lifecycleEvent.endsWith(':js-pkg')) {
    return 'javascript-package';
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
      workerPrewarm: 'instrumentation'
    }
  }
};

export default routeHandlersConfig;
