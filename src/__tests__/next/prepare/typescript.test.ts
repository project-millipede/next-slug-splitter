import { realpathSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  resolveAppLocalTypeScriptCompilerPath
} from '../../../next/shared/prepare/typescript';
import { writeTestModule } from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

type TypeScriptPackageManifestFixture = {
  name: 'typescript';
  type?: 'module';
  bin?: {
    tsc?: string;
    tsserver?: string;
  };
  exports?: Record<string, string>;
};

type TypeScriptMajorScenario = {
  major: 5 | 6 | 7;
  packageJson: TypeScriptPackageManifestFixture;
};

/**
 * Create a package manifest matching the TypeScript 5 and 6 CLI layout.
 *
 * Fixture characteristics:
 * 1. Declare the package name used by app-root resolution.
 * 2. Declare the `tsc` and `tsserver` command launchers.
 * 3. Omit an exports map to model the legacy package boundary.
 *
 * @returns A synthetic legacy TypeScript package manifest.
 */
const createLegacyTypeScriptPackageJson =
  (): TypeScriptPackageManifestFixture => ({
    name: 'typescript',
    bin: {
      tsc: './bin/tsc',
      tsserver: './bin/tsserver'
    }
  });

const TYPESCRIPT_MAJOR_SCENARIOS: Array<TypeScriptMajorScenario> = [
  {
    major: 5,
    packageJson: createLegacyTypeScriptPackageJson()
  },
  {
    major: 6,
    packageJson: createLegacyTypeScriptPackageJson()
  },
  {
    major: 7,
    packageJson: {
      name: 'typescript',
      type: 'module',
      bin: {
        tsc: './bin/tsc'
      },
      exports: {
        './package.json': './package.json'
      }
    }
  }
];

/**
 * Materialize one synthetic TypeScript package under a temporary app root.
 *
 * Fixture setup:
 * 1. Create the package manifest under `node_modules/typescript`.
 * 2. Create the compiler launcher declared by the manifest's `bin.tsc` field.
 * 3. Canonicalize the compiler path to match Node package resolution.
 * 4. Return the expected compiler path for the resolver assertion.
 *
 * @param rootDir - Temporary application root that owns the package fixture.
 * @param packageJson - Synthetic TypeScript package manifest to write.
 * @returns The canonical absolute path to the fixture's compiler launcher.
 */
const writeTypeScriptPackageFixture = async (
  rootDir: string,
  packageJson: TypeScriptPackageManifestFixture
): Promise<string> => {
  const packageRoot = path.join(rootDir, 'node_modules', 'typescript');
  const compilerPath = path.join(packageRoot, 'bin', 'tsc');

  await writeTestModule(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  await writeTestModule(compilerPath, '#!/usr/bin/env node\n');

  return realpathSync(compilerPath);
};

describe('app-local TypeScript compiler resolution', () => {
  test.for(TYPESCRIPT_MAJOR_SCENARIOS)(
    '[TypeScript $major] resolves the compiler declared by bin.tsc',
    async ({ packageJson }) => {
      await withTempDir(
        'next-slug-splitter-typescript-resolution-',
        async rootDir => {
          const expectedCompilerPath = await writeTypeScriptPackageFixture(
            rootDir,
            packageJson
          );

          expect(resolveAppLocalTypeScriptCompilerPath(rootDir)).toBe(
            expectedCompilerPath
          );
        }
      );
    }
  );

  test('wraps invalid TypeScript package metadata in a runtime error', async () => {
    await withTempDir(
      'next-slug-splitter-typescript-resolution-',
      async rootDir => {
        await writeTypeScriptPackageFixture(rootDir, {
          name: 'typescript',
          exports: {
            './package.json': './package.json'
          }
        });

        expect(() =>
          resolveAppLocalTypeScriptCompilerPath(rootDir)
        ).toThrowError(
          'Unable to resolve app-local TypeScript for routeHandlersConfig.app.prepare.'
        );
      }
    );
  });
});
