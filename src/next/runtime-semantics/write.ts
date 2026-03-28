import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveRouteHandlerRuntimeSemanticsPath,
  serializeRouteHandlerRuntimeSemantics
} from './persisted';

import type { RouteHandlerRuntimeSemantics } from '../types';

/**
 * Persist runtime semantics asynchronously.
 *
 * @param rootDir - Application root directory.
 * @param semantics - Derived runtime semantics to persist.
 */
export const writeRouteHandlerRuntimeSemantics = async (
  rootDir: string,
  semantics: RouteHandlerRuntimeSemantics
): Promise<void> => {
  const semanticsPath = resolveRouteHandlerRuntimeSemanticsPath(rootDir);
  await mkdir(path.dirname(semanticsPath), {
    recursive: true
  });
  await writeFile(
    semanticsPath,
    serializeRouteHandlerRuntimeSemantics(semantics),
    'utf8'
  );
};
