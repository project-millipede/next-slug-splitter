import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';

import {
  createAppRouteLookupSnapshot,
  parseAppRouteLookupSnapshot,
  readAppRouteLookupSnapshot,
  resolveAppRouteLookupSnapshotPath,
  serializeAppRouteLookupSnapshot,
  writeAppRouteLookupSnapshot
} from '../../../next/app/lookup-persisted';
import { withTempDir } from '../../helpers/temp-dir';

const ORIGINAL_CWD = process.cwd();

describe('App route lookup snapshot persistence', () => {
  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
  });

  it('serializes and parses App route lookup snapshots', () => {
    const snapshot = createAppRouteLookupSnapshot([
      {
        targetId: 'docs',
        handlerRouteParamName: 'slug',
        pageDataCompilerModulePath: '/repo/app/lib/content-compiler.mjs'
      },
      {
        targetId: 'blog',
        handlerRouteParamName: 'slug'
      }
    ]);

    const serialized = serializeAppRouteLookupSnapshot(snapshot);
    const parsed = parseAppRouteLookupSnapshot(serialized);

    expect(serialized).toContain('handlerRouteParamName');
    expect(parsed).toEqual({
      version: 1,
      targets: [
        {
          targetId: 'blog',
          handlerRouteParamName: 'slug'
        },
        {
          targetId: 'docs',
          handlerRouteParamName: 'slug',
          pageDataCompilerModulePath: '/repo/app/lib/content-compiler.mjs'
        }
      ]
    });
  });

  it('returns null for invalid persisted App lookup snapshot content', () => {
    expect(
      parseAppRouteLookupSnapshot(
        JSON.stringify({
          version: 1,
          targets: [
            {
              targetId: 'docs',
              handlerRouteParamName: ''
            }
          ]
        })
      )
    ).toBeNull();
  });

  it('reads App page-time metadata from the persisted snapshot', async () => {
    await withTempDir('next-slug-splitter-app-lookup-snapshot-', async rootDir => {
      process.chdir(rootDir);

      await writeAppRouteLookupSnapshot(
        rootDir,
        createAppRouteLookupSnapshot([
          {
            targetId: 'docs',
            handlerRouteParamName: 'slug',
            pageDataCompilerModulePath: '/repo/app/lib/content-compiler.mjs'
          }
        ])
      );

      const snapshot = await readAppRouteLookupSnapshot(rootDir);

      expect(snapshot).not.toBeNull();
      expect(snapshot).toEqual({
        version: 1,
        targets: [
          {
            targetId: 'docs',
            handlerRouteParamName: 'slug',
            pageDataCompilerModulePath: '/repo/app/lib/content-compiler.mjs'
          }
        ]
      });
    });
  });

  it('returns null when the persisted App lookup snapshot is missing or invalid', async () => {
    await withTempDir('next-slug-splitter-app-lookup-snapshot-', async rootDir => {
      process.chdir(rootDir);

      await expect(readAppRouteLookupSnapshot(rootDir)).resolves.toBeNull();

      await writeAppRouteLookupSnapshot(
        rootDir,
        createAppRouteLookupSnapshot([
          {
            targetId: 'docs',
            handlerRouteParamName: 'slug'
          }
        ])
      );

      const snapshotPath = resolveAppRouteLookupSnapshotPath(rootDir);
      await writeFile(snapshotPath, '{"invalid":true}\n', 'utf8');

      await expect(readAppRouteLookupSnapshot(rootDir)).resolves.toBeNull();
    });
  });
});
