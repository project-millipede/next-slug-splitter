import { describe, expect, test } from 'vitest';

import { toRoutePathSegments } from '../../../utils/route-path';

describe('route path segment helpers', () => {
  type Scenario = {
    id: string;
    description: string;
    routePath: string;
    expected: Array<string>;
  };

  const scenarios: Scenario[] = [
    {
      id: 'NestedPath',
      description: 'Splits slash-delimited route paths into ordered segments',
      routePath: '/de/docs/',
      expected: ['de', 'docs']
    },
    {
      id: 'RootPath',
      description: 'Returns no segments for the root route path',
      routePath: '/',
      expected: []
    },
    {
      id: 'EmptyPath',
      description: 'Returns no segments for an empty route path',
      routePath: '',
      expected: []
    },
    {
      id: 'RepeatedSeparators',
      description: 'Ignores empty segments from repeated separators',
      routePath: '/docs//a/',
      expected: ['docs', 'a']
    }
  ];

  test.for(scenarios)('[$id] $description', ({ routePath, expected }) => {
    expect(toRoutePathSegments(routePath)).toEqual(expected);
  });
});
