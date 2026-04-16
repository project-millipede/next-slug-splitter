import { afterEach, describe, expect, test } from 'vitest';
import path from 'node:path';

import {
  clearAppPageDataWorkerClientSessions,
  compileAppPageDataWithWorker
} from '../../../next/app/page-data-worker/host/client';
import { writeTestModule } from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

/**
 * Render a minimal worker runtime that echoes inputs and exposes whether the
 * same child process handled multiple requests.
 *
 * @returns Synthetic worker source code used by the session-reuse test.
 */
const createFakeWorkerSource = (): string =>
  [
    'const workerInstanceId = Math.random().toString(36).slice(2);',
    'process.on("message", request => {',
    '  if (request == null || typeof request !== "object") {',
    '    return;',
    '  }',
    '  if (request.subject === "shutdown") {',
    '    process.send?.({',
    '      requestId: request.requestId,',
    '      ok: true,',
    '      response: { subject: "shutdown-complete" }',
    '    }, () => {',
    '      process.disconnect?.();',
    '      process.exit(0);',
    '    });',
    '    return;',
    '  }',
    '  process.send?.({',
    '    requestId: request.requestId,',
    '    ok: true,',
    '    response: {',
    '      subject: "page-data-compiled",',
    '      payload: {',
    '        result: {',
    '        workerInstanceId,',
    '        compilerModulePath: request.payload.compilerModulePath,',
    '        input: request.payload.input',
    '      }',
    '      }',
    '    }',
    '  });',
    '});',
    ''
  ].join('\n');

afterEach(async () => {
  await clearAppPageDataWorkerClientSessions();
});

describe('App page-data worker host client', () => {
  test('reuses one worker session per root and restarts after explicit cleanup', async () => {
    await withTempDir('next-slug-splitter-app-page-data-worker-', async rootDir => {
      const workerEntryPath = path.join(
        rootDir,
        'node_modules',
        'next-slug-splitter',
        'dist',
        'next',
        'app-page-data-worker.js'
      );

      await writeTestModule(workerEntryPath, createFakeWorkerSource());

      const firstResult = await compileAppPageDataWithWorker<
        {
          slug: string[];
        },
        {
          workerInstanceId: string;
          compilerModulePath: string;
          input: {
            slug: string[];
          };
        }
      >({
        rootDir,
        targetId: 'docs',
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['first']
        }
      });
      const secondResult = await compileAppPageDataWithWorker<
        {
          slug: string[];
        },
        {
          workerInstanceId: string;
          compilerModulePath: string;
          input: {
            slug: string[];
          };
        }
      >({
        rootDir,
        targetId: 'docs',
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['second']
        }
      });

      expect(firstResult).toMatchObject({
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['first']
        }
      });
      expect(secondResult).toMatchObject({
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['second']
        }
      });
      expect(firstResult.workerInstanceId).toBe(secondResult.workerInstanceId);

      await clearAppPageDataWorkerClientSessions();

      const thirdResult = await compileAppPageDataWithWorker<
        {
          slug: string[];
        },
        {
          workerInstanceId: string;
          compilerModulePath: string;
          input: {
            slug: string[];
          };
        }
      >({
        rootDir,
        targetId: 'docs',
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['third']
        }
      });

      expect(thirdResult).toMatchObject({
        compilerModulePath: '/repo/app/lib/content-compiler.mjs',
        input: {
          slug: ['third']
        }
      });
      expect(thirdResult.workerInstanceId).not.toBe(
        firstResult.workerInstanceId
      );
    });
  });
});
