import { beforeEach, describe, expect, test, vi } from 'vitest';

const readRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());
const readAppRouteLookupSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/shared/lookup-persisted'), () => ({
  readRouteHandlerLookupSnapshot: readRouteHandlerLookupSnapshotMock
}));

vi.mock(import('../../../next/app/lookup-persisted'), () => ({
  readAppRouteLookupSnapshot: readAppRouteLookupSnapshotMock
}));

import {
  filterStaticParamsAgainstHeavyRoutes,
  withHeavyRouteFilter
} from '../../../next/lookup';
import { TEST_PRIMARY_ROUTE_SEGMENT } from '../../helpers/fixtures';

describe('filterStaticParamsAgainstHeavyRoutes', () => {
  test('filters heavy params using structural default-locale semantics', async () => {
    await expect(
      filterStaticParamsAgainstHeavyRoutes(
        [
          { slug: ['getting-started'], locale: 'en' },
          { slug: ['heavy-page'], locale: 'de' },
          { slug: ['light-page'], locale: 'de' }
        ],
        (locale, slugArray) =>
          ['en:heavy-page'].includes(`${locale}:${slugArray.join('/')}`),
        {
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        }
      )
    ).resolves.toEqual([
      { slug: ['getting-started'], locale: 'en' },
      { slug: ['light-page'], locale: 'de' }
    ]);
  });

  test('supports app-owned default-locale derivation without a locale URL param', async () => {
    await expect(
      filterStaticParamsAgainstHeavyRoutes(
        [{ slug: ['heavy-page'] }, { slug: ['light-page'] }],
        (locale, slugArray) =>
          ['en:heavy-page'].includes(`${locale}:${slugArray.join('/')}`),
        {
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        }
      )
    ).resolves.toEqual([{ slug: ['light-page'] }]);
  });

  test('supports custom slug params with app-owned locale resolution', async () => {
    await expect(
      filterStaticParamsAgainstHeavyRoutes(
        [
          { path: ['heavy-page'], lang: 'de' },
          { path: 'light-page', lang: 'de' }
        ],
        (locale, slugArray) =>
          ['en:heavy-page'].includes(`${locale}:${slugArray.join('/')}`),
        {
          handlerRouteParamName: 'path',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        }
      )
    ).resolves.toEqual([{ path: 'light-page', lang: 'de' }]);
  });
});

describe('withHeavyRouteFilter App Router path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 5,
      filterHeavyRoutesFromStaticRouteResult: false,
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: []
        }
      ]
    });
    readAppRouteLookupSnapshotMock.mockResolvedValue({
      version: 1,
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParamName: 'slug'
        }
      ]
    });
  });

  test('returns all params unchanged in proxy mode', async () => {
    const generateStaticParams = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      generateStaticParams: async () => [
        { slug: ['guides', 'intro'] },
        { slug: ['guides', 'einfuehrung'] }
      ]
    });

    await expect(generateStaticParams()).resolves.toEqual([
      { slug: ['guides', 'intro'] },
      { slug: ['guides', 'einfuehrung'] }
    ]);
  });

  test('filters heavy routes structurally when rewrite mode needs an exact split', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 5,
      filterHeavyRoutesFromStaticRouteResult: true,
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: ['en:guides/einfuehrung']
        }
      ]
    });

    const generateStaticParams = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      generateStaticParams: async () => [
        { slug: ['guides', 'intro'] },
        { slug: ['guides', 'einfuehrung'] }
      ]
    });

    await expect(generateStaticParams()).resolves.toEqual([
      { slug: ['guides', 'intro'] }
    ]);
  });

  test('preserves wrapped generateStaticParams arguments before filtering', async () => {
    readRouteHandlerLookupSnapshotMock.mockResolvedValue({
      version: 5,
      filterHeavyRoutesFromStaticRouteResult: true,
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      targets: [
        {
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          heavyRoutePathKeys: ['en:guides/einfuehrung']
        }
      ]
    });

    const generateStaticParams = withHeavyRouteFilter({
      targetId: TEST_PRIMARY_ROUTE_SEGMENT,
      generateStaticParams: async (
        parent: {
          params: {
            section: string;
          };
        }
      ) => [
        { slug: [parent.params.section, 'intro'] },
        { slug: [parent.params.section, 'einfuehrung'] }
      ]
    });

    await expect(
      generateStaticParams({
        params: {
          section: 'guides'
        }
      })
    ).resolves.toEqual([{ slug: ['guides', 'intro'] }]);
  });
});
