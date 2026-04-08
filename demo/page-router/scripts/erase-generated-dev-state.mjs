import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Remove a file or directory if it exists.
 *
 * @param targetPath - Absolute path to remove.
 */
const removeIfPresent = async targetPath => {
  await rm(targetPath, {
    force: true,
    recursive: true
  });
};

/**
 * Resolve the Millipede app root from this script location.
 *
 * @returns Absolute app root directory.
 */
const resolveAppRootDir = () => {
  const scriptFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptFilePath), '..');
};

/**
 * Discover generated route-handler directories below the app `pages` tree.
 *
 * @param appRootDir - Absolute app root directory.
 * @returns Absolute `_handlers` directories.
 */
const discoverGeneratedHandlerDirs = async appRootDir => {
  const pagesDir = path.join(appRootDir, 'pages');
  const discoveredHandlerDirs = [];

  /**
   * Walk one directory subtree and collect `_handlers` directories.
   *
   * @param currentDir - Absolute directory currently being inspected.
   */
  const walk = async currentDir => {
    let entries;

    try {
      entries = await readdir(currentDir, {
        withFileTypes: true
      });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async entry => {
        if (!entry.isDirectory()) {
          return;
        }

        const entryPath = path.join(currentDir, entry.name);

        if (entry.name === '_handlers') {
          discoveredHandlerDirs.push(entryPath);
          return;
        }

        await walk(entryPath);
      })
    );
  };

  await walk(pagesDir);
  return discoveredHandlerDirs.sort((left, right) => left.localeCompare(right));
};

/**
 * Build the set of generated dev-state paths that should be erased together.
 *
 * @param appRootDir - Absolute app root directory.
 * @returns Absolute paths to remove.
 *
 * @remarks
 * This script intentionally targets only plugin/dev-generated state:
 * - `.next`
 * - root `proxy.ts`
 * - root `instrumentation.ts`
 * - every generated route-handler page folder below `pages`
 *
 * Keeping this list explicit avoids accidentally turning the command into a
 * broad project cleanup that removes unrelated files.
 */
const readGeneratedDevStatePaths = async appRootDir => [
  path.join(appRootDir, '.next'),
  path.join(appRootDir, 'proxy.ts'),
  path.join(appRootDir, 'instrumentation.ts'),
  ...(await discoverGeneratedHandlerDirs(appRootDir))
];

/**
 * Erase all known generated slug-splitter/Next dev state for the app.
 */
const main = async () => {
  const appRootDir = resolveAppRootDir();
  const generatedDevStatePaths = await readGeneratedDevStatePaths(appRootDir);

  await Promise.all(
    generatedDevStatePaths.map(generatedPath => removeIfPresent(generatedPath))
  );
};

await main();
