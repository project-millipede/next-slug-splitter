import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeRenderedRouteHandlerPageIfPresentMock = vi.hoisted(() => vi.fn());
const resolveRenderedHandlerPageLocationMock = vi.hoisted(() => vi.fn());

vi.mock(
  import('../../../../generator/shared/protocol/output-lifecycle'),
  () => ({
    removeRenderedRouteHandlerPageIfPresent:
      removeRenderedRouteHandlerPageIfPresentMock
  })
);

vi.mock(import('../../../../generator/pages/protocol/rendered-page'), () => ({
  resolveRenderedHandlerPageLocation: resolveRenderedHandlerPageLocationMock
}));

import {
  removeRouteHandlerLazyOutputAtKnownLocation,
  removeRouteHandlerLazyOutputForIdentity
} from '../../../../next/proxy/lazy/stale-output-cleanup';

describe('proxy lazy stale-output cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeRenderedRouteHandlerPageIfPresentMock.mockResolvedValue('removed');
    resolveRenderedHandlerPageLocationMock.mockReturnValue({
      pageFilePath: '/repo/app/pages/content/generated-handlers/guides/en.tsx'
    });
  });

  it('delegates cleanup to the explicit known output location', async () => {
    await expect(
      removeRouteHandlerLazyOutputAtKnownLocation(
        '/repo/app/pages/blog/generated-handlers',
        '/repo/app/pages/blog/generated-handlers/application-extensibility/en.tsx'
      )
    ).resolves.toBe('removed');

    expect(removeRenderedRouteHandlerPageIfPresentMock).toHaveBeenCalledWith(
      '/repo/app/pages/blog/generated-handlers/application-extensibility/en.tsx',
      '/repo/app/pages/blog/generated-handlers'
    );
  });

  it('derives the emitted page path from route identity before delegating cleanup', async () => {
    await expect(
      removeRouteHandlerLazyOutputForIdentity({
        config: {
          routerKind: 'pages',
          emitFormat: 'ts',
          contentLocaleMode: 'filename',
          paths: {
            generatedDir: '/repo/app/pages/content/generated-handlers'
          }
        },
        identity: {
          locale: 'en',
          slugArray: ['guides']
        }
      })
    ).resolves.toBe('removed');

    expect(resolveRenderedHandlerPageLocationMock).toHaveBeenCalledWith(
      {
        generatedDir: '/repo/app/pages/content/generated-handlers'
      },
      'ts',
      'guides/en'
    );
    expect(removeRenderedRouteHandlerPageIfPresentMock).toHaveBeenCalledWith(
      '/repo/app/pages/content/generated-handlers/guides/en.tsx',
      '/repo/app/pages/content/generated-handlers'
    );
  });
});
