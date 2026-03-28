import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { absoluteModule, packageModule, relativeModule } from '../../module-reference/create';
import {
  resolveModuleReferenceToFilePath,
  resolveModuleReferenceToPath
} from '../../module-reference/resolve';
import type { ModuleReference } from '../../module-reference/types';

import { resetMockFs, seedMockFsFiles } from '../__utils__/mock-fs';

// Activate the shared memfs virtual filesystem (see `__utils__/mock-fs.ts`).
vi.mock(
  import('node:fs'),
  async () =>
    (await import('../__mocks__/node-fs')).nodeFsMock
);

const ROOT = path.resolve('/app');

/** Reset the virtual volume before each test to prevent state leaking. */
beforeEach(() => {
  resetMockFs();
});

describe('resolveModuleReferenceToPath', () => {
  type Scenario = {
    id: string;
    description: string;
    reference: ModuleReference;
    expected: string;
    filesToMock?: string[];
  };

  const scenarios: Scenario[] = [
    {
      id: 'Local-Exact',
      description: 'Resolves absolute file reference with literal extension',
      reference: absoluteModule(path.join(ROOT, 'src/config.ts')),
      expected: path.join(ROOT, 'src/config.ts'),
      filesToMock: ['/app/src/config.ts']
    },
    {
      id: 'Local-Probe',
      description: 'Resolves absolute file reference without extension by probing',
      reference: absoluteModule(path.join(ROOT, 'src/config')),
      expected: path.join(ROOT, 'src/config.ts'),
      filesToMock: ['/app/src/config.ts']
    },
    {
      id: 'Local-Index',
      description: 'Resolves absolute directory reference by probing for index',
      reference: absoluteModule(path.join(ROOT, 'src/utils')),
      expected: path.join(ROOT, 'src/utils/index.ts'),
      filesToMock: ['/app/src/utils/index.ts']
    },
    {
      id: 'Local-Relative',
      description: 'Resolves relative file reference against the rootDir',
      reference: relativeModule('src/config'),
      expected: path.join(ROOT, 'src/config.ts'),
      filesToMock: ['/app/src/config.ts']
    }
  ];

  test.for(scenarios)('[$id] $description', ({ reference, expected, filesToMock }) => {
    if (filesToMock) {
      seedMockFsFiles(filesToMock);
    }
    expect(resolveModuleReferenceToPath(ROOT, reference)).toBe(expected);
  });

  test('Throws when local module cannot be resolved', () => {
    const ref = absoluteModule(path.join(ROOT, 'src/missing'));
    // Do not seed any mockFiles so it definitively fails
    expect(() => resolveModuleReferenceToPath(ROOT, ref)).toThrowError(
      /Could not resolve local module path/
    );
  });

  test('Resolves package reference using Node resolution', () => {
    const ref = packageModule('vitest');
    // The real process.cwd() is used as root so package resolution works natively
    const resolved = resolveModuleReferenceToPath(process.cwd(), ref);

    expect(resolved).toMatch(/vitest/);
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});

describe('resolveModuleReferenceToFilePath', () => {
  test('Resolves exact local file without probing extensions', () => {
    const ref = relativeModule('tsconfig.json');
    seedMockFsFiles(['/app/tsconfig.json']);

    expect(resolveModuleReferenceToFilePath(ROOT, ref)).toBe(
      path.join(ROOT, 'tsconfig.json')
    );
  });

  test('Throws when exact local file does not exist', () => {
    const ref = relativeModule('missing.json');
    // No mock file added
    expect(() => resolveModuleReferenceToFilePath(ROOT, ref)).toThrowError(
      /Could not resolve local file path/
    );
  });

  test('Resolves package reference safely without extensions probing', () => {
    const ref = packageModule('vitest/package.json');
    const resolved = resolveModuleReferenceToFilePath(process.cwd(), ref);

    expect(resolved).toMatch(/vitest[\\/]package\.json$/);
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
