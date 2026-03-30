import { describe, expect, test } from 'vitest';

import { formatRouteHandlerCliSummary } from '../../cli/summary';

import type { RouteHandlerNextResult } from '../../next/types';

describe('cli summary formatting', () => {
  const result: RouteHandlerNextResult = {
    analyzedCount: 4,
    heavyCount: 2,
    heavyPaths: [],
    rewrites: [
      {
        source: '/docs/dashboard',
        destination: '/docs/_handlers/dashboard',
        locale: false
      },
      {
        source: '/docs/interactive',
        destination: '/docs/_handlers/interactive',
        locale: false
      }
    ]
  };

  type Scenario = {
    id: string;
    description: string;
    analyzeOnly: boolean;
    expected: string;
  };

  const scenarios: Scenario[] = [
    {
      id: 'Generate',
      description: 'reports concrete handler and rewrite counts for generate mode',
      analyzeOnly: false,
      expected:
        'analyzed 4 route paths, selected 2 heavy paths, generated 2 handlers, produced 2 rewrite entries.'
    },
    {
      id: 'Analyze',
      description: 'reports prospective handler and rewrite counts for analyze-only mode',
      analyzeOnly: true,
      expected:
        'analyzed 4 route paths, selected 2 heavy paths, would generate 2 handlers, would produce 2 rewrite entries (analyze-only).'
    }
  ];

  test.for(scenarios)('[$id] $description', ({ analyzeOnly, expected }) => {
    expect(formatRouteHandlerCliSummary(result, analyzeOnly)).toBe(expected);
  });
});
