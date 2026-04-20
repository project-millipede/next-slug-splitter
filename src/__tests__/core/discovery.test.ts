import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  discoverLocalizedContentRoutes,
  resolveLocalizedContentRoute,
  sortStringArray,
  toHandlerId,
  toHandlerRelativePath,
  toRoutePath,
  toSlugPath
} from '../../core/discovery';
import { withTempDir } from '../helpers/temp-dir';

describe('discovery helpers', () => {
  it('builds route path from nested slug', () => {
    expect(toRoutePath('/content', ['nested', 'example'])).toBe(
      '/content/nested/example'
    );
  });

  it('builds root route path for empty slug', () => {
    expect(toRoutePath('/content', [])).toBe('/content');
    expect(toSlugPath([])).toBe('');
  });

  it('builds stable handler id', () => {
    expect(toHandlerId('de', ['nested', 'example'])).toBe('de-nested-example');
    expect(toHandlerId('en', [])).toBe('en-index');
  });

  it('builds nested handler relative path with locale leaf file', () => {
    expect(toHandlerRelativePath('de', ['nested', 'example'])).toBe(
      'nested/example/de'
    );
    expect(toHandlerRelativePath('en', [])).toBe('en');
  });

  it('builds flat handler relative path without locale leaf', () => {
    expect(
      toHandlerRelativePath('en', ['feature-summary'], {
        includeLocaleLeaf: false
      })
    ).toBe('feature-summary');
    expect(toHandlerRelativePath('en', [], { includeLocaleLeaf: false })).toBe(
      'index'
    );
  });

  it('sorts and dedupes string arrays deterministically', () => {
    expect(sortStringArray(['B', 'A', 'A', 'C'])).toEqual(['A', 'B', 'C']);
  });

  it('discovers locale-file routes in filename mode', async () => {
    await withTempDir('route-handler-discovery-', async rootDir => {
      const contentDir = path.join(rootDir, 'content/src/pages/nested/example');
      await mkdir(contentDir, { recursive: true });
      await writeFile(path.join(contentDir, 'en.mdx'), '# EN', 'utf8');
      await writeFile(path.join(contentDir, 'de.mdx'), '# DE', 'utf8');

      const discovered = await discoverLocalizedContentRoutes(
        path.join(rootDir, 'content/src/pages'),
        {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        'filename'
      );

      expect(discovered).toEqual([
        expect.objectContaining({
          locale: 'de',
          slugArray: ['nested', 'example']
        }),
        expect.objectContaining({
          locale: 'en',
          slugArray: ['nested', 'example']
        })
      ]);
    });
  });

  it('discovers non-localized routes in default-locale mode', async () => {
    await withTempDir('route-handler-discovery-', async rootDir => {
      const contentDir = path.join(rootDir, 'content/src/pages');
      await mkdir(contentDir, { recursive: true });
      await writeFile(
        path.join(contentDir, 'feature-summary.mdx'),
        '# Content',
        'utf8'
      );

      const discovered = await discoverLocalizedContentRoutes(
        contentDir,
        {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        'default-locale'
      );

      expect(discovered).toEqual([
        expect.objectContaining({
          locale: 'en',
          slugArray: ['feature-summary']
        })
      ]);
    });
  });

  it('resolves one filename-mode localized route by path-local lookup and preserves locale-prefixed variants', async () => {
    await withTempDir('route-handler-discovery-', async rootDir => {
      const contentDir = path.join(rootDir, 'content/src/pages/nested/example');
      await mkdir(contentDir, { recursive: true });
      await writeFile(path.join(contentDir, 'en.mdx'), '# EN', 'utf8');
      await writeFile(
        path.join(contentDir, 'en.page.mdx'),
        '# EN PAGE',
        'utf8'
      );

      const resolved = await resolveLocalizedContentRoute({
        contentDir: path.join(rootDir, 'content/src/pages'),
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        contentLocaleMode: 'filename',
        identity: {
          locale: 'en',
          slugArray: ['nested', 'example']
        }
      });

      expect(resolved).toEqual({
        locale: 'en',
        slugArray: ['nested', 'example'],
        filePath: path.join(contentDir, 'en.page.mdx')
      });
    });
  });

  it('resolves one default-locale route by deterministic file candidates', async () => {
    await withTempDir('route-handler-discovery-', async rootDir => {
      const contentDir = path.join(rootDir, 'content/src/pages');
      await mkdir(path.join(contentDir, 'guides'), { recursive: true });
      await writeFile(
        path.join(contentDir, 'guides', 'getting-started.mdx'),
        '# Content',
        'utf8'
      );

      const resolved = await resolveLocalizedContentRoute({
        contentDir,
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        contentLocaleMode: 'default-locale',
        identity: {
          locale: 'en',
          slugArray: ['guides', 'getting-started']
        }
      });

      expect(resolved).toEqual({
        locale: 'en',
        slugArray: ['guides', 'getting-started'],
        filePath: path.join(contentDir, 'guides', 'getting-started.mdx')
      });
    });
  });
});
