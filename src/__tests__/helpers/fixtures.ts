import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  appRelativeModule,
  packageModule
} from '../../module-reference';
import type {
  ModuleReference,
  RouteHandlerBinding
} from '../../next/types';

export const TEST_PRIMARY_ROUTE_SEGMENT = 'content';
export const TEST_SECONDARY_ROUTE_SEGMENT = 'secondary';
export const TEST_CATCH_ALL_ROUTE_PARAM_NAME = 'entry';
export const TEST_SINGLE_ROUTE_PARAM_NAME = 'item';

export const TEST_PRIMARY_CONTENT_PAGES_DIR = 'content/src/pages';
export const TEST_SECONDARY_CONTENT_PAGES_DIR = 'secondary/src/pages';

export const TEST_PRIMARY_COMPONENTS_IMPORT =
  'test-route-handlers/primary/components';
export const TEST_SECONDARY_COMPONENTS_IMPORT =
  'test-route-handlers/secondary/components';

export const TEST_PRIMARY_FACTORY_IMPORT =
  'test-route-handlers/primary/factory';
export const TEST_SECONDARY_FACTORY_IMPORT =
  'test-route-handlers/secondary/factory';
export const TEST_PRIMARY_PROCESSOR_IMPORT =
  'test-route-handlers/primary/processor';
export const TEST_SECONDARY_PROCESSOR_IMPORT =
  'test-route-handlers/secondary/processor';

export const TEST_STATIC_PROPS_IMPORT =
  '@next-slug-splitter-test/static-props';
export const TEST_COMPONENT_IMPORT_SOURCE =
  '@next-slug-splitter-test/components';
export const TEST_COMPONENT_IMPORT_NAME = 'CustomComponent';

const DEFAULT_TEST_FACTORY_VARIANTS = ['none', 'selection', 'wrapper'];

type WriteTestRouteHandlerPackageOptions = {
  primaryVariants?: Array<string>;
  secondaryVariants?: Array<string>;
};

/**
 * Write a source module to disk, creating parent directories as needed.
 */
export const writeTestModule = async (
  filePath: string,
  source: string
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
};

/**
 * Render the Next.js page filename segment for one dynamic route param.
 */
const toDynamicPageSegment = ({
  name,
  kind
}: {
  name: string;
  kind: 'single' | 'catch-all' | 'optional-catch-all';
}): string =>
  kind === 'single'
    ? `[${name}]`
    : kind === 'catch-all'
      ? `[...${name}]`
      : `[[...${name}]]`;

const createComponentModuleSource = (): string =>
  [
    'export const CustomComponent = () => null;',
    'export const SecondaryComponent = () => null;',
    'export const WrapperComponent = () => null;',
    'export const SelectionComponent = () => null;',
    ''
  ].join('\n');

const createFactoryModuleSource = (): string =>
  [
    'export const createHandlerPage = input => input;',
    ''
  ].join('\n');

const createProcessorModuleSource = (): string =>
  [
    'export const routeHandlerProcessor = {',
    '  ingress({ capturedKeys }) {',
    '    return Object.fromEntries(capturedKeys.map(key => [key, {}]));',
    '  },',
    '  egress({ capturedKeys }) {',
    '    return {',
    "      factoryVariant: 'none',",
    '      components: capturedKeys.map(key => ({ key }))',
    '    };',
    '  }',
    '};',
    ''
  ].join('\n');

const createFactoryExports = ({
  family,
  variants
}: {
  family: 'primary' | 'secondary';
  variants: Array<string>;
}): Record<string, string> => {
  const exportsRecord: Record<string, string> = {
    [`./${family}/factory`]: `./${family}/factory/index.js`,
    [`./${family}/processor`]: `./${family}/processor.js`
  };

  for (const variant of variants) {
    exportsRecord[`./${family}/factory/${variant}`] =
      `./${family}/factory/${variant}.js`;
  }

  return exportsRecord;
};

export const createTestHandlerBinding = ({
  componentsImport = packageModule(TEST_PRIMARY_COMPONENTS_IMPORT),
  importBase = packageModule(TEST_PRIMARY_FACTORY_IMPORT),
  processorImport
}: {
  componentsImport?: ModuleReference;
  importBase?: ModuleReference;
  processorImport?: ModuleReference;
} = {}): RouteHandlerBinding => {
  const resolvedProcessorImport =
    processorImport ??
    (componentsImport.kind === 'package' &&
    componentsImport.specifier === TEST_SECONDARY_COMPONENTS_IMPORT
      ? packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
      : packageModule(TEST_PRIMARY_PROCESSOR_IMPORT));

  return {
    componentsImport,
    processorImport: resolvedProcessorImport,
    runtimeFactory: {
      importBase
    }
  };
};

export const writeTestRouteHandlerPackage = async (
  rootDir: string,
  {
    primaryVariants = DEFAULT_TEST_FACTORY_VARIANTS,
    secondaryVariants = DEFAULT_TEST_FACTORY_VARIANTS
  }: WriteTestRouteHandlerPackageOptions = {}
): Promise<void> => {
  const packageDir = path.join(rootDir, 'node_modules', 'test-route-handlers');
  const packageJsonPath = path.join(packageDir, 'package.json');
  const packageJson = {
    name: 'test-route-handlers',
    type: 'module',
    exports: {
      './primary/components': './primary/components.js',
      './secondary/components': './secondary/components.js',
      ...createFactoryExports({
        family: 'primary',
        variants: primaryVariants
      }),
      ...createFactoryExports({
        family: 'secondary',
        variants: secondaryVariants
      })
    }
  };

  await writeTestModule(path.join(rootDir, 'package.json'), '{}\n');
  await writeTestModule(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  await writeTestModule(
    path.join(packageDir, 'primary', 'components.js'),
    createComponentModuleSource()
  );
  await writeTestModule(
    path.join(packageDir, 'primary', 'processor.js'),
    createProcessorModuleSource()
  );
  await writeTestModule(
    path.join(packageDir, 'secondary', 'components.js'),
    createComponentModuleSource()
  );
  await writeTestModule(
    path.join(packageDir, 'secondary', 'processor.js'),
    createProcessorModuleSource()
  );
  await writeTestModule(
    path.join(packageDir, 'primary', 'factory', 'index.js'),
    createFactoryModuleSource()
  );
  await writeTestModule(
    path.join(packageDir, 'secondary', 'factory', 'index.js'),
    createFactoryModuleSource()
  );

  for (const variant of primaryVariants) {
    await writeTestModule(
      path.join(packageDir, 'primary', 'factory', `${variant}.js`),
      createFactoryModuleSource()
    );
  }

  for (const variant of secondaryVariants) {
    await writeTestModule(
      path.join(packageDir, 'secondary', 'factory', `${variant}.js`),
      createFactoryModuleSource()
    );
  }
};

/**
 * Materialize the source page referenced by `baseStaticPropsImport`.
 *
 * Key aspects:
 * 1. Config resolution validates that the module reference points to a real
 *    source page on disk.
 * 2. Tests that expect successful resolution must create that page
 *    explicitly.
 * 3. Without that file, the failure occurs during config validation rather
 *    than in the behavior under test.
 */
export const writeTestBaseStaticPropsPage = async (
  rootDir: string,
  {
    routeSegment,
    handlerRouteParam
  }: {
    routeSegment: string;
    handlerRouteParam: {
      name: string;
      kind: 'single' | 'catch-all' | 'optional-catch-all';
    };
  }
): Promise<void> => {
  const pageSegment = toDynamicPageSegment(handlerRouteParam);

  await writeTestModule(
    path.join(rootDir, 'pages', routeSegment, `${pageSegment}.tsx`),
    [
      'export const getStaticProps = async () => ({ props: {} });',
      '',
      'export default function TestRoutePage() {',
      '  return null;',
      '}',
      ''
    ].join('\n')
  );
};

export const createTestBaseStaticPropsReference = (): ModuleReference =>
  appRelativeModule('pages/content/[...entry]');
