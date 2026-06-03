import { describe, expect, it } from 'vitest';

import {
  groupHeavyRoutesForEmission,
  toRewriteHeavyPaths
} from '../../core/handler-emission-grouping';
import { createHeavyRoute } from '../helpers/builders';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG
} from '../helpers/fixtures';

describe('groupHeavyRoutesForEmission', () => {
  it('merges same-set locales of one slug into a single locale-less unit', () => {
    const routes = [
      createHeavyRoute({
        locale: 'en',
        slugArray: ['interactive'],
        handlerId: 'en-interactive',
        handlerRelativePath: 'interactive/en',
        usedLoadableComponentKeys: ['Counter']
      }),
      createHeavyRoute({
        locale: 'de',
        slugArray: ['interactive'],
        handlerId: 'de-interactive',
        handlerRelativePath: 'interactive/de',
        usedLoadableComponentKeys: ['Counter']
      })
    ];

    const units = groupHeavyRoutesForEmission(routes, TEST_MULTI_LOCALE_CONFIG);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      kind: 'merged',
      slugArray: ['interactive'],
      locales: ['de', 'en'],
      handlerRelativePath: 'interactive'
    });
  });

  it('keeps locales with distinct component sets separate (K > 1)', () => {
    const routes = [
      createHeavyRoute({
        locale: 'en',
        slugArray: ['mixed'],
        usedLoadableComponentKeys: ['Chart']
      }),
      createHeavyRoute({
        locale: 'de',
        slugArray: ['mixed'],
        usedLoadableComponentKeys: ['DataTable']
      })
    ];

    const units = groupHeavyRoutesForEmission(routes, TEST_MULTI_LOCALE_CONFIG);

    expect(units).toHaveLength(2);
    expect(units.every(unit => unit.kind === 'single')).toBe(true);
  });

  it('keeps a slug heavy in only one locale single (partial heavy)', () => {
    const routes = [
      createHeavyRoute({
        locale: 'en',
        slugArray: ['solo'],
        usedLoadableComponentKeys: ['Counter']
      })
    ];

    const units = groupHeavyRoutesForEmission(routes, TEST_MULTI_LOCALE_CONFIG);

    expect(units).toEqual([{ kind: 'single', route: routes[0] }]);
  });

  it('never merges in single-locale apps', () => {
    const routes = [
      createHeavyRoute({
        locale: 'en',
        slugArray: ['interactive'],
        usedLoadableComponentKeys: ['Counter']
      }),
      createHeavyRoute({
        locale: 'en',
        slugArray: ['dashboard'],
        usedLoadableComponentKeys: ['Counter']
      })
    ];

    const units = groupHeavyRoutesForEmission(routes, TEST_SINGLE_LOCALE_CONFIG);

    expect(units.every(unit => unit.kind === 'single')).toBe(true);
  });
});

describe('toRewriteHeavyPaths', () => {
  it('expands merged groups to per-locale routes at the locale-less destination', () => {
    const routes = [
      createHeavyRoute({
        locale: 'en',
        slugArray: ['interactive'],
        handlerRelativePath: 'interactive/en',
        usedLoadableComponentKeys: ['Counter']
      }),
      createHeavyRoute({
        locale: 'de',
        slugArray: ['interactive'],
        handlerRelativePath: 'interactive/de',
        usedLoadableComponentKeys: ['Counter']
      }),
      createHeavyRoute({
        locale: 'en',
        slugArray: ['solo'],
        handlerRelativePath: 'solo/en',
        usedLoadableComponentKeys: ['Chart']
      })
    ];

    const rewritePaths = toRewriteHeavyPaths(
      groupHeavyRoutesForEmission(routes, TEST_MULTI_LOCALE_CONFIG)
    );

    const shape = rewritePaths.map(route => ({
      locale: route.locale,
      slug: route.slugArray.join('/'),
      dest: route.handlerRelativePath
    }));

    expect(rewritePaths).toHaveLength(3);
    // both interactive locales rewrite to the single locale-less destination
    expect(shape).toContainEqual({
      locale: 'en',
      slug: 'interactive',
      dest: 'interactive'
    });
    expect(shape).toContainEqual({
      locale: 'de',
      slug: 'interactive',
      dest: 'interactive'
    });
    // the lone-locale route keeps its per-locale destination
    expect(shape).toContainEqual({ locale: 'en', slug: 'solo', dest: 'solo/en' });
  });
});
