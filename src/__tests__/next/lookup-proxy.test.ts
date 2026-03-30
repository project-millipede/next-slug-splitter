import { beforeEach, describe, expect, test, vi } from 'vitest';

const readRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../next/lookup-persisted'), () => ({
  readRouteHandlerLookupSnapshot: readRouteHandlerLookupSnapshotMock
}));

import { withHeavyRouteFilter } from '../../next/lookup';
import { TEST_PRIMARY_ROUTE_SEGMENT } from '../helpers/fixtures';

const EMPTY_CONTEXT = {} as Parameters<
  ReturnType<typeof withHeavyRouteFilter>
>[0];

describe('withHeavyRouteFilter snapshot integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns original paths when filtering is disabled in the snapshot', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 1,
      filterHeavyRoutesInStaticPaths: false,
      targets: [
        { targetId: TEST_PRIMARY_ROUTE_SEGMENT, heavyRoutePathKeys: [] }
      ]
    });

    const paths = [{ params: { slug: ['a'] }, locale: 'en' }];
    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({ paths, fallback: false })
    });

    const result = await getStaticPaths(EMPTY_CONTEXT);
    expect(result.paths).toEqual(paths);
  });

  test('filters heavy routes when filtering is enabled in the snapshot', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 1,
      filterHeavyRoutesInStaticPaths: true,
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: ['en:generated']
        }
      ]
    });

    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({
        paths: [
          { params: { slug: ['generated'] }, locale: 'en' },
          { params: { slug: ['other'] }, locale: 'en' }
        ],
        fallback: false
      })
    });

    const result = await getStaticPaths(EMPTY_CONTEXT);
    expect(result.paths).toEqual([
      { params: { slug: ['other'] }, locale: 'en' }
    ]);
  });

  test('fails with a targeted bootstrap error when the snapshot is missing', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue(null);

    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({ paths: [], fallback: false })
    });

    await expect(getStaticPaths(EMPTY_CONTEXT)).rejects.toThrow(
      'Missing route-handler lookup snapshot.'
    );
  });

  test('fails when the requested target does not exist in the snapshot', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 1,
      filterHeavyRoutesInStaticPaths: true,
      targets: [{ targetId: 'blog', heavyRoutePathKeys: [] }]
    });

    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({ paths: [], fallback: false })
    });

    await expect(getStaticPaths(EMPTY_CONTEXT)).rejects.toThrow(
      `Unknown targetId "${TEST_PRIMARY_ROUTE_SEGMENT}".`
    );
  });
});
