import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Run a test callback inside a temporary directory that is cleaned up
 * afterwards.
 *
 * @param prefix Prefix used when creating the temporary directory.
 * @param run Async callback that receives the temporary root directory.
 * @returns A promise that resolves once the callback finishes and cleanup runs.
 */
export const withTempDir = async (
  prefix: string,
  run: (rootDir: string) => Promise<void>
): Promise<void> => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
};
