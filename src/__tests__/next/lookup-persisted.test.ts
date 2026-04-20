import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';

import {
  createRouteHandlerLookupSnapshot,
  parseRouteHandlerLookupSnapshot,
  readRouteHandlerLookupSnapshot,
  resolveRouteHandlerLookupSnapshotPath,
  serializeRouteHandlerLookupSnapshot,
  writeRouteHandlerLookupSnapshot
} from '../../next/shared/lookup-persisted';
import { createHeavyRoute } from '../helpers/builders';
import { TEST_SINGLE_LOCALE_CONFIG } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

const ORIGINAL_CWD = process.cwd();

describe('route-handler lookup snapshot persistence', () => {
  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
  });

  it('serializes and parses route-handler lookup snapshots without Next runtime semantics fields', () => {
    const snapshot = createRouteHandlerLookupSnapshot(true, [
      {
        targetId: 'blog',
        analyzedCount: 0,
        heavyCount: 0,
        heavyPaths: [],
        rewrites: [],
        rewritesOfDefaultLocale: []
      },
      {
        targetId: 'docs',
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [
          createHeavyRoute({
            locale: 'en',
            slugArray: ['guides', 'intro'],
            handlerId: 'docs-en-guides-intro',
            handlerRelativePath: 'guides/intro/en'
          })
        ],
        rewrites: [],
        rewritesOfDefaultLocale: []
      }
    ], {
      localeConfig: TEST_SINGLE_LOCALE_CONFIG
    });

    const serialized = serializeRouteHandlerLookupSnapshot(snapshot);
    const parsed = parseRouteHandlerLookupSnapshot(serialized);

    expect(serialized).toContain('localeConfig');
    expect(parsed).toEqual({
      version: 6,
      filterHeavyRoutesFromStaticRouteResult: true,
      localeConfig: TEST_SINGLE_LOCALE_CONFIG,
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
          version: 6,
          filterHeavyRoutesFromStaticRouteResult: true,
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          targets: [
            {
              targetId: '',
              heavyRoutePathKeys: []
            }
          ]
        })
      )
    ).toBeNull();

    expect(
      parseRouteHandlerLookupSnapshot(
        JSON.stringify({
          version: 6,
          filterHeavyRoutesFromStaticRouteResult: true,
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
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
        createRouteHandlerLookupSnapshot(true, [
          {
            targetId: 'docs',
            analyzedCount: 1,
            heavyCount: 1,
            heavyPaths: [
              createHeavyRoute({
                locale: 'en',
                slugArray: ['recognition'],
                handlerId: 'docs-en-recognition',
                handlerRelativePath: 'recognition/en'
              })
            ],
            rewrites: [],
            rewritesOfDefaultLocale: []
          }
        ], {
          localeConfig: TEST_SINGLE_LOCALE_CONFIG
        })
      );

      const snapshot = await readRouteHandlerLookupSnapshot(rootDir);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.filterHeavyRoutesFromStaticRouteResult).toBe(true);
      expect(snapshot!.localeConfig).toEqual(TEST_SINGLE_LOCALE_CONFIG);
      expect(snapshot!.targets).toEqual([
        { targetId: 'docs', heavyRoutePathKeys: ['en:recognition'] }
      ]);
    });
  });

  it('throws a targeted bootstrap error when the persisted lookup snapshot is missing or invalid', async () => {
    await withTempDir('next-slug-splitter-lookup-snapshot-', async rootDir => {
      process.chdir(rootDir);

      await expect(readRouteHandlerLookupSnapshot(rootDir)).resolves.toBeNull();

      await writeRouteHandlerLookupSnapshot(
        rootDir,
        createRouteHandlerLookupSnapshot(false, [], {
          localeConfig: TEST_SINGLE_LOCALE_CONFIG
        })
      );

      const snapshotPath = resolveRouteHandlerLookupSnapshotPath(rootDir);
      await writeFile(snapshotPath, '{"invalid":true}\n', 'utf8');

      await expect(readRouteHandlerLookupSnapshot(rootDir)).resolves.toBeNull();
    });
  });
});
