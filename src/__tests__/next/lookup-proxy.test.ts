import { beforeEach, describe, expect, test, vi } from 'vitest';

const readRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../next/lookup-persisted'), () => ({
  readRouteHandlerLookupSnapshot: readRouteHandlerLookupSnapshotMock
}));

import {
  loadRouteHandlerCacheLookup,
  shouldFilterHeavyRoutesInStaticPaths
} from '../../next/lookup';
import { TEST_PRIMARY_ROUTE_SEGMENT } from '../helpers/fixtures';

describe('route handler cache lookup proxy behavior', () => {
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

  describe('shouldFilterHeavyRoutesInStaticPaths', () => {
    test('reads the persisted lookup snapshot', async () => {
      readRouteHandlerLookupSnapshotMock.mockResolvedValue({
        version: 1,
        filterHeavyRoutesInStaticPaths: true,
        targets: []
      });

      await expect(
        shouldFilterHeavyRoutesInStaticPaths()
      ).resolves.toBe(true);
    });

    test('fails with a targeted bootstrap error when the lookup snapshot is missing', async () => {
      readRouteHandlerLookupSnapshotMock.mockResolvedValue(null);

      await expect(
        shouldFilterHeavyRoutesInStaticPaths()
      ).rejects.toThrow('Missing route-handler lookup snapshot.');
    });
  });

  describe('loadRouteHandlerCacheLookup', () => {
    test('reads heavy-route ownership from the persisted lookup snapshot', async () => {
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

      const lookup = await loadRouteHandlerCacheLookup(
        TEST_PRIMARY_ROUTE_SEGMENT
      );

      expect(lookup.isHeavyRoute('en', ['generated'])).toBe(true);
      expect(lookup.isHeavyRoute('en', ['other'])).toBe(false);
    });

    test('fails with a targeted bootstrap error when no snapshot is available', async () => {
      readRouteHandlerLookupSnapshotMock.mockResolvedValue(null);

      await expect(
        loadRouteHandlerCacheLookup(TEST_PRIMARY_ROUTE_SEGMENT)
      ).rejects.toThrow('Missing route-handler lookup snapshot.');
    });

    test('fails when the requested target does not exist', async () => {
      readRouteHandlerLookupSnapshotMock.mockResolvedValue({
        version: 1,
        filterHeavyRoutesInStaticPaths: true,
        targets: [
          {
            targetId: 'blog',
            heavyRoutePathKeys: []
          }
        ]
      });

      await expect(
        loadRouteHandlerCacheLookup(TEST_PRIMARY_ROUTE_SEGMENT)
      ).rejects.toThrow(`Unknown targetId "${TEST_PRIMARY_ROUTE_SEGMENT}".`);
    });
  });
});
