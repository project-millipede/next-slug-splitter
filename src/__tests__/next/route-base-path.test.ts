import { describe, expect, test } from 'vitest';

import { hasNonRootRouteBasePath } from '../../next/shared/route-base-path';

describe('route base path helpers', () => {
  test('detects whether a route base path is below the public root route', () => {
    expect(hasNonRootRouteBasePath('/')).toBe(false);
    expect(hasNonRootRouteBasePath('/a')).toBe(true);
    expect(hasNonRootRouteBasePath('/b')).toBe(true);
  });
});
