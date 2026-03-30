import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSlugSplitterConfigFromPath } from '../../../next/integration';
import { withTempDir } from '../../helpers/temp-dir';

describe('loadSlugSplitterConfigFromPath', () => {
  it('rejects when the configured route-handlers config path does not exist', async () => {
    await withTempDir('next-slug-splitter-config-loader-', async rootDir => {
      await expect(
        loadSlugSplitterConfigFromPath(
          path.join(rootDir, 'missing-route-handlers-config.mjs')
        )
      ).rejects.toThrow();
    });
  });
});
