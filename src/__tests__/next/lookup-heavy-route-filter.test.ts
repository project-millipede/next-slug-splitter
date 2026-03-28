import { beforeEach, describe, expect, test, vi } from 'vitest';

const readRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../next/lookup-persisted'), () => ({
  readRouteHandlerLookupSnapshot: readRouteHandlerLookupSnapshotMock
}));

import {
  filterStaticPathsAgainstHeavyRoutes,
  withHeavyRouteFilter
} from '../../next/lookup';
import { TEST_PRIMARY_ROUTE_SEGMENT } from '../helpers/fixtures';

type StaticPathEntry = {
  params: Record<string, string | Array<string>>;
  locale?: string;
};

describe('filterStaticPathsAgainstHeavyRoutes', () => {
  type Scenario = {
    id: string;
    description: string;
    slugParam?: string;
    paths: Array<StaticPathEntry>;
    expectedPaths: Array<StaticPathEntry>;
    heavyKeys: Array<string>;
    fallback: boolean | 'blocking';
  };

  const scenarios: ReadonlyArray<Scenario> = [
    {
      id: 'Catch-All',
      description: 'filters heavy catch-all entries and preserves light ones',
      paths: [
        { params: { slug: ['getting-started'] }, locale: 'en' },
        { params: { slug: ['heavy-page'] }, locale: 'en' },
        { params: { slug: ['another-page'] }, locale: 'en' }
      ],
      expectedPaths: [
        { params: { slug: ['getting-started'] }, locale: 'en' },
        { params: { slug: ['another-page'] }, locale: 'en' }
      ],
      heavyKeys: ['en::heavy-page'],
      fallback: false
    },
    {
      id: 'Single-Segment',
      description: 'supports single-segment slug params',
      slugParam: 'slug',
      paths: [
        { params: { slug: 'light-post' }, locale: 'en' },
        { params: { slug: 'heavy-post' }, locale: 'en' }
      ],
      expectedPaths: [{ params: { slug: 'light-post' }, locale: 'en' }],
      heavyKeys: ['en::heavy-post'],
      fallback: false
    },
    {
      id: 'Missing-Locale-Or-Slug',
      description: 'keeps entries without locale or slug',
      paths: [
        { params: { slug: ['heavy-page'] }, locale: 'en' },
        { params: { slug: ['some-page'] } },
        { params: { id: 'no-slug-entry' }, locale: 'en' }
      ],
      expectedPaths: [
        { params: { slug: ['some-page'] } },
        { params: { id: 'no-slug-entry' }, locale: 'en' }
      ],
      heavyKeys: ['en::heavy-page'],
      fallback: false
    },
    {
      id: 'Fallback-Preserved',
      description: 'preserves fallback value from the inner getStaticPaths result',
      paths: [],
      expectedPaths: [],
      heavyKeys: [],
      fallback: 'blocking'
    }
  ];

  test.for(scenarios)('[$id] $description', ({
    slugParam,
    paths,
    expectedPaths,
    heavyKeys,
    fallback
  }) => {
    const result = filterStaticPathsAgainstHeavyRoutes(
      paths,
      fallback,
      (locale, slugArray) =>
        heavyKeys.includes(`${locale}::${slugArray.join('/')}`),
      slugParam
    );

    expect(result.paths).toEqual(expectedPaths);
    expect(result.fallback).toBe(fallback);
  });
});

describe('withHeavyRouteFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 1,
      filterHeavyRoutesInStaticPaths: false,
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: []
        }
      ]
    });
  });

  test('returns all paths unfiltered in proxy mode', async () => {
    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({
        paths: [
          { params: { slug: ['getting-started'] }, locale: 'en' },
          { params: { slug: ['heavy-page'] }, locale: 'en' }
        ],
        fallback: false
      })
    });

    await expect(getStaticPaths({})).resolves.toEqual({
      paths: [
        { params: { slug: ['getting-started'] }, locale: 'en' },
        { params: { slug: ['heavy-page'] }, locale: 'en' }
      ],
      fallback: false
    });
  });

  test('filters heavy routes from the persisted lookup snapshot and preserves fallback', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 1,
      filterHeavyRoutesInStaticPaths: true,
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: ['en:heavy-page']
        }
      ]
    });

    const getStaticPaths = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      getStaticPaths: async () => ({
        paths: [
          { params: { slug: ['light-page'] }, locale: 'en' },
          { params: { slug: ['heavy-page'] }, locale: 'en' }
        ],
        fallback: 'blocking'
      })
    });

    await expect(getStaticPaths({})).resolves.toEqual({
      paths: [{ params: { slug: ['light-page'] }, locale: 'en' }],
      fallback: 'blocking'
    });
  });
});
