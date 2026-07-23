import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '../..');

const DEMO_DIRECTORIES = [
  'demo/app-router-multi-locale',
  'demo/app-router-multi-locale-heavy',
  'demo/page-router',
  'demo/page-router-heavy'
];

const VISIBLE_ROUTE_SLUGS = [
  'getting-started',
  'interactive',
  'dashboard'
];

const LOCALE_PREFIXES = ['', '/en', '/de'];

const SPLITTER_ROUTE_SLUGS = [
  'interactive',
  'dashboard'
];

const BASELINE_ROUTE_SLUGS = [
  'getting-started',
  'interactive',
  'dashboard',
  'tutorial'
];

const REQUEST_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * @typedef {'splitter' | 'baseline'} ReleaseTargetKind
 */

/**
 * Benchmark deployment whose public routes and generated manifest are verified.
 *
 * @typedef {object} ReleaseTarget
 * @property {string} id Stable target identifier used by the facade.
 * @property {string} origin Absolute origin of the direct Vercel deployment.
 * @property {string} zonePath Browser-visible path exposed by the website facade.
 * @property {ReleaseTargetKind} kind Expected benchmark implementation kind.
 * @property {string} manifestFilename Expected generated manifest filename.
 */

/**
 * Route entry before its generated handler and payload fields are validated.
 *
 * @typedef {object} BenchmarkManifestRoute
 * @property {unknown} [generatedHandlerPath] Generated splitter handler path.
 * @property {unknown} [payloadChunk] Exact selected JavaScript payload path.
 */

/**
 * Parsed benchmark manifest after its top-level `routes` property is verified.
 * Individual route entries are validated by `validateManifest`.
 *
 * @typedef {object} BenchmarkManifest
 * @property {Record<string, BenchmarkManifestRoute>} routes Route entries keyed
 * by route path.
 */

/**
 * Check whether an unknown value is a non-array object record.
 *
 * @param {unknown} value Value to inspect.
 * @returns {value is Record<string, unknown>} Whether the value can be treated
 * as an object record.
 */
const isObjectRecord = value =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * Stop verification with a descriptive release error.
 *
 * @param {string} message Failure message shown in the workflow log.
 * @returns {never} This function never returns because it always throws.
 * @throws {Error} Always, using the provided message.
 */
const fail = message => {
  throw new Error(message);
};

/**
 * Normalize an origin so paths can be appended without duplicate slashes.
 *
 * @param {string} value Origin supplied through a command-line option.
 * @returns {string} Origin without one trailing slash.
 */
const normalizeOrigin = value => value.replace(/\/$/, '');

/**
 * Parse alternating command-line option names and values.
 *
 * @param {ReadonlyArray<string>} values Arguments following the verifier command.
 * @returns {Map<string, string>} Parsed values keyed by their `--option` names.
 * @throws {Error} When an option name or its corresponding value is missing.
 */
const readOptions = values => {
  const options = new Map();

  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];

    if (name == null || !name.startsWith('--') || value == null) {
      fail(`Expected an option name and value, received "${name ?? ''}".`);
    }

    options.set(name, value);
  }

  return options;
};

/**
 * Read and normalize one required command-line option.
 *
 * @param {ReadonlyMap<string, string>} options Parsed command-line options.
 * @param {string} name Required `--option` name.
 * @returns {string} Non-empty option value without one trailing slash.
 * @throws {Error} When the requested option is absent or empty.
 */
const requireOption = (options, name) => {
  const value = options.get(name);

  if (value == null || value.length === 0) {
    fail(`Missing required option "${name}".`);
  }

  return normalizeOrigin(value);
};

/**
 * Recursively list regular files beneath a directory in stable order.
 *
 * @param {string} directory Absolute root directory to traverse.
 * @param {string} [relativeDirectory=''] Current path relative to the root.
 * @returns {string[]} Sorted file paths relative to the root directory.
 * @throws {Error} When a directory cannot be read.
 */
const listFiles = (directory, relativeDirectory = '') => {
  const currentDirectory = path.join(directory, relativeDirectory);
  const entries = readdirSync(currentDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(directory, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
};

/**
 * Hash every file path and byte in a directory tree.
 *
 * @param {string} directory Absolute directory containing the compiled tree.
 * @returns {string} SHA-256 digest for the complete directory contents.
 * @throws {Error} When the directory is missing or cannot be read.
 */
const hashDirectory = directory => {
  if (!existsSync(directory)) {
    fail(`Cannot hash missing directory "${directory}".`);
  }

  const hash = createHash('sha256');

  for (const relativePath of listFiles(directory)) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(path.join(directory, relativePath)));
    hash.update('\0');
  }

  return hash.digest('hex');
};

/**
 * Find the installed `next-slug-splitter` package owning a resolved entry.
 *
 * @param {string} entryPath Resolved package entry file.
 * @returns {string} Absolute directory containing the matching package.json.
 * @throws {Error} When no matching package can be found in the parent chain.
 */
const findPackageDirectory = entryPath => {
  let currentDirectory = path.dirname(entryPath);

  while (currentDirectory !== path.dirname(currentDirectory)) {
    const packagePath = path.join(currentDirectory, 'package.json');

    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

      if (packageJson.name === 'next-slug-splitter') {
        return currentDirectory;
      }
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  fail(`Could not locate next-slug-splitter for "${entryPath}".`);
};

/**
 * Ensure every retained `file:../..` dependency contains the current build.
 *
 * pnpm snapshots `file:` packages during installation. The root build happens
 * after the first clean install, so the release workflow refreshes the install
 * and then compares the complete compiled tree before any Vercel build.
 *
 * @returns {void}
 * @throws {Error} When a demo resolves a missing or stale compiled snapshot.
 */
const verifyFileDependencies = () => {
  const rootDistDirectory = path.join(REPOSITORY_ROOT, 'dist');
  const rootDistHash = hashDirectory(rootDistDirectory);

  for (const demoDirectory of DEMO_DIRECTORIES) {
    const absoluteDemoDirectory = path.join(REPOSITORY_ROOT, demoDirectory);
    const demoRequire = createRequire(
      path.join(absoluteDemoDirectory, 'package.json')
    );
    const entryPath = demoRequire.resolve('next-slug-splitter');
    const packageDirectory = findPackageDirectory(entryPath);
    const installedDistDirectory = path.join(packageDirectory, 'dist');
    const installedDistHash = hashDirectory(installedDistDirectory);

    assert.equal(
      installedDistHash,
      rootDistHash,
      `${demoDirectory} resolves a stale next-slug-splitter file: snapshot.\n` +
        `Root dist:      ${rootDistHash}\n` +
        `Installed dist: ${installedDistHash}\n` +
        `Installed path: ${installedDistDirectory}`
    );

    console.log(`Verified ${demoDirectory} file: snapshot (${rootDistHash}).`);
  }
};

/**
 * Pause retry processing for a specified interval.
 *
 * @param {number} milliseconds Delay duration in milliseconds.
 * @returns {Promise<void>} Promise fulfilled after the delay elapses.
 */
const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Fetch a release URL with timeout handling and bounded exponential retries.
 *
 * @param {string} url Absolute URL to request.
 * @param {number} expectedStatus HTTP status required for success.
 * @param {string} description Human-readable request description for failures.
 * @param {Record<string, string>} [headers={}] Request headers to forward.
 * @returns {Promise<Response>} First response with the expected status.
 * @throws {Error} When every request fails or returns an unexpected status.
 */
const request = async (url, expectedStatus, description, headers = {}) => {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (response.status === expectedStatus) {
        return response;
      }

      await response.body?.cancel();
      lastError = new Error(
        `${description} returned ${response.status}; expected ${expectedStatus}: ${url}`
      );
    } catch (error) {
      lastError = error;
    }

    if (attempt < REQUEST_ATTEMPTS) {
      await delay(2 ** (attempt - 1) * 1_000);
    }
  }

  throw lastError;
};

/**
 * Expand route slugs across the canonical, English, and German URL forms.
 *
 * @param {ReadonlyArray<string>} slugs Documentation route slugs to expand.
 * @returns {string[]} Sorted public route paths for all supported URL forms.
 */
const createExpectedRoutePaths = slugs =>
  LOCALE_PREFIXES.flatMap(localePrefix =>
    slugs.map(slug => `${localePrefix}/docs/${slug}`)
  ).sort();

/**
 * Derive the generated handler expected for a splitter manifest route.
 *
 * @param {string} routePath Locale-aware documentation route path.
 * @returns {string} Locale-specific generated handler path.
 */
const createExpectedSplitterHandlerPath = routePath => {
  const locale = routePath.startsWith('/de/') ? 'de' : 'en';
  const routeSlug = routePath.endsWith('/dashboard')
    ? 'dashboard'
    : 'interactive';

  return `/${locale}/docs/generated-handlers/${routeSlug}/${locale}`;
};

/**
 * Request and parse a generated benchmark manifest.
 *
 * @param {string} origin Absolute deployment origin.
 * @param {string} manifestPath Manifest path beneath the deployment origin.
 * @param {string} description Human-readable manifest description for failures.
 * @returns {Promise<{manifest: BenchmarkManifest, response: Response}>} Parsed
 * manifest together with the response used for header verification.
 * @throws {Error} When the request, JSON parsing, or top-level shape check fails.
 */
const readManifest = async (origin, manifestPath, description) => {
  const response = await request(
    `${origin}${manifestPath}`,
    200,
    description,
    { 'cache-control': 'no-cache' }
  );
  const manifest = await response.json();

  if (!isObjectRecord(manifest) || !isObjectRecord(manifest.routes)) {
    fail(`${description} does not contain a routes object.`);
  }

  return {
    manifest: /** @type {BenchmarkManifest} */ (manifest),
    response
  };
};

/**
 * Validate the routes, handlers, and payload paths in one benchmark manifest.
 *
 * @param {ReleaseTarget} target Release target that owns the manifest.
 * @param {BenchmarkManifest} manifest Parsed manifest to validate.
 * @returns {string[]} Sorted unique payload paths referenced by all routes.
 * @throws {Error} When any manifest field violates the release contract.
 */
const validateManifest = (target, manifest) => {
  const expectedRoutePaths = createExpectedRoutePaths(
    target.kind === 'splitter'
      ? SPLITTER_ROUTE_SLUGS
      : BASELINE_ROUTE_SLUGS
  );
  const actualRoutePaths = Object.keys(manifest.routes).sort();

  assert.deepEqual(
    actualRoutePaths,
    expectedRoutePaths,
    `${target.id} manifest route keys do not match the release contract.`
  );

  const payloadChunks = new Set();

  for (const routePath of actualRoutePaths) {
    const route = manifest.routes[routePath];

    if (
      !isObjectRecord(route) ||
      typeof route.payloadChunk !== 'string'
    ) {
      fail(`${target.id} manifest route "${routePath}" is malformed.`);
    }

    if (target.kind === 'splitter') {
      assert.equal(
        route.generatedHandlerPath,
        createExpectedSplitterHandlerPath(routePath),
        `${target.id} has the wrong generated handler for "${routePath}".`
      );
    } else {
      assert.equal(
        route.generatedHandlerPath,
        null,
        `${target.id} baseline route "${routePath}" has a generated handler.`
      );
    }

    const payloadChunk = route.payloadChunk;

    assert.ok(
      payloadChunk.startsWith(`${target.zonePath}/_next/static/`) &&
        payloadChunk.endsWith('.js') &&
        !payloadChunk.includes('?'),
      `${target.id} contains an invalid payload path "${payloadChunk}".`
    );
    payloadChunks.add(payloadChunk);
  }

  return [...payloadChunks].sort();
};

/**
 * Verify supported public routes and one deliberately unsupported locale.
 *
 * @param {string} origin Absolute origin receiving the requests.
 * @param {string} prefix Optional facade zone path prepended to every route.
 * @param {string} description Target description included in failures.
 * @returns {Promise<void>} Promise fulfilled after every route is verified.
 * @throws {Error} When a supported route is unavailable or French is accepted.
 */
const verifyPublicRoutes = async (origin, prefix, description) => {
  const publicRoutePaths = createExpectedRoutePaths(VISIBLE_ROUTE_SLUGS);

  for (const routePath of publicRoutePaths) {
    const response = await request(
      `${origin}${prefix}${routePath}`,
      200,
      `${description} public route "${routePath}"`,
      { 'cache-control': 'no-cache' }
    );
    await response.body?.cancel();
  }

  const unsupportedRoutePath = '/fr/docs/interactive';
  const response = await request(
    `${origin}${prefix}${unsupportedRoutePath}`,
    404,
    `${description} unsupported route "${unsupportedRoutePath}"`,
    { 'cache-control': 'no-cache' }
  );
  await response.body?.cancel();
};

/**
 * Verify one candidate deployment directly, including every selected payload.
 *
 * @param {ReleaseTarget} target Direct deployment target to verify.
 * @returns {Promise<BenchmarkManifest>} Validated direct manifest used later to
 * compare the website facade manifest structurally.
 * @throws {Error} When routes, manifest contents, or payload requests are
 * invalid.
 */
const verifyDirectTarget = async target => {
  await verifyPublicRoutes(target.origin, '', `${target.id} direct`);

  const manifestPath =
    `/_next/static/__benchmark/${target.manifestFilename}`;
  const { manifest } = await readManifest(
    target.origin,
    manifestPath,
    `${target.id} direct manifest`
  );
  const payloadChunkPaths = validateManifest(target, manifest);

  for (const payloadChunkPath of payloadChunkPaths) {
    const directPayloadChunkPath = payloadChunkPath.slice(
      target.zonePath.length
    );
    const response = await request(
      `${target.origin}${directPayloadChunkPath}`,
      200,
      `${target.id} direct payload "${directPayloadChunkPath}"`,
      { 'accept-encoding': 'br, gzip' }
    );
    await response.body?.cancel();
  }

  console.log(`Verified direct deployment ${target.id} (${target.origin}).`);
  return manifest;
};

/**
 * Verify one target through the website's same-origin benchmark facade.
 *
 * @param {string} websiteOrigin Absolute origin of the candidate website.
 * @param {ReleaseTarget} target Target exposed below its facade zone path.
 * @param {BenchmarkManifest} directManifest Manifest read from the target itself.
 * @returns {Promise<void>} Promise fulfilled after routes and payloads are
 * verified.
 * @throws {Error} When facade routing, identity, or raw transport semantics fail.
 */
const verifyFacadeTarget = async (websiteOrigin, target, directManifest) => {
  await verifyPublicRoutes(
    websiteOrigin,
    target.zonePath,
    `${target.id} facade`
  );

  const manifestPath =
    `${target.zonePath}/_next/static/__benchmark/${target.manifestFilename}`;
  const { manifest, response: manifestResponse } = await readManifest(
    websiteOrigin,
    manifestPath,
    `${target.id} facade manifest`
  );

  assert.deepEqual(
    manifest,
    directManifest,
    `${target.id} facade manifest differs from its direct deployment.`
  );
  assert.equal(
    manifestResponse.headers.get('x-benchmark-target'),
    target.id,
    `${target.id} facade manifest came from the wrong target.`
  );

  const payloadChunkPaths = validateManifest(target, manifest);

  for (const payloadChunkPath of payloadChunkPaths) {
    const payloadResponse = await request(
      `${websiteOrigin}${payloadChunkPath}`,
      200,
      `${target.id} facade payload "${payloadChunkPath}"`,
      { 'accept-encoding': 'br, gzip' }
    );
    const cacheControl = payloadResponse.headers.get('cache-control') ?? '';

    assert.equal(
      payloadResponse.headers.get('x-benchmark-target'),
      target.id,
      `${target.id} facade payload came from the wrong target.`
    );
    assert.ok(
      cacheControl.includes('no-store') &&
        cacheControl.includes('no-transform'),
      `${target.id} facade payload does not preserve raw measurement semantics.`
    );
    await payloadResponse.body?.cancel();
  }

  console.log(`Verified website facade for ${target.id}.`);
};

/**
 * Verify a complete staged or promoted benchmark release.
 *
 * @param {ReadonlyArray<string>} values Deployment option names and origins.
 * @returns {Promise<void>} Promise fulfilled after the website and four targets
 * satisfy the complete release contract.
 * @throws {Error} When options are invalid or any deployment check fails.
 */
const verifyDeployments = async values => {
  const options = readOptions(values);
  const websiteOrigin = requireOption(options, '--website');
  /** @type {ReleaseTarget[]} */
  const targets = [
    {
      id: 'app-router-multi-locale',
      origin: requireOption(options, '--app-splitter'),
      zonePath: '/zones/app-router-multi-locale',
      kind: 'splitter',
      manifestFilename: 'splitter-route-payload.json'
    },
    {
      id: 'app-router-multi-locale-heavy',
      origin: requireOption(options, '--app-baseline'),
      zonePath: '/zones/app-router-multi-locale-heavy',
      kind: 'baseline',
      manifestFilename: 'heavy-baseline-route-payload.json'
    },
    {
      id: 'page-router',
      origin: requireOption(options, '--pages-splitter'),
      zonePath: '/zones/page-router',
      kind: 'splitter',
      manifestFilename: 'splitter-route-payload.json'
    },
    {
      id: 'page-router-heavy',
      origin: requireOption(options, '--pages-baseline'),
      zonePath: '/zones/page-router-heavy',
      kind: 'baseline',
      manifestFilename: 'heavy-baseline-route-payload.json'
    }
  ];

  const benchmarkResponse = await request(
    `${websiteOrigin}/benchmark`,
    200,
    'benchmark website'
  );
  await benchmarkResponse.body?.cancel();

  const directManifests = new Map();

  for (const target of targets) {
    directManifests.set(target.id, await verifyDirectTarget(target));
  }

  for (const target of targets) {
    await verifyFacadeTarget(
      websiteOrigin,
      target,
      directManifests.get(target.id)
    );
  }

  console.log(`Verified complete benchmark release at ${websiteOrigin}.`);
};

const [command, ...values] = process.argv.slice(2);

if (command === 'file-dependencies') {
  verifyFileDependencies();
} else if (command === 'deployments') {
  await verifyDeployments(values);
} else {
  fail(
    'Usage:\n' +
      '  node .github/scripts/verify-benchmark-release.mjs file-dependencies\n' +
      '  node .github/scripts/verify-benchmark-release.mjs deployments ' +
      '--website <url> --app-splitter <url> --app-baseline <url> ' +
      '--pages-splitter <url> --pages-baseline <url>'
  );
}
