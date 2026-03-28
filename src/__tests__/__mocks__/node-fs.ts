/**
 * Shared test mock for `node:fs`.
 *
 * Tests opt into this module with:
 *
 * `vi.mock(import('node:fs'), () => import('../__mocks__/node-fs'))`
 *
 * The implementation delegates to `memfs`, so tests can model filesystem
 * topology without touching the real disk.
 *
 * Use `src/__tests__/__utils__/mock-fs.ts` to reset and seed the virtual
 * filesystem from individual test files.
 */
import { fs } from 'memfs';

export type NodeFsMock = Pick<
  typeof import('node:fs'),
  | 'accessSync'
  | 'statSync'
  | 'existsSync'
  | 'readFileSync'
  | 'writeFileSync'
  | 'mkdirSync'
  | 'readdirSync'
  | 'unlinkSync'
  | 'rmSync'
>;

/**
 * Raw `memfs`-backed mock implementation.
 *
 * Keep this unexported so TypeScript does not try to name `memfs`' internal
 * helper types in the public test surface.
 */
const rawNodeFsMock = {
  accessSync: fs.accessSync,
  statSync: fs.statSync,
  existsSync: fs.existsSync,
  readFileSync: fs.readFileSync,
  writeFileSync: fs.writeFileSync,
  mkdirSync: fs.mkdirSync,
  readdirSync: fs.readdirSync,
  unlinkSync: fs.unlinkSync,
  rmSync: fs.rmSync
};

/**
 * Shared `node:fs` subset exposed to Vitest.
 *
 * The single cast is isolated at the export boundary so the rest of the file
 * stays readable.
 */
export const nodeFsMock = rawNodeFsMock as unknown as NodeFsMock;
