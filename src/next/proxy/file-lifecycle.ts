import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { Project, IndentationText, QuoteKind, ScriptKind } from 'ts-morph';

import { createRuntimeError } from '../../utils/errors';
import { type RouteHandlerRoutingStrategy } from '../policy/routing-strategy';
import {
  buildRouteHandlerProxyMatchers,
  ROUTE_HANDLER_PROXY_OWNERSHIP_MARKER
} from './runtime/shared';

import type { ResolvedRouteHandlersConfig } from '../types';
import type { LocaleConfig } from '../../core/types';

const ROOT_PROXY_FILE_PATH = 'proxy.ts';
const ROOT_PROXY_JS_FILE_PATH = 'proxy.js';
const ROOT_MIDDLEWARE_FILE_PATH = 'middleware.ts';
const ROOT_MIDDLEWARE_JS_FILE_PATH = 'middleware.js';
const SRC_PROXY_FILE_PATH = path.join('src', 'proxy.ts');
const SRC_PROXY_JS_FILE_PATH = path.join('src', 'proxy.js');
const SRC_MIDDLEWARE_FILE_PATH = path.join('src', 'middleware.ts');
const SRC_MIDDLEWARE_JS_FILE_PATH = path.join('src', 'middleware.js');

/**
 * Resolve the plugin-owned generated root proxy file path.
 *
 * @param rootDir - Application root directory.
 * @returns Absolute file path for the generated `proxy.ts`.
 */
const resolveGeneratedProxyFilePath = (rootDir: string): string =>
  // The generated file deliberately lives at the app root because that is the
  // file-convention location Next scans for Proxy participation. We do not use
  // `src/proxy.ts` for the synthetic file because the root path is the most
  // explicit and easiest location for developers to observe during experiments.
  path.join(rootDir, ROOT_PROXY_FILE_PATH);

/**
 * List every root-level file convention that would conflict with plugin-owned
 * Proxy generation.
 *
 * @param rootDir - Application root directory.
 * @returns Absolute file paths that must remain app-owned.
 */
const resolveProxyConflictCandidates = (rootDir: string): Array<string> => [
  path.join(rootDir, ROOT_PROXY_FILE_PATH),
  path.join(rootDir, ROOT_PROXY_JS_FILE_PATH),
  path.join(rootDir, ROOT_MIDDLEWARE_FILE_PATH),
  path.join(rootDir, ROOT_MIDDLEWARE_JS_FILE_PATH),
  path.join(rootDir, SRC_PROXY_FILE_PATH),
  path.join(rootDir, SRC_PROXY_JS_FILE_PATH),
  path.join(rootDir, SRC_MIDDLEWARE_FILE_PATH),
  path.join(rootDir, SRC_MIDDLEWARE_JS_FILE_PATH)
];

/**
 * Read a file when present and return `null` when it does not exist.
 *
 * @param filePath - Absolute file path.
 * @returns Source text or `null`.
 */
const readFileIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    // Existence probing is the only purpose of this helper. Missing files are a
    // normal outcome during cleanup and conflict checks, so callers get `null`
    // instead of an exception and can keep their branch logic focused on
    // ownership semantics rather than filesystem error handling.
    return null;
  }
};

/**
 * Determine whether a file is owned by the plugin-generated proxy lifecycle.
 *
 * @param sourceText - Source text to inspect.
 * @returns `true` when the ownership marker is present.
 */
const isPluginOwnedProxyFile = (sourceText: string): boolean =>
  sourceText.includes(ROUTE_HANDLER_PROXY_OWNERSHIP_MARKER);

/**
 * Render a single-quoted JavaScript string literal.
 *
 * @param value - Raw string value.
 * @returns Stable single-quoted literal.
 */
const renderStringLiteral = (value: string): string =>
  JSON.stringify(value).replaceAll('"', "'");

/**
 * Render either a stable single-quoted string literal or `undefined`.
 *
 * @param value - Optional raw string value.
 * @returns Literal source text.
 */
const renderOptionalStringLiteral = (value: string | undefined): string =>
  value == null ? 'undefined' : renderStringLiteral(value);

/**
 * Render a static array of single-quoted strings.
 *
 * @param values - Raw string values.
 * @returns Static array literal for generated source.
 */
const renderStaticStringArray = (values: Array<string>): string =>
  `[${values.map(renderStringLiteral).join(', ')}]`;

/**
 * Render a static locale-config object literal for generated source.
 *
 * @param localeConfig - Shared app locale configuration.
 * @returns Stable object literal text.
 */
const renderLocaleConfigLiteral = (localeConfig: LocaleConfig): string =>
  // Locale config is embedded into the generated root file so the package-owned
  // proxy runtime does not need to import the app's `next.config.*` at request
  // time. That keeps the runtime path independent from Next's config loading
  // mechanics and avoids `.ts` config import problems inside Proxy execution.
  [
    '{',
    `  locales: ${renderStaticStringArray(localeConfig.locales)},`,
    `  defaultLocale: ${renderStringLiteral(localeConfig.defaultLocale)}`,
    '}'
  ].join('\n');

/**
 * Render the adapter-time config registration that the thin Proxy runtime must
 * forward into the dev-only worker boundary.
 *
 * @param input - Registration input.
 * @param input.configPath - Absolute app-owned config path when one exists.
 * @param input.rootDir - True app root captured during `next.config.*`
 * evaluation.
 * @returns Stable object literal text.
 *
 * @remarks
 * Locale config alone is not enough for the dev-only worker path. The worker
 * must also know where the app-owned splitter config lives so it can load it
 * in a fresh child Node process. We intentionally embed that registration into
 * the generated root `proxy.ts` instead of hoping it survives later through
 * `process.env`, because the special Next Proxy runtime does not guarantee that
 * request-time access to ad-hoc process registration behaves like ordinary
 * Node.
 */
const renderConfigRegistrationLiteral = ({
  configPath,
  rootDir
}: {
  configPath?: string;
  rootDir?: string;
}): string =>
  [
    '{',
    `  configPath: ${renderOptionalStringLiteral(configPath)},`,
    `  rootDir: ${renderOptionalStringLiteral(rootDir)}`,
    '}'
  ].join('\n');

/**
 * Render the plugin-owned root `proxy.ts` source.
 *
 * @param input - Source rendering input.
 * @param input.matchers - Static matcher list for the generated proxy file.
 * @returns Complete TypeScript source text.
 *
 * @remarks
 * The generated file intentionally stays tiny. It owns only:
 * - the root file convention presence that Next scans
 * - the static `config.matcher` literal required by Next
 * - a delegation call back into the library-owned proxy runtime
 *
 * All request-routing semantics live in the package module imported below, so
 * the generated root file is purely a bridge between Next's file convention
 * system and our internal runtime logic.
 */
const renderRouteHandlerProxySource = ({
  matchers,
  localeConfig,
  configRegistration
}: {
  matchers: Array<string>;
  localeConfig: LocaleConfig;
  configRegistration?: {
    configPath?: string;
    rootDir?: string;
  };
}): string =>
  [
    '/**',
    ` * ${ROUTE_HANDLER_PROXY_OWNERSHIP_MARKER}`,
    ' *',
    ' * This file is generated by next-slug-splitter for the dev-only proxy',
    ' * routing strategy. It intentionally stays very small: Next only needs',
    ' * this root file so it can discover Proxy, while the actual request',
    ' * routing logic lives inside the package entry imported below.',
    ' */',
    "import type { NextRequest } from 'next/server';",
    "import { proxy as routeHandlerProxy } from 'next-slug-splitter/next/proxy';",
    '',
    'const LOCALE_CONFIG = ' + renderLocaleConfigLiteral(localeConfig) + ';',
    'const CONFIG_REGISTRATION = ' +
      renderConfigRegistrationLiteral({
        configPath: configRegistration?.configPath,
        rootDir: configRegistration?.rootDir
      }) +
      ';',
    '',
    'export function proxy(request: NextRequest) {',
    '  return routeHandlerProxy(request, {',
    '    localeConfig: {',
    '      locales: [...LOCALE_CONFIG.locales],',
    '      defaultLocale: LOCALE_CONFIG.defaultLocale',
    '    },',
    '    configRegistration: {',
    '      configPath: CONFIG_REGISTRATION.configPath,',
    '      rootDir: CONFIG_REGISTRATION.rootDir',
    '    }',
    '  });',
    '}',
    '',
    'export const config = {',
    `  matcher: ${renderStaticStringArray(matchers)}`,
    '};',
    ''
  ].join('\n');

/**
 * Write the plugin-owned root `proxy.ts`.
 *
 * @param input - File write input.
 * @param input.proxyFilePath - Absolute output path.
 * @param input.matchers - Static matcher list to embed.
 */
const writeGeneratedProxyFile = async ({
  proxyFilePath,
  matchers,
  localeConfig,
  configRegistration
}: {
  proxyFilePath: string;
  matchers: Array<string>;
  localeConfig: LocaleConfig;
  configRegistration?: {
    configPath?: string;
    rootDir?: string;
  };
}): Promise<void> => {
  // `ts-morph` is used even though the file is small because it gives us a
  // deterministic save/format pipeline and keeps generated output readable when
  // developers inspect the synthetic root file during the experiment.
  const project = new Project({
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single
    },
    useInMemoryFileSystem: false
  });
  const sourceFile = project.createSourceFile(
    proxyFilePath,
    renderRouteHandlerProxySource({
      matchers,
      localeConfig,
      configRegistration
    }),
    {
      overwrite: true,
      scriptKind: ScriptKind.TS
    }
  );

  sourceFile.formatText();
  await sourceFile.save();
};

/**
 * Ensure no app-owned Proxy or legacy middleware files would be overwritten.
 *
 * @param input - Conflict check input.
 * @param input.rootDir - Application root directory.
 * @param input.generatedProxyFilePath - Absolute path for the plugin-owned file.
 */
const assertNoProxyConflicts = async ({
  rootDir,
  generatedProxyFilePath
}: {
  rootDir: string;
  generatedProxyFilePath: string;
}): Promise<void> => {
  for (const candidateFilePath of resolveProxyConflictCandidates(rootDir)) {
    const sourceText = await readFileIfExists(candidateFilePath);

    if (sourceText == null) {
      // No file means no ownership decision is needed, so we simply continue
      // scanning the remaining convention locations.
      continue;
    }

    if (
      candidateFilePath === generatedProxyFilePath &&
      isPluginOwnedProxyFile(sourceText)
    ) {
      // A previous plugin-generated file is safe to replace in place. This is
      // the normal in-place update path when the strategy stays enabled across
      // runs.
      continue;
    }

    const fileName = path.basename(candidateFilePath);
    const conflictKind = fileName.startsWith('middleware')
      ? 'middleware'
      : 'proxy';

    // Any pre-existing app-owned proxy or middleware file is treated as a hard
    // conflict. The library must never silently override those files because
    // they represent framework-level routing owned by the application itself.
    throw createRuntimeError(
      `Route-handler proxy strategy cannot run because an existing app-owned ${conflictKind} file is present.`,
      {
        filePath: candidateFilePath
      }
    );
  }
};

/**
 * Remove the plugin-owned root `proxy.ts` when present.
 *
 * @param input - Removal input.
 * @param input.rootDir - Application root directory.
 */
const removeGeneratedProxyFileIfPresent = async ({
  rootDir
}: {
  rootDir: string;
}): Promise<void> => {
  const proxyFilePath = resolveGeneratedProxyFilePath(rootDir);
  const sourceText = await readFileIfExists(proxyFilePath);

  if (sourceText == null || !isPluginOwnedProxyFile(sourceText)) {
    // Cleanup must never delete user-owned files. The ownership marker is the
    // hard guardrail that keeps this lifecycle safe.
    return;
  }

  // Once ownership is confirmed, deletion is unconditional. We do not keep the
  // stale file around because its mere presence changes how Next boots.
  await unlink(proxyFilePath);
};

/**
 * Synchronize the root `proxy.ts` file with the selected routing strategy.
 *
 * @param input - Synchronization input.
 * @param input.rootDir - Application root directory.
 * @param input.strategy - Active routing strategy.
 * @param input.resolvedConfigs - Fully resolved target configs for matcher generation.
 *
 * @remarks
 * This module owns only filesystem presence:
 * - create the proxy file when proxy routing is active
 * - remove the proxy file when rewrite routing is active
 *
 * It does not decide how requests are routed once Proxy runs. That concern
 * lives in `proxy/request-routing.ts`, which is entered through the thin
 * `proxy/runtime.ts` bridge exported by the package.
 */
export const synchronizeRouteHandlerProxyFile = async ({
  rootDir,
  strategy,
  resolvedConfigs,
  configRegistration
}: {
  rootDir: string;
  strategy: RouteHandlerRoutingStrategy;
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
  configRegistration?: {
    configPath?: string;
    rootDir?: string;
  };
}): Promise<void> => {
  if (strategy.kind !== 'proxy') {
    // Rewrite mode must actively clean up a stale plugin-generated proxy file
    // so later runs do not continue to route through Proxy by accident.
    await removeGeneratedProxyFileIfPresent({
      rootDir
    });
    return;
  }

  const generatedProxyFilePath = resolveGeneratedProxyFilePath(rootDir);
  await assertNoProxyConflicts({
    rootDir,
    generatedProxyFilePath
  });
  // We intentionally take locale config from the resolved targets rather than
  // loading app config again inside the generated file. Locale config is shared
  // across resolved targets, so capturing the first resolved config keeps the
  // root file self-contained while avoiding duplicated config loading paths.
  await writeGeneratedProxyFile({
    proxyFilePath: generatedProxyFilePath,
    matchers: buildRouteHandlerProxyMatchers(resolvedConfigs),
    localeConfig: resolvedConfigs[0].localeConfig,
    configRegistration
  });
};
