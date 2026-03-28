/**
 * Virtual File System Test Service
 *
 * Provides a clean API for controlling the in-memory filesystem (`memfs`)
 * used during tests. Tests import from this service — never from `memfs`
 * directly.
 *
 * Prerequisites:
 * - The test file must call `vi.mock(...)` for `node:fs` and/or
 *   `node:fs/promises`, pointing at the shared test mocks under
 *   `src/__tests__/__mocks__`.
 * - This is a Vitest requirement because `vi.mock` is hoisted at compile time
 *   and must appear in the test file or a configured setup file.
 */
import { vol } from 'memfs';

/**
 * Resets the in-memory volume to an empty state.
 *
 * Call inside `beforeEach` to guarantee isolation between tests.
 */
export function resetMockFs() {
  vol.reset();
}

/**
 * Seeds the virtual filesystem with empty files at the given absolute paths.
 *
 * @param filePaths - Absolute paths of files that should "exist" on the
 * virtual disk.
 */
export function seedMockFsFiles(filePaths: string[]) {
  /**
   * Convert each input path into the tuple shape used by `Object.fromEntries`:
   * 1. index `0` is the absolute file path
   * 2. index `1` is the file contents
   * 3. `''` means the file should exist with zero text content
   */
  const tree = Object.fromEntries(
    filePaths.map(filePath => [filePath, ''])
  );

  /**
   * `memfs` treats this object as a full in-memory filesystem snapshot:
   * 1. each absolute path becomes a file on the virtual disk
   * 2. the mapped string becomes that file's contents
   * 3. later reads, stats, and existence checks observe those files without
   *    touching the host filesystem
   */
  vol.fromJSON(tree);
}
