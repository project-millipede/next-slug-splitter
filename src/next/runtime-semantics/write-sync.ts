import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  resolveRouteHandlerRuntimeSemanticsPath,
  serializeRouteHandlerRuntimeSemantics
} from './persisted';

import type { RouteHandlerRuntimeSemantics } from '../types';

/**
 * Persist runtime semantics synchronously.
 *
 * @param rootDir - Application root directory.
 * @param semantics - Derived runtime semantics to persist.
 */
export const writeRouteHandlerRuntimeSemanticsSync = (
  rootDir: string,
  semantics: RouteHandlerRuntimeSemantics
): void => {
  const semanticsPath = resolveRouteHandlerRuntimeSemanticsPath(rootDir);
  mkdirSync(path.dirname(semanticsPath), {
    recursive: true
  });
  writeFileSync(
    semanticsPath,
    serializeRouteHandlerRuntimeSemantics(semantics),
    'utf8'
  );
};
