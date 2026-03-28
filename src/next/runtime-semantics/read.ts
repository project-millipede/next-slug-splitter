import { readFile } from 'node:fs/promises';

import {
  parseRouteHandlerRuntimeSemantics,
  resolveRouteHandlerRuntimeSemanticsPath
} from './persisted';

import type { RouteHandlerRuntimeSemantics } from '../types';

/**
 * Read the persisted runtime-semantics snapshot.
 *
 * @param rootDir - Application root directory.
 * @returns Persisted runtime semantics, or `null` when missing/invalid.
 */
export const readRouteHandlerRuntimeSemantics = async (
  rootDir: string
): Promise<RouteHandlerRuntimeSemantics | null> => {
  const semanticsPath = resolveRouteHandlerRuntimeSemanticsPath(rootDir);

  try {
    return parseRouteHandlerRuntimeSemantics(
      await readFile(semanticsPath, 'utf8')
    );
  } catch {
    return null;
  }
};
