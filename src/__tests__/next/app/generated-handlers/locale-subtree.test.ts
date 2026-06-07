import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { hasGeneratedHandlersInAppLocaleSubtree } from '../../../../next/app/generated-handlers/location';

describe('App generated-handler locale subtree policy', () => {
  type Scenario = {
    id: string;
    description: string;
    generatedDirParts: Array<string>;
    localeRouteParamName?: string;
    expected: boolean;
  };

  const scenarios: Scenario[] = [
    {
      id: 'DefaultLocaleSubtree',
      description:
        'Detects generated handlers emitted below the default App locale route subtree',
      generatedDirParts: ['app', '[locale]', 'docs', 'generated-handlers'],
      localeRouteParamName: 'locale',
      expected: true
    },
    {
      id: 'ConventionalAppOutput',
      description:
        'Keeps conventional App generated-handler output locale-less',
      generatedDirParts: ['app', 'docs', 'generated-handlers'],
      localeRouteParamName: 'locale',
      expected: false
    },
    {
      id: 'DifferentLocaleParam',
      description:
        'Ignores generated handlers below a different App locale route param',
      generatedDirParts: ['app', '[language]', 'docs', 'generated-handlers'],
      localeRouteParamName: 'locale',
      expected: false
    },
    {
      id: 'CustomLocaleParam',
      description: 'Supports custom App locale route param names',
      generatedDirParts: ['app', '[lang]', 'docs', 'generated-handlers'],
      localeRouteParamName: 'lang',
      expected: true
    },
    {
      id: 'MissingLocaleParam',
      description:
        'Keeps generated handlers locale-less when no locale param is configured',
      generatedDirParts: ['app', '[locale]', 'docs', 'generated-handlers'],
      expected: false
    },
    {
      id: 'LateLocaleSegment',
      description:
        'Rejects locale segments below the route subtree instead of the App root',
      generatedDirParts: ['app', 'docs', '[locale]', 'generated-handlers'],
      localeRouteParamName: 'locale',
      expected: false
    },
    {
      id: 'OutsideAppRoot',
      description:
        'Rejects generated-handler directories outside the Next App Router tree',
      generatedDirParts: ['cache', '[locale]', 'docs', 'generated-handlers'],
      localeRouteParamName: 'locale',
      expected: false
    }
  ];

  test.for(scenarios)('[$id] $description', ({
    generatedDirParts,
    localeRouteParamName,
    expected
  }) => {
    expect(
      hasGeneratedHandlersInAppLocaleSubtree(
        {
          rootDir: '/repo',
          generatedDir: path.join('/repo', ...generatedDirParts)
        },
        localeRouteParamName
      )
    ).toBe(expected);
  });
});
