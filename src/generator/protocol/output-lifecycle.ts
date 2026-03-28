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

import type { RenderedHandlerPage } from './rendered-page';

/**
 * Result of synchronizing one rendered handler page to disk.
 */
export type RenderedHandlerPageSynchronizationStatus =
  | 'written'
  | 'unchanged';

/**
 * Result of removing one emitted handler page path.
 */
export type EmittedHandlerPageRemovalStatus = 'removed' | 'missing';

/**
 * Ensure the generated handlers directory exists.
 *
 * @param handlersDir - Absolute handlers directory path.
 */
export const ensureRouteHandlerOutputDirectory = async (
  handlersDir: string
): Promise<void> => {
  await mkdir(handlersDir, { recursive: true });
};

/**
 * Clear the full generated handlers directory and recreate it empty.
 *
 * @param handlersDir - Absolute handlers directory path.
 *
 * @remarks
 * This is intentionally still available because the full target reconciler has
 * a historical fallback mode when there is no trustworthy prior manifest. The
 * lazy one-route path should not normally call this because it only owns
 * narrow route-local reconciliation.
 */
export const clearRouteHandlerOutputDirectory = async (
  handlersDir: string
): Promise<void> => {
  await rm(handlersDir, { recursive: true, force: true });
  await ensureRouteHandlerOutputDirectory(handlersDir);
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
 * @param startPath - Directory to start pruning from.
 * @param stopPath - Directory boundary that must be preserved.
 * @returns A promise that settles after empty directories have been pruned.
 *
 * @remarks
 * Generated handler directories are nested by slug/locale. When one emitted
 * page disappears, some of those intermediate directories may become empty and
 * should be removed as well. The stop boundary keeps pruning scoped to the
 * handlers directory owned by the current target.
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
 * @param page - Fully rendered handler page artifact.
 * @returns Whether the page had to be written or was already current.
 *
 * @remarks
 * This is the narrow "ensure present and current" primitive shared by:
 * - target-wide selective emission for desired pages
 * - lazy one-file dev emission after a heavy-route analysis result
 *
 * It compares full source text rather than output hashes so callers do not
 * need to repeat that logic or own direct file reads.
 */
export const synchronizeRenderedRouteHandlerPage = async (
  page: RenderedHandlerPage
): Promise<RenderedHandlerPageSynchronizationStatus> => {
  const existingSource = await readRouteHandlerOutputFileIfPresent(
    page.pageFilePath
  );

  if (existingSource === page.pageSource) {
    return 'unchanged';
  }

  await mkdir(path.dirname(page.pageFilePath), { recursive: true });
  await writeFile(page.pageFilePath, page.pageSource, 'utf8');
  return 'written';
};

/**
 * Remove one emitted handler page if it exists.
 *
 * @param pageFilePath - Absolute emitted page path.
 * @param handlersDir - Handlers-directory boundary for empty-directory
 * pruning.
 * @returns Whether a file was removed or nothing existed to remove.
 *
 * @remarks
 * This primitive is shared by:
 * - full target-wide stale-file reconciliation
 * - lazy stale-output cleanup when one previously emitted route becomes light
 *   or disappears
 */
export const removeRenderedRouteHandlerPageIfPresent = async (
  pageFilePath: string,
  handlersDir: string
): Promise<EmittedHandlerPageRemovalStatus> => {
  try {
    await unlink(pageFilePath);
  } catch {
    return 'missing';
  }

  await removeEmptyRouteHandlerDirectoriesUpTo(
    path.dirname(pageFilePath),
    handlersDir
  );
  return 'removed';
};
