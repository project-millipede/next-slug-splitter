import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { createCatchAllAppRouteHandlerGeneratedRootDir } from '../../../../next/app/config/generated-root-dir';

describe('App generated root path construction', () => {
  test('builds the conventional single-locale App generated root', () => {
    expect(createCatchAllAppRouteHandlerGeneratedRootDir('/docs')).toBe(
      path.join('app', 'docs')
    );
  });

  test('builds the default multi-locale App generated root', () => {
    expect(
      createCatchAllAppRouteHandlerGeneratedRootDir('/docs', 'locale')
    ).toBe(path.join('app', '[locale]', 'docs'));
  });

  test('builds custom multi-locale App generated roots', () => {
    expect(createCatchAllAppRouteHandlerGeneratedRootDir('/docs', 'lang')).toBe(
      path.join('app', '[lang]', 'docs')
    );
  });

  test('builds root-mounted multi-locale App generated roots', () => {
    expect(createCatchAllAppRouteHandlerGeneratedRootDir('/', 'locale')).toBe(
      path.join('app', '[locale]')
    );
  });
});
