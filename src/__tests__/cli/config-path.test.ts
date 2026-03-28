import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  resolveConfigPathFromArgv,
  resolveNextConfigPath
} from '../../cli/config-path';
import { resetMockFs, seedMockFsFiles } from '../__utils__/mock-fs';

vi.mock(
  import('node:fs'),
  async () =>
    (await import('../__mocks__/node-fs')).nodeFsMock
);

describe('cli config path resolution', () => {
  const rootDir = '/tmp/test-route-handlers-app';

  beforeEach(() => {
    resetMockFs();
  });

  describe('resolveConfigPathFromArgv', () => {
    type Scenario = {
      id: string;
      description: string;
      argv: Array<string>;
      expected: string | undefined;
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'Explicit-Relative',
        description: 'relative --config paths resolve against rootDir',
        argv: ['--config', 'config/next.config.mjs'],
        expected: path.join(rootDir, 'config', 'next.config.mjs')
      },
      {
        id: 'Explicit-Absolute',
        description: 'absolute --config paths are returned unchanged',
        argv: ['--config', '/workspace/custom/next.config.mjs'],
        expected: '/workspace/custom/next.config.mjs'
      },
      {
        id: 'Missing-Flag',
        description: 'missing --config returns undefined',
        argv: [],
        expected: undefined
      }
    ];

    test.for(scenarios)('[$id] $description', ({ argv, expected }) => {
      expect(resolveConfigPathFromArgv(argv, rootDir)).toBe(expected);
    });
  });

  describe('resolveNextConfigPath', () => {
    type Scenario = {
      id: string;
      description: string;
      argv: Array<string>;
      existingFiles: Array<string>;
      expected: string | undefined;
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'Explicit-Beats-Discovery',
        description: 'explicit --config wins over discovered default config files',
        argv: ['--config', 'config/custom-next.config.mjs'],
        existingFiles: [path.join(rootDir, 'next.config.mjs')],
        expected: path.join(rootDir, 'config', 'custom-next.config.mjs')
      },
      {
        id: 'Discover-Default',
        description: 'falls back to the first supported default next config file',
        argv: [],
        existingFiles: [path.join(rootDir, 'next.config.mjs')],
        expected: path.join(rootDir, 'next.config.mjs')
      },
      {
        id: 'No-Config-Found',
        description: 'returns undefined when no config source is available',
        argv: [],
        existingFiles: [],
        expected: undefined
      }
    ];

    test.for(scenarios)('[$id] $description', ({ argv, existingFiles, expected }) => {
      seedMockFsFiles(existingFiles);

      expect(resolveNextConfigPath(argv, rootDir)).toBe(expected);
    });
  });
});
