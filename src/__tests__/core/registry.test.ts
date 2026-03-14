import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadRouteRegistrySnapshot } from '../../core/registry';
import { withTempDir } from '../helpers/temp-dir';

describe('registry loading', () => {
  it('extracts component entry config with nested expansion map', async () => {
    await withTempDir('next-slug-splitter-registry-', async rootDir => {
      const buildtimeHandlerRegistryImport = path.join(
        rootDir,
        'fixtures/test-route-handler-registry.ts'
      );

      await mkdir(path.dirname(buildtimeHandlerRegistryImport), {
        recursive: true
      });
      await writeFile(
        buildtimeHandlerRegistryImport,
        `
export const routeHandlerRegistryManifest = {
  entries: [
    {
      key: 'WrapperComponent',
      import: {
        source: '@next-slug-splitter-test/layout',
        kind: 'named',
        importedName: 'WrapperComponent'
      },
      runtimeTraits: ['wrapper']
    },
    {
      key: 'SelectionComponent',
      import: {
        source: '@next-slug-splitter-test/layout',
        kind: 'named',
        importedName: 'SelectionComponent'
      },
      runtimeTraits: ['selection']
    },
    {
      key: 'AsyncComponent',
      import: {
        source: '@next-slug-splitter-test/async',
        kind: 'named',
        importedName: 'AsyncComponent'
      }
    }
  ],
  nestedDependencyMap: {
    SelectionComponent: ['NestedCustomComponent']
  }
};
        `.trim(),
        'utf8'
      );

      const parsed = await loadRouteRegistrySnapshot(
        buildtimeHandlerRegistryImport,
        rootDir
      );

      expect(parsed.entriesByKey.get('WrapperComponent')?.runtimeTraits).toEqual([
        'wrapper'
      ]);
      expect(parsed.entriesByKey.get('SelectionComponent')?.runtimeTraits).toEqual([
        'selection'
      ]);
      expect(parsed.entriesByKey.get('AsyncComponent')?.componentImport).toEqual({
        source: '@next-slug-splitter-test/async',
        kind: 'named',
        importedName: 'AsyncComponent'
      });
      expect(parsed.nestedDependencyMap).toEqual({
        SelectionComponent: ['NestedCustomComponent']
      });
    });
  });
});
