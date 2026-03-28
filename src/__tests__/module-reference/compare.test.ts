import { describe, expect, test } from 'vitest';

import {
  absoluteModule,
  relativeModule,
  packageModule
} from '../../module-reference/create';
import {
  getModuleReferenceValue,
  isSameModuleReference
} from '../../module-reference/compare';
import type { ModuleReference } from '../../module-reference/types';

describe('getModuleReferenceValue', () => {
  type Scenario = {
    id: string;
    description: string;
    reference: ModuleReference;
    expected: string;
  };

  const scenarios: Scenario[] = [
    {
      id: 'Package',
      description: 'Returns the specifier for package references',
      reference: packageModule('pkg/entry'),
      expected: 'pkg/entry'
    },
    {
      id: 'Relative',
      description: 'Returns the path for relative references',
      reference: relativeModule('lib/foo'),
      expected: 'lib/foo'
    },
    {
      id: 'Absolute',
      description: 'Returns the path for absolute-file references',
      reference: absoluteModule('/project/lib'),
      expected: '/project/lib'
    }
  ];

  test.for(scenarios)('[$id] $description', ({ reference, expected }) => {
    expect(getModuleReferenceValue(reference)).toBe(expected);
  });
});

describe('isSameModuleReference', () => {
  type Scenario = {
    id: string;
    description: string;
    left: ModuleReference;
    right: ModuleReference;
    expected: boolean;
  };

  const scenarios: Scenario[] = [
    {
      id: 'Package-Same',
      description: 'Returns true for identical package references',
      left: packageModule('pkg/a'),
      right: packageModule('pkg/a'),
      expected: true
    },
    {
      id: 'Package-Different',
      description: 'Returns false for different package specifiers',
      left: packageModule('pkg/a'),
      right: packageModule('pkg/b'),
      expected: false
    },
    {
      id: 'Kind-Mismatch',
      description: 'Returns false for different kinds with same value',
      left: relativeModule('lib/foo'),
      right: absoluteModule('lib/foo'),
      expected: false
    },
    {
      id: 'Absolute-Same',
      description: 'Returns true for identical absolute-file references',
      left: absoluteModule('/project/lib'),
      right: absoluteModule('/project/lib'),
      expected: true
    }
  ];

  test.for(scenarios)('[$id] $description', ({ left, right, expected }) => {
    expect(isSameModuleReference(left, right)).toBe(expected);
  });
});
