import process from 'node:process';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const disconnectSharedWorkerRuntimeProcessMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../../next/shared/worker/runtime/entry'), () => ({
  disconnectSharedWorkerRuntimeProcess:
    disconnectSharedWorkerRuntimeProcessMock as unknown as () => never
}));

import { createAppPageDataWorkerRuntimeMachine } from '../../../../../next/app/page-data-worker/runtime/machine';
import { writeTestModule } from '../../../../helpers/fixtures';
import { withTempDir } from '../../../../helpers/temp-dir';

const originalProcessSendDescriptor = Object.getOwnPropertyDescriptor(
  process,
  'send'
);

const setProcessSend = (send: typeof process.send): void => {
  Object.defineProperty(process, 'send', {
    value: send,
    writable: true,
    configurable: true
  });
};

const restoreProcessSend = (): void => {
  if (originalProcessSendDescriptor == null) {
    delete (process as typeof process & { send?: typeof process.send }).send;
    return;
  }

  Object.defineProperty(process, 'send', originalProcessSendDescriptor);
};

/**
 * Create a minimal page-data compiler module for runtime-machine unit tests.
 *
 * @returns JavaScript module source code.
 */
const createCompilerModuleSource = (): string =>
  [
    'const compilerInstanceId = Math.random().toString(36).slice(2);',
    'export const pageDataCompiler = {',
    '  async compile({ targetId, input }) {',
    '    return {',
    '      compilerInstanceId,',
    '      targetId,',
    '      input',
    '    };',
    '  }',
    '};',
    ''
  ].join('\n');

describe('App page-data worker runtime machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreProcessSend();
  });

  test('compiles page data through the App worker domain handler', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    await withTempDir('next-slug-splitter-app-page-data-machine-', async rootDir => {
      const compilerModulePath = path.join(rootDir, 'content-compiler.mjs');

      await writeTestModule(compilerModulePath, createCompilerModuleSource());

      const machine = createAppPageDataWorkerRuntimeMachine();

      await machine.handleRequest({
        requestId: 'request-1',
        subject: 'compile-page-data',
        payload: {
          targetId: 'docs',
          compilerModulePath,
          input: {
            slug: ['guides', 'intro']
          }
        }
      });

      expect(send).toHaveBeenCalledWith(
        {
          requestId: 'request-1',
          ok: true,
          response: {
            subject: 'page-data-compiled',
            payload: {
              result: {
                compilerInstanceId: expect.any(String),
                targetId: 'docs',
                input: {
                  slug: ['guides', 'intro']
                }
              }
            }
          }
        },
        expect.any(Function)
      );
    });
  });

  test('uses the shared shutdown path', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    const machine = createAppPageDataWorkerRuntimeMachine();

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'shutdown'
    });

    expect(disconnectSharedWorkerRuntimeProcessMock).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        ok: true,
        response: {
          subject: 'shutdown-complete'
        }
      },
      expect.any(Function)
    );
  });
});
