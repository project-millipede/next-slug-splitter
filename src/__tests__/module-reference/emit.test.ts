import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { absoluteModule, packageModule } from '../../module-reference/create';
import {
  ensureRelativeSpecifier,
  toEmittedImportSource,
  toEmittedImportSpecifier,
  toPosix
} from '../../module-reference/emit';

/**
 * Test Coverage Overlook: Module Specifier Generation
 *
 * This suite verifies the transformation of filesystem paths and module
 * references into valid ES module import specifiers.
 *
 * 1. Resolution Logic (toEmittedImportSource)
 *    - Pass-through: Verifies bare packages and already-relative paths.
 *    - Relativize: Verifies absolute paths are correctly mapped relative
 *      to the generated handler file location.
 *
 * 2. Reference Conversion (toEmittedImportSpecifier)
 *    - Validates verbatim pass-throughs for packages and POSIX path
 *      normalization for file references.
 *
 * 3. Extension Management (stripModuleSourceExtension)
 *    - Source Stripping: Verifies removal of .ts, .tsx, .js, .jsx, .mjs, .cjs.
 *    - Preservation: Verifies non-source extensions (.json, .mdx) are intact.
 *
 * 4. Cross-Platform Integrity (toPosix & ensureRelativeSpecifier)
 *    - OS-specific separator normalization and mandatory relative prefixing.
 */

/**
 * PROJECT STRUCTURE MAP (Millipede / Next-Slug-Splitter Architecture)
 * Relativization is calculated FROM the BASE (Generated Handler).
 * The depth of the resulting specifier depends on directory traversal.
 *
 * demo/
 * ├── config-variants/
 * ├── content/
 * │   └── pages/
 * │       └── dashboard.mdx         (../../../content/pages/dashboard.mdx)
 * ├── lib/                          (../../../lib)      <-- 3 levels up, then down
 * │   ├── components/
 * │   │   └── Chart.tsx
 * │   └── mdx-runtime.tsx
 * ├── pages/                        (../../)            <-- 2 levels up
 * │   ├── _app.tsx                  (../../_app)
 * │   └── docs/                     (../)               <-- 1 level up
 * │       ├── [...slug].tsx         (../[...slug])      <-- The Catch-all Route
 * │       └── _handlers/            (./)                <-- Current directory
 * │           ├── interactive.ts    (./interactive)     <-- Sibling
 * │           └── dashboard.ts                          <-- BASE (PAGE_FILE)
 * └── scripts/
 *     └── build.cjs                 (../../../scripts/build)
 */

const ROOT = path.parse(process.cwd()).root;

/**
 * Helper to create an absolute path for testing purposes.
 * Makes scenarios significantly more readable by hiding the ROOT/join boilerplate.
 */
const abs = (...parts: string[]) => path.join(ROOT, 'demo', ...parts);

// The BASE is now the auto-generated handler inside the docs/ route
const PAGE_FILE = abs('pages', 'docs', '_handlers', 'dashboard.ts');

describe('toEmittedImportSource', () => {
  type SourceScenario = {
    id: string;
    description: string;
    source: string;
    expected: string;
  };

  const scenarios: SourceScenario[] = [
    // --- 1. Pass-through (Verbatim) ---
    {
      id: 'Pkg-Bare',
      description: 'Bare package name is returned unchanged',
      source: 'next/router',
      expected: 'next/router'
    },
    {
      id: 'Pkg-Scoped',
      description: 'Scoped package name is returned unchanged',
      source: '@millipede/core',
      expected: '@millipede/core'
    },
    {
      id: 'Rel-Current',
      description: 'Existing dot-relative path is returned unchanged',
      source: './interactive',
      expected: './interactive'
    },
    {
      id: 'Rel-Parent',
      description: 'Existing parent-relative path is returned unchanged',
      source: '../[...slug]',
      expected: '../[...slug]'
    },

    // --- 2. Relativization & Prefixing ---
    {
      id: 'Abs-Relativize',
      description: 'Absolute path to lib/ is relativized (3 levels up)',
      source: abs('lib', 'components', 'Chart.tsx'),
      expected: '../../../lib/components/Chart'
    },
    {
      id: 'Abs-Sibling',
      description: 'Sibling handler absolute path receives leading ./ prefix',
      source: abs('pages', 'docs', '_handlers', 'interactive.ts'),
      expected: './interactive'
    },
    {
      id: 'Abs-Immediate-Parent',
      description: 'Absolute path to the catch-all route results in ../',
      source: abs('pages', 'docs', '[...slug].tsx'),
      expected: '../[...slug]'
    },

    // --- 3. Extension Stripping (Source Types) ---
    {
      id: 'Ext-TSX',
      description: 'Source extension .tsx is stripped (_app layout)',
      source: abs('pages', '_app.tsx'),
      expected: '../../_app'
    },
    {
      id: 'Ext-MJS',
      description: 'Source extension .mjs is stripped (config variants)',
      source: abs('config-variants', 'default.mjs'),
      expected: '../../../config-variants/default'
    },
    {
      id: 'Ext-CJS',
      description: 'Source extension .cjs is stripped (scripts)',
      source: abs('scripts', 'build.cjs'),
      expected: '../../../scripts/build'
    },

    // --- 4. Extension Preservation (Non-Source) ---
    {
      id: 'Ext-Ignore-JSON',
      description: 'Non-source extension .json is preserved',
      source: abs('content', 'meta.json'),
      expected: '../../../content/meta.json'
    },
    {
      id: 'Ext-Ignore-MDX',
      description: 'Non-source extension .mdx content files are preserved',
      source: abs('content', 'pages', 'dashboard.mdx'),
      expected: '../../../content/pages/dashboard.mdx'
    },
    {
      id: 'Ext-Multi-Dot',
      description: 'Only the final known source extension is stripped',
      source: abs('lib', 'components', 'Chart.test.tsx'),
      expected: '../../../lib/components/Chart.test'
    }
  ];

  test.for(scenarios)('[$id] $description', ({ source, expected }) => {
    expect(toEmittedImportSource(PAGE_FILE, source)).toBe(expected);
  });
});

describe('toEmittedImportSpecifier', () => {
  type SpecifierScenario = {
    id: string;
    description: string;
    kind: 'package' | 'absolute';
    target: string;
    expected: string;
  };

  const scenarios: SpecifierScenario[] = [
    {
      id: 'Ref-Pkg',
      description: 'Package reference returns specifier verbatim',
      kind: 'package',
      target: 'react-dom/client',
      expected: 'react-dom/client'
    },
    {
      id: 'Ref-Abs-Deep',
      description: 'Deep file reference is relativized and normalized',
      kind: 'absolute',
      target: abs('lib', 'mdx-runtime.tsx'),
      expected: '../../../lib/mdx-runtime'
    }
  ];

  test.for(scenarios)('[$id] $description', ({ kind, target, expected }) => {
    const reference =
      kind === 'package' ? packageModule(target) : absoluteModule(target);

    expect(toEmittedImportSpecifier(PAGE_FILE, reference)).toBe(expected);
  });
});

describe('Utility Helpers (Edge Cases)', () => {
  describe('toPosix', () => {
    test('converts Windows separators to forward slashes', () => {
      // This will now pass on Linux and Windows
      expect(toPosix('pages\\docs\\_handlers\\dashboard.ts')).toBe(
        'pages/docs/_handlers/dashboard.ts'
      );
    });

    test('leaves existing POSIX slashes alone', () => {
      expect(toPosix('pages/docs/_handlers/dashboard.ts')).toBe(
        'pages/docs/_handlers/dashboard.ts'
      );
    });

    test('handles empty strings gracefully', () => {
      expect(toPosix('')).toBe('');
    });
  });

  describe('ensureRelativeSpecifier', () => {
    test('adds dot-slash prefix if missing', () => {
      expect(ensureRelativeSpecifier('handler-factory')).toBe(
        './handler-factory'
      );
      expect(ensureRelativeSpecifier('./handler-factory')).toBe(
        './handler-factory'
      );
      expect(ensureRelativeSpecifier('../handler-factory')).toBe(
        '../handler-factory'
      );
    });

    test('handles empty strings by returning a relative current-dir marker', () => {
      // If we get an empty string, we return './' to maintain a valid relative specifier
      expect(ensureRelativeSpecifier('')).toBe('./');
    });
  });
});
