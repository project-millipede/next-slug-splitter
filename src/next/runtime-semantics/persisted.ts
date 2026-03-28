import path from 'node:path';

import { resolveLocaleConfig } from '../config/locale';
import { isObjectRecord, readObjectProperty } from '../config/shared';

import type { RouteHandlerRuntimeSemantics } from '../types';

const ROUTE_HANDLER_RUNTIME_SEMANTICS_VERSION = 1;
const DEFAULT_RUNTIME_SEMANTICS_PATH = '.next/cache/route-handlers-semantics.json';

const resolvePersistedLocaleConfig = (
  value: unknown
): RouteHandlerRuntimeSemantics['localeConfig'] | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const locales = readObjectProperty(value, 'locales');
  const defaultLocale = readObjectProperty(value, 'defaultLocale');
  if (
    !Array.isArray(locales) ||
    !locales.every(locale => typeof locale === 'string') ||
    typeof defaultLocale !== 'string' ||
    defaultLocale.length === 0
  ) {
    return null;
  }

  try {
    return resolveLocaleConfig({
      i18n: {
        locales,
        defaultLocale
      }
    });
  } catch {
    return null;
  }
};

/**
 * Resolve the persisted runtime-semantics snapshot path.
 *
 * @param rootDir - Application root directory.
 * @returns Absolute path to the semantics snapshot.
 */
export const resolveRouteHandlerRuntimeSemanticsPath = (
  rootDir: string
): string => path.resolve(rootDir, DEFAULT_RUNTIME_SEMANTICS_PATH);

/**
 * Serialize runtime semantics for persistence.
 *
 * @param semantics - Derived runtime semantics snapshot payload.
 * @returns Stable JSON snapshot content.
 */
export const serializeRouteHandlerRuntimeSemantics = (
  semantics: RouteHandlerRuntimeSemantics
): string =>
  JSON.stringify(
    {
      version: ROUTE_HANDLER_RUNTIME_SEMANTICS_VERSION,
      localeConfig: {
        locales: [...semantics.localeConfig.locales],
        defaultLocale: semantics.localeConfig.defaultLocale
      }
    },
    null,
    2
  ) + '\n';

/**
 * Parse persisted runtime semantics snapshot content.
 *
 * @param raw - Raw snapshot file content.
 * @returns Persisted runtime semantics, or `null` when invalid.
 */
export const parseRouteHandlerRuntimeSemantics = (
  raw: string
): RouteHandlerRuntimeSemantics | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!isObjectRecord(parsed)) {
      return null;
    }

    if (
      readObjectProperty(parsed, 'version') !==
      ROUTE_HANDLER_RUNTIME_SEMANTICS_VERSION
    ) {
      return null;
    }

    const localeConfig = resolvePersistedLocaleConfig(
      readObjectProperty(parsed, 'localeConfig')
    );
    if (localeConfig == null) {
      return null;
    }

    return {
      localeConfig
    };
  } catch {
    return null;
  }
};
