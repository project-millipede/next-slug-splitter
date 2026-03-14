import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  resolveConfigPathFromArgv,
  resolveNextConfigPath
} from '../../cli/config-path';
import { withTempDir } from '../helpers/temp-dir';

describe('cli config path resolution', () => {
  it('resolves an explicit relative --config path from argv', () => {
    const rootDir = '/tmp/test-route-handlers-app';

    expect(
      resolveConfigPathFromArgv(['--config', 'config/next.config.mjs'], rootDir)
    ).toBe(path.join(rootDir, 'config', 'next.config.mjs'));
  });

  it('prefers explicit --config over discovered default config files', async () => {
    await withTempDir('next-slug-splitter-cli-', async rootDir => {
      await writeFile(path.join(rootDir, 'next.config.mjs'), 'export default {};\n');

      expect(
        resolveNextConfigPath({
          argv: ['--config', 'config/custom-next.config.mjs'],
          rootDir
        })
      ).toBe(path.join(rootDir, 'config', 'custom-next.config.mjs'));
    });
  });

  it('falls back to discovering a default next config file', async () => {
    await withTempDir('next-slug-splitter-cli-', async rootDir => {
      const nextConfigPath = path.join(rootDir, 'next.config.mjs');
      await writeFile(nextConfigPath, 'export default {};\n');

      expect(
        resolveNextConfigPath({
          argv: [],
          rootDir
        })
      ).toBe(nextConfigPath);
    });
  });
});
