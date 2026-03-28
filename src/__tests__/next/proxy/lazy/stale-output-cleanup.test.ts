import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeRenderedRouteHandlerPageIfPresentMock = vi.hoisted(() => vi.fn());
const resolveRenderedHandlerPageLocationMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../generator/protocol/output-lifecycle'), () => ({
  removeRenderedRouteHandlerPageIfPresent:
    removeRenderedRouteHandlerPageIfPresentMock
}));

vi.mock(import('../../../../generator/protocol/rendered-page'), () => ({
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
      pageFilePath: '/repo/app/pages/content/_handlers/guides/en.tsx'
    });
  });

  it('delegates cleanup to the explicit known output location', async () => {
    await expect(
      removeRouteHandlerLazyOutputAtKnownLocation({
        handlersDir: '/repo/app/pages/blog/_handlers',
        pageFilePath:
          '/repo/app/pages/blog/_handlers/application-extensibility/en.tsx'
      })
    ).resolves.toBe('removed');

    expect(removeRenderedRouteHandlerPageIfPresentMock).toHaveBeenCalledWith(
      '/repo/app/pages/blog/_handlers/application-extensibility/en.tsx',
      '/repo/app/pages/blog/_handlers'
    );
  });

  it('derives the emitted page path from route identity before delegating cleanup', async () => {
    await expect(
      removeRouteHandlerLazyOutputForIdentity({
        config: {
          emitFormat: 'ts',
          contentLocaleMode: 'filename',
          paths: {
            handlersDir: '/repo/app/pages/content/_handlers'
          }
        },
        identity: {
          locale: 'en',
          slugArray: ['guides']
        }
      })
    ).resolves.toBe('removed');

    expect(resolveRenderedHandlerPageLocationMock).toHaveBeenCalledWith({
      paths: {
        handlersDir: '/repo/app/pages/content/_handlers'
      },
      emitFormat: 'ts',
      handlerRelativePath: 'guides/en'
    });
    expect(removeRenderedRouteHandlerPageIfPresentMock).toHaveBeenCalledWith(
      '/repo/app/pages/content/_handlers/guides/en.tsx',
      '/repo/app/pages/content/_handlers'
    );
  });
});
