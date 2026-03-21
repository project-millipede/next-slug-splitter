import { describe, expect, it } from 'vitest';

import {
  readPersistedRouteHandlerLazyDiscoverySnapshotEntries,
  writePersistedRouteHandlerLazyDiscoverySnapshotEntries
} from '../../../../next/proxy/lazy/discovery-snapshot-store';
import { withTempDir } from '../../../helpers/temp-dir';

describe('proxy lazy discovery snapshot store', () => {
  it('round-trips persisted lazy discovery entries across a file write and read', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-snapshot-store-',
      async rootDir => {
        await writePersistedRouteHandlerLazyDiscoverySnapshotEntries({
          rootDir,
          entries: new Map([
            [
              '/blog/application-extensibility',
              {
                version: 1,
                pathname: '/blog/application-extensibility',
                targetId: 'blog',
                routePath: {
                  locale: 'en',
                  slugArray: ['application-extensibility'],
                  filePath: '/tmp/app/blog/application-extensibility.mdx'
                },
                handlersDir: '/tmp/app/pages/blog/_handlers',
                pageFilePath:
                  '/tmp/app/pages/blog/_handlers/application-extensibility/en.tsx'
              }
            ]
          ])
        });

        await expect(
          readPersistedRouteHandlerLazyDiscoverySnapshotEntries({
            rootDir
          })
        ).resolves.toEqual(
          new Map([
            [
              '/blog/application-extensibility',
              {
                version: 1,
                pathname: '/blog/application-extensibility',
                targetId: 'blog',
                routePath: {
                  locale: 'en',
                  slugArray: ['application-extensibility'],
                  filePath: '/tmp/app/blog/application-extensibility.mdx'
                },
                handlersDir: '/tmp/app/pages/blog/_handlers',
                pageFilePath:
                  '/tmp/app/pages/blog/_handlers/application-extensibility/en.tsx'
              }
            ]
          ])
        );
      }
    );
  });
});
