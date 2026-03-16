import { readFile } from 'node:fs/promises';

import { ts } from 'ts-morph';

import { resolveModuleReferenceToPath } from '../module-reference';
import { createPipelineError } from '../utils/errors';

import type { ResolvedModuleReference } from '../module-reference';

export type PageConfigMetadataEntry = {
  key: string;
  runtimeTraits: Array<string>;
};

export type PageConfigMetadata = {
  entries: Array<PageConfigMetadataEntry>;
};

const isIdentifierNamed = (node: ts.Node, name: string): boolean =>
  ts.isIdentifier(node) && node.text === name;

const isCallNamed = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) && isIdentifierNamed(node.expression, name);

const readPropertyName = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return undefined;
};

const getObjectProperty = (
  node: ts.ObjectLiteralExpression,
  propertyName: string
): ts.Expression | undefined => {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const name = readPropertyName(property.name);
    if (name === propertyName) {
      return property.initializer;
    }
  }

  return undefined;
};

const readStringArray = (
  node: ts.Expression | undefined,
  filePath: string,
  label: string
): Array<string> | undefined => {
  if (node == null) {
    return undefined;
  }

  if (ts.isPropertyAccessExpression(node)) {
    return [node.name.text];
  }

  if (!ts.isArrayLiteralExpression(node)) {
    throw createPipelineError(
      `${label} in "${filePath}" must be a string array literal or property access.`
    );
  }

  const values: Array<string> = [];
  for (const element of node.elements) {
    if (ts.isStringLiteral(element)) {
      values.push(element.text);
      continue;
    }

    if (ts.isPropertyAccessExpression(element)) {
      values.push(element.name.text);
      continue;
    }

    if (!ts.isStringLiteral(element)) {
      throw createPipelineError(
        `${label} in "${filePath}" must contain only string literals or property access expressions.`
      );
    }
  }

  return values;
};

const readEntryMetadata = ({
  key,
  initializer,
  filePath
}: {
  key: string;
  initializer: ts.Expression;
  filePath: string;
}): PageConfigMetadataEntry | undefined => {
  if (!isCallNamed(initializer, 'defineEntry')) {
    return undefined;
  }

  const [configArg] = initializer.arguments;
  if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
    return {
      key,
      runtimeTraits: []
    };
  }

  return {
    key,
    runtimeTraits:
      readStringArray(
        getObjectProperty(configArg, 'runtimeTraits'),
        filePath,
        `runtimeTraits for "${key}"`
      ) ?? []
  };
};

export const extractPageConfigMetadataFromSource = ({
  filePath,
  sourceText
}: {
  filePath: string;
  sourceText: string;
}): PageConfigMetadata => {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const entries: Array<PageConfigMetadataEntry> = [];

  const visit = (node: ts.Node): void => {
    if (isCallNamed(node, 'defineComponents')) {
      const [entriesArg] = node.arguments;

      if (entriesArg && ts.isObjectLiteralExpression(entriesArg)) {
        for (const property of entriesArg.properties) {
          if (!ts.isPropertyAssignment(property)) {
            continue;
          }

          const key = readPropertyName(property.name);
          if (key == null) {
            continue;
          }

          const entryMetadata = readEntryMetadata({
            key,
            initializer: property.initializer,
            filePath
          });
          if (entryMetadata != null) {
            entries.push(entryMetadata);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    entries
  };
};

export const loadPageConfigMetadata = async ({
  rootDir,
  reference
}: {
  rootDir: string;
  reference?: ResolvedModuleReference;
}): Promise<PageConfigMetadata | undefined> => {
  if (reference == null) {
    return undefined;
  }

  const filePath = resolveModuleReferenceToPath({
    rootDir,
    reference
  });
  const sourceText = await readFile(filePath, 'utf8');

  return extractPageConfigMetadataFromSource({
    filePath,
    sourceText
  });
};
