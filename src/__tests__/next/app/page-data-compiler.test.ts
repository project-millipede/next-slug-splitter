import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * This suite keeps the public page-data compiler helpers small and honest:
 * 1. `definePageDataCompiler(...)` must remain a pure identity helper.
 * 2. `runAppPageDataCompiler(...)` must resolve runtime details from the
 *    persisted lookup snapshot instead of reloading config at page time.
 */
const readAppRouteLookupSnapshotMock = vi.hoisted(() => vi.fn());
const compileAppPageDataWithWorkerMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/app/lookup-persisted'), () => ({
  readAppRouteLookupSnapshot: readAppRouteLookupSnapshotMock
}));

vi.mock(import('../../../next/app/page-data-worker/host/client'), () => ({
  compileAppPageDataWithWorker: compileAppPageDataWithWorkerMock
}));

describe('App page-data compiler helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  test('definePageDataCompiler preserves the authored compiler object', async () => {
    const { definePageDataCompiler } = await import(
      '../../../next/page-data-compiler'
    );
    const compiler = definePageDataCompiler({
      compile: async ({ input }) => input
    });

    await expect(compiler.compile({ targetId: 'docs', input: 'hello' })).resolves.toBe(
      'hello'
    );
  });

  test('runAppPageDataCompiler reads the persisted compiler path and delegates to the worker client', async () => {
    const snapshot = {
      version: 1,
      targets: [
        {
          targetId: 'docs',
          handlerRouteParamName: 'slug',
          pageDataCompilerModulePath: '/repo/app/lib/content-compiler.mjs'
        }
      ]
    };

    readAppRouteLookupSnapshotMock.mockResolvedValue(snapshot);
    compileAppPageDataWithWorkerMock.mockResolvedValue({
      code: 'compiled',
      slug: ['dashboard']
    });

    const { runAppPageDataCompiler } = await import('../../../next');
    const result = await runAppPageDataCompiler({
      targetId: 'docs',
      input: {
        slug: ['dashboard']
      }
    });

    expect(readAppRouteLookupSnapshotMock).toHaveBeenCalledTimes(1);
    expect(readAppRouteLookupSnapshotMock).toHaveBeenCalledWith(process.cwd());
    expect(compileAppPageDataWithWorkerMock).toHaveBeenCalledWith({
      rootDir: process.cwd(),
      targetId: 'docs',
      compilerModulePath: '/repo/app/lib/content-compiler.mjs',
      input: {
        slug: ['dashboard']
      }
    });
    expect(result).toEqual({
      code: 'compiled',
      slug: ['dashboard']
    });
  });
});
