import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  discoverLocalizedContentRoutes,
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
    expect(toHandlerId('de', ['nested', 'example'])).toBe(
      'de-nested-example'
    );
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
      const contentPagesDir = path.join(
        rootDir,
        'content/src/pages/nested/example'
      );
      await mkdir(contentPagesDir, { recursive: true });
      await writeFile(path.join(contentPagesDir, 'en.mdx'), '# EN', 'utf8');
      await writeFile(path.join(contentPagesDir, 'de.mdx'), '# DE', 'utf8');

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
      const contentPagesDir = path.join(rootDir, 'content/src/pages');
      await mkdir(contentPagesDir, { recursive: true });
      await writeFile(
        path.join(contentPagesDir, 'feature-summary.mdx'),
        '# Content',
        'utf8'
      );

      const discovered = await discoverLocalizedContentRoutes(
        contentPagesDir,
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
});
