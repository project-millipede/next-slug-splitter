import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';

import {
  createRouteHandlerLookupSnapshot,
  parseRouteHandlerLookupSnapshot,
  readRouteHandlerLookupSnapshot,
  resolveRouteHandlerLookupSnapshotPath,
  serializeRouteHandlerLookupSnapshot,
  writeRouteHandlerLookupSnapshot
} from '../../next/lookup-persisted';
import {
  loadRouteHandlerCacheLookup,
  shouldFilterHeavyRoutesInStaticPaths
} from '../../next/lookup';
import { createHeavyRoute } from '../helpers/builders';
import { withTempDir } from '../helpers/temp-dir';

const ORIGINAL_CWD = process.cwd();

describe('route-handler lookup snapshot persistence', () => {
  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
  });

  it('serializes and parses route-handler lookup snapshots without Next runtime semantics fields', () => {
    const snapshot = createRouteHandlerLookupSnapshot(
      true,
      ['blog', 'docs'],
      {
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [
          createHeavyRoute({
            targetId: 'docs',
            locale: 'en',
            slugArray: ['guides', 'intro'],
            handlerId: 'docs-en-guides-intro',
            handlerRelativePath: 'guides/intro/en'
          })
        ],
        rewrites: []
      }
    );

    const serialized = serializeRouteHandlerLookupSnapshot(snapshot);
    const parsed = parseRouteHandlerLookupSnapshot(serialized);

    expect(serialized).not.toContain('localeConfig');
    expect(parsed).toEqual({
      version: 1,
      filterHeavyRoutesInStaticPaths: true,
      targets: [
        {
          targetId: 'blog',
          heavyRoutePathKeys: []
        },
        {
          targetId: 'docs',
          heavyRoutePathKeys: ['en:guides/intro']
        }
      ]
    });
  });

  it('returns null for invalid persisted lookup snapshot content', () => {
    expect(
      parseRouteHandlerLookupSnapshot(
        JSON.stringify({
          version: 1,
          filterHeavyRoutesInStaticPaths: true,
          targets: [
            {
              targetId: 'docs',
              heavyRoutePathKeys: [123]
            }
          ]
        })
      )
    ).toBeNull();
  });

  it('reads page-time lookup state from the persisted snapshot when no explicit config is passed', async () => {
    await withTempDir('next-slug-splitter-lookup-snapshot-', async rootDir => {
      process.chdir(rootDir);

      await writeRouteHandlerLookupSnapshot(
        rootDir,
        createRouteHandlerLookupSnapshot(
          true,
          ['docs'],
          {
            analyzedCount: 1,
            heavyCount: 1,
            heavyPaths: [
              createHeavyRoute({
                targetId: 'docs',
                locale: 'en',
                slugArray: ['recognition'],
                handlerId: 'docs-en-recognition',
                handlerRelativePath: 'recognition/en'
              })
            ],
            rewrites: []
          }
        )
      );

      await expect(
        shouldFilterHeavyRoutesInStaticPaths()
      ).resolves.toBe(true);

      const lookup = await loadRouteHandlerCacheLookup('docs');

      expect(lookup.targetId).toBe('docs');
      expect(lookup.isHeavyRoute('en', ['recognition'])).toBe(true);
      expect(lookup.isHeavyRoute('en', ['light-page'])).toBe(false);
    });
  });

  it('throws a targeted bootstrap error when the persisted lookup snapshot is missing or invalid', async () => {
    await withTempDir('next-slug-splitter-lookup-snapshot-', async rootDir => {
      process.chdir(rootDir);

      await expect(
        loadRouteHandlerCacheLookup('docs')
      ).rejects.toThrow('Missing route-handler lookup snapshot.');

      await writeRouteHandlerLookupSnapshot(
        rootDir,
        createRouteHandlerLookupSnapshot(false, ['docs'])
      );

      const snapshotPath = resolveRouteHandlerLookupSnapshotPath(rootDir);
      await writeFile(snapshotPath, '{"invalid":true}\n', 'utf8');

      await expect(
        readRouteHandlerLookupSnapshot(rootDir)
      ).resolves.toBeNull();
      await expect(
        shouldFilterHeavyRoutesInStaticPaths()
      ).rejects.toThrow('Missing route-handler lookup snapshot.');
    });
  });
});
