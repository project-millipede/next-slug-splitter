import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  removeRouteHandlerLazyOutputAtKnownLocation,
  removeRouteHandlerLazyOutputForIdentity
} from '../../../../next/proxy/lazy/stale-output-cleanup';
import { withTempDir } from '../../../helpers/temp-dir';

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

describe('proxy lazy stale-output cleanup', () => {
  it('removes the deterministic emitted handler file for a light route identity and prunes empty directories', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-cleanup-',
      async rootDir => {
        const handlersDir = path.join(rootDir, 'pages', 'content', '_handlers');
        const staleFilePath = path.join(handlersDir, 'guides', 'en.tsx');

        await mkdir(path.dirname(staleFilePath), {
          recursive: true
        });
        await writeFile(staleFilePath, '// stale\n', 'utf8');

        const removalStatus = await removeRouteHandlerLazyOutputForIdentity({
          config: {
            emitFormat: 'ts',
            contentLocaleMode: 'filename',
            paths: {
              handlersDir
            }
          },
          identity: {
            locale: 'en',
            slugArray: ['guides']
          }
        });

        expect(removalStatus).toBe('removed');
        expect(await fileExists(staleFilePath)).toBe(false);
        expect(await fileExists(path.join(handlersDir, 'guides'))).toBe(false);
      }
    );
  });

  it('removes a previously published lazy output by explicit location when the target disappears', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-cleanup-',
      async rootDir => {
        const handlersDir = path.join(rootDir, 'pages', 'blog', '_handlers');
        const staleFilePath = path.join(
          handlersDir,
          'application-extensibility',
          'en.tsx'
        );

        await mkdir(path.dirname(staleFilePath), {
          recursive: true
        });
        await writeFile(staleFilePath, '// stale\n', 'utf8');

        const removalStatus = await removeRouteHandlerLazyOutputAtKnownLocation({
          handlersDir,
          pageFilePath: staleFilePath
        });

        expect(removalStatus).toBe('removed');
        expect(await fileExists(staleFilePath)).toBe(false);
      }
    );
  });
});
