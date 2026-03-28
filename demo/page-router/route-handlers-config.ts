import path from 'node:path';
import process from 'node:process';

/**
 * Stable demo route-handlers config selector.
 *
 * The active variant is derived from the current package-runner lifecycle
 * event, but this file exports only the selected config module path.
 *
 * Keeping the selector path-based avoids eagerly importing all variants into
 * the stable root entrypoint, which would force TypeScript to validate
 * inactive `.ts`-extension imports before the lifecycle-based selection runs.
 */

const rootDir = process.cwd();

const supportedVariants = {
  javascript: path.resolve(
    rootDir,
    'config-variants/javascript/route-handlers-config.mjs'
  ),
  typescript: path.resolve(
    rootDir,
    'config-variants/typescript/route-handlers-config.ts'
  ),
  'javascript-package': path.resolve(
    rootDir,
    'config-variants/javascript-package/route-handlers-config.mjs'
  ),
  'typescript-package': path.resolve(
    rootDir,
    'config-variants/typescript-package/route-handlers-config.ts'
  )
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

export const routeHandlersConfigPath =
  supportedVariants[resolveActiveVariant(process.env.npm_lifecycle_event)];

export default routeHandlersConfigPath;
