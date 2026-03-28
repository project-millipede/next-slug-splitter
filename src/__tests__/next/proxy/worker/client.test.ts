import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock(import('node:child_process'), () => ({
  spawn: spawnMock
}));

vi.mock(import('node:fs'), () => ({
  existsSync: existsSyncMock
}));

import {
  clearRouteHandlerProxyWorkerClientSessions,
  resolveRouteHandlerProxyLazyMissWithWorker
} from '../../../../next/proxy/worker/client';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse
} from '../../../../next/proxy/worker/types';

type WorkerChildStub = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  send: (
    message: RouteHandlerProxyWorkerRequest,
    callback?: (error: Error | null | undefined) => void
  ) => boolean;
  kill: ReturnType<typeof vi.fn>;
  requests: Array<RouteHandlerProxyWorkerRequest>;
};

/**
 * Create a minimal persistent worker-session stub for client tests.
 *
 * @param lazyResponses - Sequential responses for `resolve-lazy-miss` requests.
 * @returns Event-emitting child-process lookalike.
 */
const createWorkerSessionChild = (
  lazyResponses: Array<RouteHandlerProxyWorkerResponse>
): WorkerChildStub => {
  const child = new EventEmitter() as WorkerChildStub;

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.requests = [];
  child.kill = vi.fn(() => {
    queueMicrotask(() => {
      child.emit('close', 0);
    });

    return true;
  });
  child.send = (message, callback) => {
    child.requests.push(message);
    queueMicrotask(() => {
      if (message.kind === 'bootstrap') {
        child.emit('message', {
          requestId: message.requestId,
          ok: true,
          response: {
            kind: 'bootstrapped',
            bootstrapGenerationToken: message.bootstrapGenerationToken
          }
        });
        return;
      }

      const response = lazyResponses.shift();

      if (response == null) {
        throw new Error('Missing stubbed lazy worker response.');
      }

      child.emit('message', {
        requestId: message.requestId,
        ok: true,
        response
      });
    });

    callback?.(null);
    return true;
  };

  return child;
};

describe('proxy worker client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRouteHandlerProxyWorkerClientSessions();
    existsSyncMock.mockReturnValue(false);
    delete process.env.SLUG_SPLITTER_CONFIG_PATH;
    delete process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR;
  });

  it('launches the long-lived worker with Node strip-types support for TS config files', async () => {
    const child = createWorkerSessionChild([
      {
        kind: 'pass-through',
        reason: 'no-target'
      }
    ]);
    spawnMock.mockReturnValue(child);
    existsSyncMock.mockImplementation(
      (candidatePath: string) =>
        candidatePath ===
        '/app/node_modules/next-slug-splitter/dist/next/proxy-lazy-worker.js'
    );

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1',
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
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })
    );
    expect(child.requests.map(request => request.kind)).toEqual([
      'bootstrap',
      'resolve-lazy-miss'
    ]);
  });

  it('does not add the strip-types flag when the registered config path is already plain JavaScript', async () => {
    spawnMock.mockReturnValue(
      createWorkerSessionChild([
        {
          kind: 'pass-through',
          reason: 'no-target'
        }
      ])
    );
    existsSyncMock.mockReturnValue(false);

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1',
      configRegistration: {
        configPath: '/app/config/route-handlers-config.mjs'
      }
    });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/proxy-lazy-worker\.js$/u)],
      expect.objectContaining({
        cwd: '/app/config',
        env: expect.objectContaining({
          SLUG_SPLITTER_CONFIG_PATH: '/app/config/route-handlers-config.mjs'
        }),
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })
    );
  });

  it('reuses the same long-lived worker session while the bootstrap generation is unchanged', async () => {
    spawnMock.mockReturnValue(
      createWorkerSessionChild([
        {
          kind: 'heavy',
          source: 'discovery',
          rewriteDestination: '/en/docs/_handlers/getting-started/en',
          routeBasePath: '/docs'
        },
        {
          kind: 'heavy',
          source: 'cache',
          rewriteDestination: '/en/docs/_handlers/getting-started/en',
          routeBasePath: '/docs'
        }
      ])
    );

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1'
    });

    const secondResult = await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1'
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      kind: 'heavy',
      source: 'cache',
      rewriteDestination: '/en/docs/_handlers/getting-started/en',
      routeBasePath: '/docs'
    });
  });

  it('does not let worker stdout noise interfere with IPC responses', async () => {
    const child = createWorkerSessionChild([
      {
        kind: 'heavy',
        source: 'discovery',
        rewriteDestination: '/en/docs/_handlers/getting-started/en',
        routeBasePath: '/docs'
      }
    ]);
    const originalSend = child.send;

    child.send = (message, callback) => {
      const didSend = originalSend(message, callback);
      queueMicrotask(() => {
        child.stdout.write(
          'resolveMetadataByCapturedKey(capturedComponentKeys, metadataByKey): [object Object]\n'
        );
      });
      return didSend;
    };

    spawnMock.mockReturnValue(child);

    await expect(
      resolveRouteHandlerProxyLazyMissWithWorker({
        pathname: '/en/docs/getting-started',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        bootstrapGenerationToken: 'bootstrap-1'
      })
    ).resolves.toEqual({
      kind: 'heavy',
      source: 'discovery',
      rewriteDestination: '/en/docs/_handlers/getting-started/en',
      routeBasePath: '/docs'
    });
  });

  it('restarts the worker session when the bootstrap generation changes', async () => {
    const firstChild = createWorkerSessionChild([
      {
        kind: 'heavy',
        source: 'discovery',
        rewriteDestination: '/en/docs/_handlers/getting-started/en',
        routeBasePath: '/docs'
      }
    ]);
    const secondChild = createWorkerSessionChild([
      {
        kind: 'heavy',
        source: 'discovery',
        rewriteDestination: '/en/docs/_handlers/getting-started/en',
        routeBasePath: '/docs'
      }
    ]);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1'
    });

    await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname: '/en/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-2'
    });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(firstChild.kill).toHaveBeenCalledTimes(1);
  });
});
