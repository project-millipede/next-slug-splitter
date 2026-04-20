import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Project, ScriptKind, SyntaxKind } from 'ts-morph';

import { resolveModuleReferenceToPath } from '../../../module-reference';
import { createConfigError } from '../../../utils/errors';

import type {
  ResolvedRouteHandlerModuleReference,
  RouteHandlerModuleReference
} from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../types';

/**
 * Resolve the TypeScript parser mode that matches one route-contract file.
 *
 * @param modulePath Absolute contract path.
 * @returns The matching ts-morph script kind.
 */
const resolveScriptKindFromPath = (modulePath: string): ScriptKind => {
  switch (path.extname(modulePath)) {
    case '.ts':
      return ScriptKind.TS;
    case '.tsx':
      return ScriptKind.TSX;
    case '.jsx':
      return ScriptKind.JSX;
    default:
      return ScriptKind.JS;
  }
};

/**
 * Create an in-memory source file used for contract inspection.
 *
 * @param routeModulePath Absolute route-contract path.
 * @returns Parsed source file for export inspection.
 */
const createInspectionSourceFile = async (routeModulePath: string) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true
    }
  });

  return project.createSourceFile(
    routeModulePath,
    await readFile(routeModulePath, 'utf8'),
    {
      overwrite: true,
      scriptKind: resolveScriptKindFromPath(routeModulePath)
    }
  );
};

/**
 * Check whether the inspected source exports one binding name.
 *
 * @param exportedDeclarations Map returned by `getExportedDeclarations()`.
 * @param exportName Binding name to look for.
 * @returns `true` when the export is present.
 */
const hasExportedBinding = (
  exportedDeclarations: ReadonlyMap<string, Array<import('ts-morph').Node>>,
  exportName: string
): boolean => (exportedDeclarations.get(exportName)?.length ?? 0) > 0;

/**
 * Read an exported literal `revalidate` value from the inspected contract.
 *
 * @param routeModulePath Absolute route-contract path.
 * @returns Exported `revalidate` value when present.
 */
const readInspectedRouteModuleRevalidate = async (
  routeModulePath: string
): Promise<number | false | undefined> => {
  const sourceFile = await createInspectionSourceFile(routeModulePath);
  const revalidateDeclaration = sourceFile
    .getVariableDeclarations()
    .find(declaration => {
      if (declaration.getName() !== 'revalidate') {
        return false;
      }

      return declaration.getVariableStatement()?.isExported() ?? false;
    });

  if (revalidateDeclaration == null) {
    return undefined;
  }

  const initializer = revalidateDeclaration.getInitializer();

  if (initializer == null) {
    throw createConfigError(
      `App Router route contract "${routeModulePath}" must initialize revalidate when exporting it.`
    );
  }

  if (initializer.getKind() === SyntaxKind.FalseKeyword) {
    return false;
  }

  if (initializer.getKind() === SyntaxKind.NumericLiteral) {
    return Number(initializer.getText());
  }

  throw createConfigError(
    `App Router route contract "${routeModulePath}" must export revalidate as a number or false when provided.`
  );
};

/**
 * Inspect the exported App route-contract surface from source code.
 *
 * The preferred App contract is intentionally narrow:
 * 1. `getStaticParams` is always required.
 * 2. `loadPageProps` is always required.
 * 3. `generatePageMetadata` is optional.
 * 4. `revalidate` is optional.
 *
 * @param rootDir Application root directory.
 * @param routeContract Resolved or unresolved module reference.
 * @returns Inspected contract metadata used by generation and bootstrap.
 */
const inspectAppRouteContractExports = async ({
  rootDir,
  routeContract
}: {
  rootDir: string;
  routeContract:
    | RouteHandlerModuleReference
    | ResolvedRouteHandlerModuleReference;
}): Promise<ResolvedAppRouteModuleContract> => {
  const routeModulePath = resolveModuleReferenceToPath(rootDir, routeContract);
  const sourceFile = await createInspectionSourceFile(routeModulePath);
  const exportedDeclarations = sourceFile.getExportedDeclarations();

  if (!hasExportedBinding(exportedDeclarations, 'getStaticParams')) {
    throw createConfigError(
      `App Router route contract "${routeModulePath}" must export getStaticParams.`
    );
  }

  if (!hasExportedBinding(exportedDeclarations, 'loadPageProps')) {
    throw createConfigError(
      `App Router route contract "${routeModulePath}" must export loadPageProps.`
    );
  }

  return {
    hasGeneratePageMetadata: hasExportedBinding(
      exportedDeclarations,
      'generatePageMetadata'
    ),
    revalidate: await readInspectedRouteModuleRevalidate(routeModulePath)
  };
};

/**
 * Inspect one App route contract after config normalization.
 *
 * @param rootDir Application root directory.
 * @param routeContract Resolved or unresolved route-contract reference.
 * @returns Structural contract metadata used by the App pipeline.
 */
export const inspectAppRouteModuleContract = async ({
  rootDir,
  routeContract
}: {
  rootDir: string;
  routeContract:
    | RouteHandlerModuleReference
    | ResolvedRouteHandlerModuleReference;
}): Promise<ResolvedAppRouteModuleContract> => {
  return inspectAppRouteContractExports({
    rootDir,
    routeContract
  });
};
