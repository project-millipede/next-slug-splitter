import path from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  resolveLocaleConfigFromArgv,
  resolveRouteHandlersConfigPathFromArgv
} from '../../cli/options';

describe('cli option resolution', () => {
  const rootDir = '/tmp/test-route-handlers-app';

  describe('resolveRouteHandlersConfigPathFromArgv', () => {
    type SuccessScenario = {
      id: string;
      description: string;
      argv: Array<string>;
      expected: string;
    };

    type FailureScenario = {
      id: string;
      description: string;
      argv: Array<string>;
      expectedError: string;
    };

    const successScenarios: SuccessScenario[] = [
      {
        id: 'Relative',
        description: 'Resolves relative config paths against rootDir',
        argv: ['--route-handlers-config-path', 'config/route-handlers-config.mjs'],
        expected: path.join(rootDir, 'config', 'route-handlers-config.mjs')
      },
      {
        id: 'Absolute',
        description: 'Returns absolute config paths unchanged',
        argv: [
          '--route-handlers-config-path',
          '/workspace/custom/route-handlers-config.mjs'
        ],
        expected: '/workspace/custom/route-handlers-config.mjs'
      }
    ];

    const failureScenarios: FailureScenario[] = [
      {
        id: 'MissingFlag',
        description: 'Fails when the config-path flag is missing',
        argv: [],
        expectedError:
          'Missing --route-handlers-config-path. Pass a path to your route-handlers config file.'
      },
      {
        id: 'MissingValue',
        description: 'Fails when the config-path flag has no value',
        argv: ['--route-handlers-config-path'],
        expectedError:
          'Missing value for --route-handlers-config-path. Pass a path to your route-handlers config file.'
      }
    ];

    test.for(successScenarios)('[$id] $description', ({ argv, expected }) => {
      expect(resolveRouteHandlersConfigPathFromArgv(argv, rootDir)).toBe(
        expected
      );
    });

    test.for(failureScenarios)('[$id] $description', ({
      argv,
      expectedError
    }) => {
      expect(() => resolveRouteHandlersConfigPathFromArgv(argv, rootDir)).toThrow(
        expectedError
      );
    });
  });

  describe('resolveLocaleConfigFromArgv', () => {
    type SuccessScenario = {
      id: string;
      description: string;
      argv: Array<string>;
      expected: ReturnType<typeof resolveLocaleConfigFromArgv>;
    };

    type FailureScenario = {
      id: string;
      description: string;
      argv: Array<string>;
      expectedError: string;
    };

    const successScenarios: SuccessScenario[] = [
      {
        id: 'TrimmedLocales',
        description: 'Parses explicit locale config and preserves locale order',
        argv: ['--locales', 'en, de,fr', '--default-locale', 'de'],
        expected: {
          locales: ['en', 'de', 'fr'],
          defaultLocale: 'de'
        }
      }
    ];

    const failureScenarios: FailureScenario[] = [
      {
        id: 'MissingLocales',
        description: 'Fails when --locales is missing',
        argv: ['--default-locale', 'en'],
        expectedError:
          'Missing --locales. Pass a comma-separated locale list.'
      },
      {
        id: 'MissingDefaultLocale',
        description: 'Fails when --default-locale is missing',
        argv: ['--locales', 'en,de'],
        expectedError:
          'Missing --default-locale. Pass the default locale from --locales.'
      },
      {
        id: 'EmptyLocaleEntry',
        description: 'Fails when locales contain empty entries',
        argv: ['--locales', 'en, ,de', '--default-locale', 'en'],
        expectedError: '--locales must not contain empty locale entries.'
      },
      {
        id: 'DuplicateLocale',
        description: 'Fails when locales contain duplicates',
        argv: ['--locales', 'en,de,en', '--default-locale', 'en'],
        expectedError: '--locales must not contain duplicate locales.'
      },
      {
        id: 'DefaultMissingFromLocales',
        description: 'Fails when the default locale is not in the locale list',
        argv: ['--locales', 'en,de', '--default-locale', 'fr'],
        expectedError:
          '--default-locale "fr" must be included in --locales.'
      }
    ];

    test.for(successScenarios)('[$id] $description', ({ argv, expected }) => {
      expect(resolveLocaleConfigFromArgv(argv)).toEqual(expected);
    });

    test.for(failureScenarios)('[$id] $description', ({
      argv,
      expectedError
    }) => {
      expect(() => resolveLocaleConfigFromArgv(argv)).toThrow(expectedError);
    });
  });
});
