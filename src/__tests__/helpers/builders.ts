import path from 'node:path';

import type {
  HeavyRouteCandidate,
  ResolvedComponentImportSpec,
  LoadableComponentEntry,
  PlannedHeavyRoute
} from '../../core/types';
import { absoluteModule, packageModule } from '../../module-reference';
import type {
  DynamicRouteParam,
  ResolvedModuleReference,
  RouteHandlerNextPaths,
  RouteHandlerNextResult
} from '../../next/types';

import {
  TEST_COMPONENT_IMPORT_NAME,
  TEST_COMPONENT_IMPORT_SOURCE,
  TEST_PRIMARY_ROUTE_SEGMENT
} from './fixtures';

type ContentHandlerModuleInput = {
  routeBasePath: string;
  baseStaticPropsImport: ResolvedModuleReference;
  handlerRouteParam: DynamicRouteParam;
};

const DEFAULT_COMPONENT_IMPORT: ResolvedComponentImportSpec = {
  source: packageModule(TEST_COMPONENT_IMPORT_SOURCE),
  kind: 'named',
  importedName: TEST_COMPONENT_IMPORT_NAME
};

/**
 * Create a minimal test path record for next-slug-splitter tests.
 *
 * @param rootDir Temporary test root directory.
 * @returns Test path record rooted in the provided temp directory.
 */
export const createTestPaths = (rootDir: string): RouteHandlerNextPaths => ({
  rootDir,
  contentPagesDir: path.join(
    rootDir,
    TEST_PRIMARY_ROUTE_SEGMENT,
    'src',
    'pages'
  ),
  handlersDir: path.join(
    rootDir,
    'pages',
    TEST_PRIMARY_ROUTE_SEGMENT,
    '_handlers'
  )
});

/**
 * Create a heavy-route candidate fixture with optional overrides.
 *
 * @param overrides Partial heavy-route values to override in the default
 * fixture.
 * @returns Heavy-route fixture for tests.
 */
export const createHeavyRoute = (
  overrides: Partial<HeavyRouteCandidate> = {}
): HeavyRouteCandidate => ({
  locale: 'en',
  slugArray: ['example'],
  handlerId: 'en-example',
  handlerRelativePath: 'example/en',
  usedLoadableComponentKeys: ['CustomComponent'],
  ...overrides
});

/**
 * Create a planned heavy-route fixture with factory variant and component entries.
 *
 * @param overrides Partial planned heavy-route values to override defaults.
 * @returns Planned heavy-route fixture for tests.
 */
export const createPlannedHeavyRoute = (
  overrides: Partial<PlannedHeavyRoute> &
    Pick<PlannedHeavyRoute, 'factoryImport' | 'componentEntries'>
): PlannedHeavyRoute => ({
  ...createHeavyRoute(overrides),
  ...overrides
});

/**
 * Create a loadable-component-entry fixture with required key and optional overrides.
 *
 * @param overrides Loadable component entry overrides including the required `key`.
 * @returns Loadable component entry fixture for tests.
 */
export const createLoadableComponentEntry = (
  overrides: Partial<LoadableComponentEntry> &
    Pick<LoadableComponentEntry, 'key'>
): LoadableComponentEntry => ({
  componentImport: DEFAULT_COMPONENT_IMPORT,
  metadata: {},
  ...overrides
});

/**
 * Create a Next integration pipeline result fixture.
 *
 * @param overrides Partial result overrides.
 * @returns Route-handler Next result fixture for tests.
 */
export const createPipelineResult = (
  overrides: Partial<RouteHandlerNextResult> = {}
): RouteHandlerNextResult => ({
  targetId: 'test-target',
  analyzedCount: 1,
  heavyCount: 1,
  heavyPaths: [
    createHeavyRoute({
      locale: 'de',
      slugArray: ['nested', 'example'],
      handlerId: 'de-nested-example',
      handlerRelativePath: 'nested/example/de',
      usedLoadableComponentKeys: ['CustomComponent']
    })
  ],
  rewrites: [
    {
      source: '/de/content/nested/example',
      destination: '/content/_handlers/nested/example/de'
    }
  ],
  rewritesOfDefaultLocale: [],
  ...overrides
});

/**
 * Create the minimal handler-module input shared by generator tests.
 *
 * @returns Fixed handler-module input used in tests.
 */
export const createContentHandlerModuleInput = (
  rootDir: string
): ContentHandlerModuleInput => ({
  routeBasePath: '/content',
  baseStaticPropsImport: absoluteModule(
    path.join(rootDir, 'pages', 'content', '[...entry]')
  ),
  handlerRouteParam: { name: 'entry', kind: 'catch-all' }
});
