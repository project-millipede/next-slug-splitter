import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock
}));

import { resolveRouteHandlerProxyLazyMissWithWorker } from '../../../../next/proxy/worker/client';

import type { RouteHandlerProxyWorkerResponse } from '../../../../next/proxy/worker/types';

/**
 * Create a minimal successful child-process stub for the worker client tests.
 *
 * @param response - JSON response written to worker stdout.
 * @returns Event-emitting child-process lookalike.
 */
const createSuccessfulWorkerChild = (
  response: RouteHandlerProxyWorkerResponse
): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: { end: (input: string) => void };
} => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: { end: (input: string) => void };
  };

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    end: () => {
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify(response));
        child.stdout.end();
        child.emit('close', 0);
      });
    }
  };

  return child;
};

describe('proxy worker client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    delete process.env.SLUG_SPLITTER_CONFIG_PATH;
    delete process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR;
  });

  it('launches the dev-only worker with Node strip-types support for TS config files', async () => {
    spawnMock.mockReturnValue(
      createSuccessfulWorkerChild({
        kind: 'pass-through',
        reason: 'no-target'
      })
    );
    existsSyncMock.mockImplementation((candidatePath: string) =>
      candidatePath ===
      '/app/node_modules/next-slug-splitter/dist/next/proxy-lazy-worker.js'
    );

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      configRegistration: {
        configPath: '/app/route-handlers-config.ts',
        rootDir: '/app'
      }
    });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        '--experimental-strip-types',
        '/app/node_modules/next-slug-splitter/dist/next/proxy-lazy-worker.js'
      ],
      expect.objectContaining({
        cwd: '/app',
        env: expect.objectContaining({
          SLUG_SPLITTER_CONFIG_PATH: '/app/route-handlers-config.ts',
          SLUG_SPLITTER_CONFIG_ROOT_DIR: '/app'
        }),
        stdio: ['pipe', 'pipe', 'pipe']
      })
    );
  });

  it('does not add the strip-types flag when the registered config path is already plain JavaScript', async () => {
    spawnMock.mockReturnValue(
      createSuccessfulWorkerChild({
        kind: 'pass-through',
        reason: 'no-target'
      })
    );
    existsSyncMock.mockReturnValue(false);

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      configRegistration: {
        configPath: '/app/config/route-handlers-config.js'
      }
    });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringMatching(/proxy-lazy-worker\.js$/u)
      ],
      expect.objectContaining({
        cwd: '/app/config',
        env: expect.objectContaining({
          SLUG_SPLITTER_CONFIG_PATH: '/app/config/route-handlers-config.js'
        }),
        stdio: ['pipe', 'pipe', 'pipe']
      })
    );
  });

  it('reuses a short-lived settled heavy result instead of spawning the worker again immediately', async () => {
    spawnMock.mockReturnValue(
      createSuccessfulWorkerChild({
        kind: 'heavy',
        source: 'discovery',
        rewriteDestination: '/en/docs/_handlers/getting-started/en',
        routeBasePath: '/docs'
      })
    );

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    const secondResult = await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      kind: 'heavy',
      source: 'discovery',
      rewriteDestination: '/en/docs/_handlers/getting-started/en',
      routeBasePath: '/docs'
    });
  });
});
