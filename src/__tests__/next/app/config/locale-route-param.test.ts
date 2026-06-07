import { describe, expect, test } from 'vitest';

import { resolveAppLocaleRouteParamPolicy } from '../../../../next/app/config/locale-route-param';

describe('App locale route-param policy', () => {
  test('defaults multi-locale App routes to the conventional locale param', () => {
    expect(resolveAppLocaleRouteParamPolicy(true, undefined)).toEqual({
      kind: 'param',
      name: 'locale'
    });
  });

  test('supports custom App locale route param names', () => {
    expect(resolveAppLocaleRouteParamPolicy(true, 'lang')).toEqual({
      kind: 'param',
      name: 'lang'
    });
  });

  test('keeps single-locale App routes explicitly locale-param free', () => {
    expect(resolveAppLocaleRouteParamPolicy(false, undefined)).toEqual({
      kind: 'none'
    });
  });

  test('rejects a locale route param without App locale config', () => {
    expect(() => resolveAppLocaleRouteParamPolicy(false, 'locale')).toThrow(
      'routeHandlersConfig.app.localeRouteParamName requires routeHandlersConfig.app.localeConfig.'
    );
  });

  test('rejects filesystem-segment syntax for custom App locale params', () => {
    expect(() => resolveAppLocaleRouteParamPolicy(true, '[locale]')).toThrow(
      'routeHandlersConfig.app.localeRouteParamName must be the bare route param name, for example "locale" instead of "[locale]".'
    );
  });
});
