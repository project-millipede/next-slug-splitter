/**
 * Shared filesystem lifecycle protocol for emitted handler pages.
 *
 * @remarks
 * The codebase now has two executors that manipulate generated handler files:
 * - the full target-wide reconciler
 * - the lazy one-route dev proxy path
 *
 * They differ in scope, but they should not differ in how they perform the
 * underlying filesystem transitions. This module therefore centralizes the
 * primitive lifecycle operations that both executors need:
 * - ensure the handlers directory exists
 * - clear the handlers directory when a full rebuild is required
 * - detect whether one emitted page file exists
 * - synchronize one rendered page file by contents
 * - remove one emitted page file and prune empty directories
 *
 * Higher-level modules remain responsible for deciding *when* each transition
 * should happen. This module is only about *how* the transition is performed.
 */
import {
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';

import type { RenderedHandlerPage } from '../../pages/protocol/rendered-page';

/**
 * Result of removing one emitted handler page path.
 */
export type EmittedHandlerPageRemovalStatus = 'removed' | 'missing';

/**
 * Result of synchronizing one rendered handler page to disk.
 *
 * @remarks
 * The lazy dev proxy path needs to distinguish:
 * - `unchanged`: on-disk source already matched the freshly rendered handler
 * - `created`: no handler file existed before this synchronization
 * - `updated`: a handler file existed and was overwritten with new source
 *
 * That distinction matters because overwriting an already-known handler path
 * can require one extra request boundary before Next/Turbopack executes the
 * new module graph reliably.
 */
export type RouteHandlerOutputSynchronizationStatus =
  | 'unchanged'
  | 'created'
  | 'updated';

/**
 * Ensure the generated handlers directory exists.
 *
 * @param generatedDir - Absolute generated-handler directory path.
 */
export const ensureRouteHandlerOutputDirectory = async (
  generatedDir: string
): Promise<void> => {
  await mkdir(generatedDir, { recursive: true });
};

/**
 * Clear the full generated handlers directory and recreate it empty.
 *
 * @remarks
 * This is intentionally still available because the full target reconciler has
 * a historical fallback mode when there is no trustworthy prior manifest. The
 * lazy one-route path should not normally call this because it only owns
 * narrow route-local reconciliation.
 *
 * @param generatedDir - Absolute generated-handler directory path.
 */
export const clearRouteHandlerOutputDirectory = async (
  generatedDir: string
): Promise<void> => {
  await rm(generatedDir, { recursive: true, force: true });
  await ensureRouteHandlerOutputDirectory(generatedDir);
};

/**
 * Check whether one emitted handler page file currently exists on disk.
 *
 * @param pageFilePath - Absolute emitted page path.
 * @returns `true` when the file exists.
 */
export const doesRouteHandlerOutputFileExist = async (
  pageFilePath: string
): Promise<boolean> => {
  try {
    await stat(pageFilePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read one emitted page file when present and return `null` otherwise.
 *
 * @param pageFilePath - Absolute emitted page path.
 * @returns File contents when present, otherwise `null`.
 */
const readRouteHandlerOutputFileIfPresent = async (
  pageFilePath: string
): Promise<string | null> => {
  try {
    return await readFile(pageFilePath, 'utf8');
  } catch {
    return null;
  }
};

/**
 * Remove empty parent directories after one emitted page file was deleted.
 *
 * @remarks
 * Generated handler directories are nested by slug/locale. When one emitted
 * page disappears, some of those intermediate directories may become empty and
 * should be removed as well. The stop boundary keeps pruning scoped to the
 * handlers directory owned by the current target.
 *
 * @param startPath - Directory to start pruning from.
 * @param stopPath - Directory boundary that must be preserved.
 * @returns A promise that settles after empty directories have been pruned.
 */
const removeEmptyRouteHandlerDirectoriesUpTo = async (
  startPath: string,
  stopPath: string
): Promise<void> => {
  let currentPath = startPath;

  while (currentPath !== stopPath && currentPath.startsWith(stopPath)) {
    const entries = await readdir(currentPath);
    if (entries.length > 0) {
      break;
    }

    await rmdir(currentPath);
    currentPath = path.dirname(currentPath);
  }
};

/**
 * Synchronize one rendered handler page to disk by contents.
 *
 * @remarks
 * This is the narrow "ensure present and current" primitive shared by:
 * - target-wide selective emission for desired pages
 * - lazy one-file dev emission after a heavy-route analysis result
 *
 * Callers arrive here only after the expected handler module has already been
 * rendered in memory. That render step happens in
 * `renderRouteHandlerPage(...)`, which produces the `page.pageSource` string
 * for the concrete heavy route being synchronized.
 *
 * This function then performs the actual on-disk synchronization step:
 * - read the current emitted handler file, if one exists
 * - compare its full contents to the freshly rendered `page.pageSource`
 * - write only when those contents differ
 *
 * There is no separate emitted-handler manifest or output-hash trust check in
 * this path. Handler rewrite decisions are based on direct file read plus full
 * source comparison against the freshly rendered in-memory module source.
 *
 * @param page - Fully rendered handler page artifact.
 */
export const synchronizeRenderedRouteHandlerPage = async (
  page: RenderedHandlerPage
): Promise<RouteHandlerOutputSynchronizationStatus> => {
  const existingSource = await readRouteHandlerOutputFileIfPresent(
    page.pageFilePath
  );

  if (existingSource === page.pageSource) {
    return 'unchanged';
  }

  const synchronizationStatus =
    existingSource == null ? 'created' : 'updated';

  await mkdir(path.dirname(page.pageFilePath), { recursive: true });
  await writeFile(page.pageFilePath, page.pageSource, 'utf8');
  return synchronizationStatus;
};

/**
 * Remove one emitted handler page if it exists.
 *
 * @remarks
 * This primitive is shared by:
 * - full target-wide stale-file reconciliation
 * - lazy stale-output cleanup when one previously emitted route becomes light
 *   or disappears
 *
 * @param pageFilePath - Absolute emitted page path.
 * @param generatedDir - Generated-directory boundary for empty-directory
 * pruning.
 * @returns Whether a file was removed or nothing existed to remove.
 */
export const removeRenderedRouteHandlerPageIfPresent = async (
  pageFilePath: string,
  generatedDir: string
): Promise<EmittedHandlerPageRemovalStatus> => {
  try {
    await unlink(pageFilePath);
  } catch {
    return 'missing';
  }

  await removeEmptyRouteHandlerDirectoriesUpTo(
    path.dirname(pageFilePath),
    generatedDir
  );
  return 'removed';
};
