import {
  Node,
  Project,
  ScriptKind,
  SyntaxKind,
  type Expression
} from 'ts-morph';

/**
 * Read a property name from a static object literal.
 *
 * @param name Property name node from a parsed object.
 * @returns String key represented by the property name.
 */
const readStaticPropertyName = (name: Node): string => {
  if (Node.isIdentifier(name)) {
    return name.getText();
  }

  if (Node.isStringLiteral(name) || Node.isNumericLiteral(name)) {
    return name.getLiteralText();
  }

  throw new Error(`Unsupported static property name: ${name.getText()}`);
};

/**
 * Convert a parsed static expression into plain data.
 *
 * Next emits several build artifacts as JavaScript assignments rather than
 * JSON. This helper accepts only data-shaped expression forms and does not
 * execute the generated file.
 *
 * This reader belongs to the Turbopack-scoped benchmark tooling. It only
 * observes artifacts after Next and next-slug-splitter finish the build; it
 * does not affect route splitting, chunk generation, or runtime behavior.
 *
 * Turbopack currently emits the Pages Router `_buildManifest.js` assignment
 * as directly readable static data:
 *
 * ```js
 * self.__BUILD_MANIFEST = {
 *   '/docs/dashboard': ['static/chunks/dashboard.js']
 * };
 * ```
 *
 * Webpack can instead emit the same assignment as an immediately invoked
 * function:
 *
 * ```js
 * self.__BUILD_MANIFEST = function (chunk) {
 *   return { '/docs/dashboard': [chunk] };
 * }('static/chunks/dashboard.js');
 * ```
 *
 * That IIFE is outside the intended Turbopack benchmark scope and is
 * intentionally rejected. This limitation affects benchmark manifest
 * extraction only, not how next-slug-splitter works internally.
 *
 * @param expression Right-hand side expression from a static assignment.
 * @returns Plain data represented by the expression.
 */
const readStaticExpression = (expression: Expression): unknown => {
  if (Node.isParenthesizedExpression(expression)) {
    return readStaticExpression(expression.getExpression());
  }

  if (Node.isObjectLiteralExpression(expression)) {
    return Object.fromEntries(
      expression.getProperties().map(property => {
        if (!Node.isPropertyAssignment(property)) {
          throw new Error(`Unsupported static property: ${property.getText()}`);
        }

        return [
          readStaticPropertyName(property.getNameNode()),
          readStaticExpression(property.getInitializerOrThrow())
        ];
      })
    );
  }

  if (Node.isArrayLiteralExpression(expression)) {
    return expression
      .getElements()
      .map(element => readStaticExpression(element as Expression));
  }

  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralText();
  }

  if (Node.isNumericLiteral(expression)) {
    return Number(expression.getText());
  }

  if (expression.getKind() === SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.getKind() === SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.getKind() === SyntaxKind.NullKeyword) {
    return null;
  }

  if (
    Node.isVoidExpression(expression) &&
    expression.getExpression().getText() === '0'
  ) {
    return undefined;
  }

  if (Node.isIdentifier(expression) && expression.getText() === 'undefined') {
    return undefined;
  }

  throw new Error(`Unsupported static expression: ${expression.getText()}`);
};

/**
 * Extract static data from the right-hand side of a matching assignment.
 *
 * @param source JavaScript source emitted by Next.
 * @param filePath Absolute path to the JavaScript source.
 * @param description Human-readable assignment description for errors.
 * @param matchesLeft Predicate that selects the assignment's left-hand side.
 * @returns Plain data represented by the assignment's right-hand side.
 */
export const extractStaticAssignment = (
  source: string,
  filePath: string,
  description: string,
  matchesLeft: (left: Expression) => boolean
): unknown => {
  const project = new Project({ compilerOptions: { allowJs: true } });
  const sourceFile = project.createSourceFile(filePath, source, {
    scriptKind: ScriptKind.JS,
    overwrite: true
  });
  const assignment = sourceFile
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .find(expression => {
      const operator = expression.getOperatorToken().getText();

      return operator === '=' && matchesLeft(expression.getLeft());
    });

  if (assignment == null) {
    throw new Error(`Missing ${description} assignment in "${filePath}".`);
  }

  return readStaticExpression(assignment.getRight());
};
