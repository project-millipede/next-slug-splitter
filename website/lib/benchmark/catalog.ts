/**
 * Targets the user can select and measure directly in the comparison UI.
 */
export type ComparisonTargetId =
  | 'app-router-multi-locale'
  | 'page-router';

/**
 * Internal unsplit heavy targets used as comparison baselines.
 */
export type BaselineTargetId =
  | 'app-router-multi-locale-heavy'
  | 'page-router-heavy';

/**
 * Any benchmark target known to the facade, including internal baselines.
 */
export type TargetId =
  | ComparisonTargetId
  | BaselineTargetId;

/**
 * Environment variable name that may point a target at a deployed origin.
 */
export type DemoTargetOriginEnvName = `BENCHMARK_${string}_ORIGIN`;

/**
 * Local HTTP origin used by the benchmark stack runner.
 */
export type DemoTargetLocalOrigin = `http://127.0.0.1:${number}`;

/**
 * Public app URL users can open outside the benchmark facade.
 */
export type DemoTargetAppUrl = `https://${string}`;

type DemoTargetBase<TId extends TargetId> = {
  /**
   * Stable target identifier used by manifests, route rows, and facade requests.
   */
  id: TId;
  /**
   * Human-readable target name shown in the benchmark UI.
   */
  label: string;
  /**
   * Browser-visible benchmark facade prefix owned by the website app.
   */
  zonePath: `/zones/${string}`;
  /**
   * Environment variable that can override the upstream deployment origin.
   */
  originEnvName: DemoTargetOriginEnvName;
  /**
   * Local fallback origin used when the origin environment variable is absent.
   */
  localOrigin: DemoTargetLocalOrigin;
};

export type ComparisonDemoTarget = DemoTargetBase<ComparisonTargetId> & {
  /**
   * Discriminator for targets measured directly by the benchmark table.
   */
  role: 'comparison';
  /**
   * Direct deployed app URL used by the "Open app" link.
   *
   * Measurements still use `zonePath` so the benchmark can keep all route and
   * chunk requests same-origin. This URL is only for humans exploring the demo
   * app with its own routing, language switch, and responsive behavior intact.
   */
  appUrl: DemoTargetAppUrl;
  /**
   * Internal heavy baseline target measured against this comparison target.
   */
  baselineTargetId: BaselineTargetId;
};

export type BaselineDemoTarget = DemoTargetBase<BaselineTargetId> & {
  /**
   * Discriminator for internal targets used only as heavy baselines.
   */
  role: 'baseline';
};

/**
 * Benchmark facade target. Comparison targets are user-facing; baseline targets
 * are internal upstreams loaded only when measuring the matching row.
 */
export type DemoTarget =
  | ComparisonDemoTarget
  | BaselineDemoTarget;

export type DemoRoute = {
  /**
   * Comparison target that owns this public route.
   */
  targetId: ComparisonTargetId;
  /**
   * Public route path owned by the target app, without the facade prefix.
   */
  path: `/${string}`;
  /**
   * Human-readable route label shown in the table.
   */
  label: string;
  /**
   * Route fixture kind used for UI badges and splitter payload expectations.
   * Light routes expect no route-specific splitter payload; heavy routes do.
   */
  kind: 'light' | 'heavy';
};

type DemoRouteCase = Omit<DemoRoute, 'targetId'>;

export const DEMO_TARGETS: ReadonlyArray<DemoTarget> = [
  {
    id: 'app-router-multi-locale',
    label: 'App Router multi-locale',
    role: 'comparison',
    zonePath: '/zones/app-router-multi-locale',
    originEnvName: 'BENCHMARK_APP_ROUTER_MULTI_LOCALE_ORIGIN',
    localOrigin: 'http://127.0.0.1:4001',
    appUrl: 'https://next-slug-splitter-app-router-multi.vercel.app',
    baselineTargetId: 'app-router-multi-locale-heavy'
  },
  {
    id: 'app-router-multi-locale-heavy',
    label: 'App Router multi-locale heavy baseline',
    role: 'baseline',
    zonePath: '/zones/app-router-multi-locale-heavy',
    originEnvName: 'BENCHMARK_APP_ROUTER_MULTI_LOCALE_HEAVY_ORIGIN',
    localOrigin: 'http://127.0.0.1:4002'
  },
  {
    id: 'page-router',
    label: 'Pages Router',
    role: 'comparison',
    zonePath: '/zones/page-router',
    originEnvName: 'BENCHMARK_PAGE_ROUTER_ORIGIN',
    localOrigin: 'http://127.0.0.1:4003',
    appUrl: 'https://next-slug-splitter-page-router-demo.vercel.app',
    baselineTargetId: 'page-router-heavy'
  },
  {
    id: 'page-router-heavy',
    label: 'Pages Router heavy baseline',
    role: 'baseline',
    zonePath: '/zones/page-router-heavy',
    originEnvName: 'BENCHMARK_PAGE_ROUTER_HEAVY_ORIGIN',
    localOrigin: 'http://127.0.0.1:4004'
  }
];

/**
 * Check whether a benchmark target is user-facing and directly measurable.
 *
 * @param target - Benchmark target to inspect.
 * @returns Whether the target is a comparison target.
 */
export const isComparisonDemoTarget = (
  target: DemoTarget
): target is ComparisonDemoTarget => target.role === 'comparison';

/**
 * Check whether a benchmark target is an internal heavy baseline target.
 *
 * @param target - Benchmark target to inspect.
 * @returns Whether the target is a baseline target.
 */
export const isBaselineDemoTarget = (
  target: DemoTarget
): target is BaselineDemoTarget => target.role === 'baseline';

/**
 * Filter the complete target list down to targets shown in the UI.
 *
 * @param targets - Benchmark targets, including internal baselines.
 * @returns User-facing comparison targets.
 */
const getComparisonDemoTargets = (
  targets: ReadonlyArray<DemoTarget>
): ReadonlyArray<ComparisonDemoTarget> =>
  targets.filter(isComparisonDemoTarget);

export const COMPARISON_DEMO_TARGETS = getComparisonDemoTargets(DEMO_TARGETS);

const DEMO_ROUTE_CASES: ReadonlyArray<DemoRouteCase> = [
  {
    path: '/docs/getting-started',
    label: 'Getting started',
    kind: 'light'
  },
  {
    path: '/docs/interactive',
    label: 'Interactive demo',
    kind: 'heavy'
  },
  {
    path: '/docs/dashboard',
    label: 'Dashboard',
    kind: 'heavy'
  }
];

/**
 * Create concrete route rows for every comparison target.
 *
 * The route cases define the shared docs scenarios once, while this helper
 * applies those scenarios to each selectable target so both router demos stay
 * in sync.
 *
 * @param targets - Comparison targets that should receive route rows.
 * @param routeCases - Shared route cases without target ownership.
 * @returns Concrete demo routes keyed by target and route path.
 */
const createDemoRoutes = (
  targets: ReadonlyArray<ComparisonDemoTarget>,
  routeCases: ReadonlyArray<DemoRouteCase>
): ReadonlyArray<DemoRoute> =>
  targets.flatMap(target =>
    routeCases.map(routeCase => ({
      targetId: target.id,
      ...routeCase
    }))
  );

export const DEMO_ROUTES = createDemoRoutes(
  COMPARISON_DEMO_TARGETS,
  DEMO_ROUTE_CASES
);

/**
 * Find any benchmark target by id.
 *
 * @param targetId - Target identifier from a route, URL segment, or request.
 * @returns Matching target, or `null` when the id is unknown.
 */
export const findDemoTarget = (targetId: string): DemoTarget | null =>
  DEMO_TARGETS.find(target => target.id === targetId) ?? null;

/**
 * Find a user-facing comparison target by id.
 *
 * @param targetId - Target identifier to resolve.
 * @returns Matching comparison target, or `null` for unknown or baseline ids.
 */
export const findComparisonDemoTarget = (
  targetId: string
): ComparisonDemoTarget | null => {
  const target = findDemoTarget(targetId);
  return target != null && isComparisonDemoTarget(target) ? target : null;
};

/**
 * Find an internal heavy baseline target by id.
 *
 * @param targetId - Target identifier to resolve.
 * @returns Matching baseline target, or `null` for unknown or comparison ids.
 */
export const findBaselineDemoTarget = (
  targetId: string
): BaselineDemoTarget | null => {
  const target = findDemoTarget(targetId);
  return target != null && isBaselineDemoTarget(target) ? target : null;
};

/**
 * Build the same-origin facade URL for a target route or asset path.
 *
 * @param target - Benchmark target exposed through the website facade.
 * @param path - Route or asset path inside the target application.
 * @returns Browser-visible URL under the target facade prefix.
 */
export const toZoneUrl = (target: DemoTarget, path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${target.zonePath}${normalizedPath}`;
};
