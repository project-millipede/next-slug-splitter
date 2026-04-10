import { describe, expect, test } from 'vitest';

import { formatRouteHandlerCliSummary } from '../../cli/summary';

import type { RouteHandlerNextResult } from '../../next/shared/types';

describe('cli summary formatting', () => {
  const result: RouteHandlerNextResult = {
    targetId: 'docs',
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
    ],
    rewritesOfDefaultLocale: [
      {
        source: '/en/docs/dashboard',
        destination: '/en/docs/_handlers/dashboard',
        locale: false
      },
      {
        source: '/en/docs/interactive',
        destination: '/en/docs/_handlers/interactive',
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
      description:
        'reports concrete handler and rewrite counts for generate mode',
      analyzeOnly: false,
      expected:
        '[docs] analyzed 4 route paths, selected 2 heavy paths, generated 2 handlers, produced 4 rewrite entries (2 rewrites + 2 of default locale).'
    },
    {
      id: 'Analyze',
      description:
        'reports prospective handler and rewrite counts for analyze-only mode',
      analyzeOnly: true,
      expected:
        '[docs] analyzed 4 route paths, selected 2 heavy paths, would generate 2 handlers, would produce 4 rewrite entries (2 rewrites + 2 of default locale) (analyze-only).'
    }
  ];

  test.for(scenarios)('[$id] $description', ({ analyzeOnly, expected }) => {
    expect(formatRouteHandlerCliSummary([result], analyzeOnly)).toBe(expected);
  });
});
