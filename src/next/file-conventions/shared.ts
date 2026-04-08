import { readFile } from 'node:fs/promises';

import type { LocaleConfig } from '../../core/types';

/**
 * Read a file when present and return `null` when it does not exist.
 *
 * @param filePath - Absolute file path.
 * @returns Source text or `null`.
 */
export const readFileIfExists = async (
  filePath: string
): Promise<string | null> => {
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
 * Render a single-quoted JavaScript string literal.
 *
 * @param value - Raw string value.
 * @returns Stable single-quoted literal.
 */
export const renderStringLiteral = (value: string): string =>
  JSON.stringify(value).replaceAll('"', "'");

/**
 * Render either a stable single-quoted string literal or `undefined`.
 *
 * @param value - Optional raw string value.
 * @returns Literal source text.
 */
export const renderOptionalStringLiteral = (
  value: string | undefined
): string => (value == null ? 'undefined' : renderStringLiteral(value));

/**
 * Render a static array of single-quoted strings.
 *
 * @param values - Raw string values.
 * @returns Static array literal for generated source.
 */
export const renderStaticStringArray = (values: Array<string>): string =>
  `[${values.map(renderStringLiteral).join(', ')}]`;

/**
 * Render a static locale-config object literal for generated source.
 *
 * @param localeConfig - Shared app locale configuration.
 * @returns Stable object literal text.
 */
export const renderLocaleConfigLiteral = (localeConfig: LocaleConfig): string =>
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
 * @param configPath - Absolute app-owned config path when one exists.
 * @param rootDir - True app root captured during `next.config.*`
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
export const renderConfigRegistrationLiteral = (
  configPath?: string,
  rootDir?: string
): string =>
  [
    '{',
    `  configPath: ${renderOptionalStringLiteral(configPath)},`,
    `  rootDir: ${renderOptionalStringLiteral(rootDir)}`,
    '}'
  ].join('\n');
