import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock(
  import('node:fs'),
  async () =>
    (await import('../../__mocks__/node-fs')).nodeFsMock
);

vi.mock(import('node:child_process'), () => ({
  spawn: vi.fn()
}));

vi.mock(import('../../../next/shared/prepare/typescript'), () => ({
  resolveAppLocalTypeScriptCompilerPath: vi.fn()
}));

import * as childProcess from 'node:child_process';
import { relativeModule } from '../../../next';
import { prepareRouteHandlersFromConfig } from '../../../next/shared/prepare/index';
import * as prepareTypeScript from '../../../next/shared/prepare/typescript';
import { resetMockFs, seedMockFsFiles } from '../../__utils__/mock-fs';

import type { RouteHandlersConfig } from '../../../next/pages/types';

type MockChildProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
};

const createSuccessfulChildProcess = ({
  closeDelayMs = 0
}: {
  closeDelayMs?: number;
}): ChildProcess => {
  const child = new EventEmitter() as MockChildProcess;

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  setTimeout(() => {
    child.emit('close', 0);
  }, closeDelayMs);

  return child as unknown as ChildProcess;
};

describe('route handler preparation', () => {
  const rootDir = '/tmp/test-route-handlers-app';
  const spawnMock = vi.mocked(childProcess.spawn);
  const resolveAppLocalTypeScriptCompilerPathMock = vi.mocked(
    prepareTypeScript.resolveAppLocalTypeScriptCompilerPath
  );

  const buildRouteHandlersConfig = ({
    rootDir,
    preparePaths
  }: {
    rootDir: string;
    preparePaths: Array<string>;
  }): RouteHandlersConfig => {
    const prepare =
      preparePaths.length === 0
        ? undefined
        : preparePaths.length === 1
          ? {
              tsconfigPath: relativeModule(preparePaths[0])
            }
          : preparePaths.map(preparePath => ({
              tsconfigPath: relativeModule(preparePath)
            }));

    return {
      routerKind: 'pages',
      app: {
        rootDir,
        prepare
      }
    };
  };

  const readProjectPathsFromSpawnCalls = (): Array<string> =>
    spawnMock.mock.calls.map(call => {
      const args = call[1] as Array<string>;
      const projectPathIndex = args.indexOf('-p');
      return args[projectPathIndex + 1];
    });

  beforeEach(() => {
    resetMockFs();
    spawnMock.mockReset();
    resolveAppLocalTypeScriptCompilerPathMock.mockReset();

    spawnMock.mockImplementation(() => createSuccessfulChildProcess({}));
    resolveAppLocalTypeScriptCompilerPathMock.mockImplementation(rootDir =>
      path.join(rootDir, 'node_modules', 'typescript', 'lib', 'tsc.js')
    );
  });

  type SequentialScenario = {
    id: string;
    description: string;
    preparePaths: Array<string>;
  };

  const sequentialScenarios: Array<SequentialScenario> = [
    {
      id: 'Prepare-Omitted',
      description: 'skips preparation when app.prepare is omitted',
      preparePaths: []
    },
    {
      id: 'Single-Prepare',
      description: 'runs the app-local TypeScript compiler for the resolved tsconfig path',
      preparePaths: ['packages/site-route-handlers/tsconfig.route-handlers.json']
    },
    {
      id: 'Multiple-Prepare',
      description: 'runs multiple prepare steps in configured order',
      preparePaths: [
        'packages/first/tsconfig.json',
        'packages/second/tsconfig.json'
      ]
    }
  ];

  test.for(sequentialScenarios)('[$id] $description', async ({ preparePaths }) => {
    seedMockFsFiles(
      preparePaths.map(preparePath => path.join(rootDir, preparePath))
    );

    await prepareRouteHandlersFromConfig(
      rootDir,
      buildRouteHandlersConfig({
        rootDir,
        preparePaths
      })
    );

    expect(readProjectPathsFromSpawnCalls()).toEqual(
      preparePaths.map(preparePath => path.join(rootDir, preparePath))
    );
    expect(resolveAppLocalTypeScriptCompilerPathMock).toHaveBeenCalledTimes(
      preparePaths.length
    );
  });

  test('shares one in-flight execution for concurrent identical prepare calls', async () => {
    const tsconfigPath = path.join(
      rootDir,
      'packages',
      'site-route-handlers',
      'tsconfig.route-handlers.json'
    );

    seedMockFsFiles([tsconfigPath]);
    spawnMock.mockImplementation(() =>
      createSuccessfulChildProcess({
        closeDelayMs: 50
      })
    );

    const routeHandlersConfig = buildRouteHandlersConfig({
      rootDir,
      preparePaths: ['packages/site-route-handlers/tsconfig.route-handlers.json']
    });

    await Promise.all([
      prepareRouteHandlersFromConfig(rootDir, routeHandlersConfig),
      prepareRouteHandlersFromConfig(rootDir, routeHandlersConfig)
    ]);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(readProjectPathsFromSpawnCalls()).toEqual([tsconfigPath]);
  });
});
