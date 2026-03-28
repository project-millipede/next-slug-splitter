import path from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  absoluteModule,
  relativeModule,
  packageModule
} from '../../module-reference/create';
import { normalizeModuleReference } from '../../module-reference/normalize';
import type { ModuleReference, ResolvedModuleReference } from '../../module-reference/types';

const ROOT = path.resolve('/project');

describe('normalizeModuleReference', () => {
  type Scenario = {
    id: string;
    description: string;
    reference: ModuleReference;
    expected: ResolvedModuleReference;
  };

  const scenarios: Scenario[] = [
    {
      id: 'Package',
      description: 'Passes through package references unchanged',
      reference: packageModule('pkg/entry'),
      expected: packageModule('pkg/entry')
    },
    {
      id: 'Relative',
      description: 'Resolves relative paths against rootDir',
      reference: relativeModule('lib/components/counter'),
      expected: absoluteModule(path.resolve(ROOT, 'lib/components/counter'))
    },
    {
      id: 'Absolute',
      description: 'Normalizes absolute-file references through path.resolve',
      reference: absoluteModule('/project/lib/../lib/factory'),
      expected: absoluteModule(path.resolve('/project/lib/factory'))
    }
  ];

  test.for(scenarios)('[$id] $description', ({ reference, expected }) => {
    expect(normalizeModuleReference(ROOT, reference)).toEqual(expected);
  });
});
