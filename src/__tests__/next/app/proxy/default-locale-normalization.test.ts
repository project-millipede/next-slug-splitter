import { describe, expect, test } from 'vitest';

import { buildAppDefaultLocaleNormalizationProxyDecision } from '../../../../next/app/proxy/default-locale-normalization';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG
} from '../../../helpers/fixtures';

import type { LocaleConfig } from '../../../../core/types';
import type { RouteHandlerProxyWorkerPassThroughPayload } from '../../../../next/proxy/worker/types';

const createMatchedTargetPayload = (
  overrides: Partial<
    Extract<
      RouteHandlerProxyWorkerPassThroughPayload,
      { reason: 'light' | 'missing-route-file' }
    >
  > = {}
): Extract<
  RouteHandlerProxyWorkerPassThroughPayload,
  { reason: 'light' | 'missing-route-file' }
> => ({
  reason: 'light',
  routerKind: 'app',
  routeBasePath: '/docs',
  locale: 'en',
  slugArray: ['a'],
  ...overrides
});

const createDecision = ({
  pathname = '/docs/a',
  routeBasePaths = ['/docs'],
  localeConfig = TEST_MULTI_LOCALE_CONFIG,
  payload = createMatchedTargetPayload()
}: {
  pathname?: string;
  routeBasePaths?: Array<string>;
  localeConfig?: LocaleConfig;
  payload?: RouteHandlerProxyWorkerPassThroughPayload;
} = {}) =>
  buildAppDefaultLocaleNormalizationProxyDecision({
    pathname,
    routeBasePaths,
    localeConfig,
    payload
  });

describe('App default-locale proxy normalization', () => {
  test('rewrites default-locale unprefixed App light routes', () => {
    expect(createDecision()).toEqual({
      kind: 'rewrite',
      pathname: '/docs/a',
      routeBasePaths: ['/docs'],
      rewriteDestination: '/en/docs/a'
    });
  });

  test('rewrites default-locale unprefixed App missing routes', () => {
    expect(
      createDecision({
        pathname: '/docs/missing',
        payload: createMatchedTargetPayload({
          reason: 'missing-route-file',
          slugArray: ['missing']
        })
      })
    ).toEqual({
      kind: 'rewrite',
      pathname: '/docs/missing',
      routeBasePaths: ['/docs'],
      rewriteDestination: '/en/docs/missing'
    });
  });

  test('falls back to the payload route base for decision headers', () => {
    expect(
      createDecision({
        routeBasePaths: []
      })
    ).toMatchObject({
      routeBasePaths: ['/docs']
    });
  });

  test.for([
    {
      description: 'ignores Pages Router pass-through payloads',
      payload: createMatchedTargetPayload({ routerKind: 'pages' })
    },
    {
      description: 'ignores no-target pass-through payloads',
      payload: { reason: 'no-target' } as const
    },
    {
      description:
        'ignores missing-rewrite-destination pass-through payloads',
      payload: { reason: 'missing-rewrite-destination' } as const
    },
    {
      description: 'does not normalize single-locale App routes',
      localeConfig: TEST_SINGLE_LOCALE_CONFIG,
      payload: createMatchedTargetPayload()
    },
    {
      description: 'does not normalize root App targets',
      payload: createMatchedTargetPayload({ routeBasePath: '/' })
    },
    {
      description: 'does not normalize non-default locale App routes',
      pathname: '/de/docs/a',
      payload: createMatchedTargetPayload({
        locale: 'de'
      })
    },
    {
      description: 'does not normalize already locale-prefixed App routes',
      pathname: '/en/docs/a',
      payload: createMatchedTargetPayload()
    }
  ])('$description', ({ pathname, localeConfig, payload }) => {
    expect(
      createDecision({
        pathname,
        localeConfig,
        payload
      })
    ).toBeNull();
  });
});
