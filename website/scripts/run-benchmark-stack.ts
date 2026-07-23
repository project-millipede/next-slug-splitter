import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEMO_TARGETS,
  type DemoTarget,
  type DemoTargetLocalOrigin
} from '../lib/benchmark/catalog';

/**
 * Local benchmark stack runner.
 *
 * The script builds/starts the four target apps plus the website facade. Target
 * apps run at their own roots on ports 4001-4004; the website facade is the
 * only layer that exposes them under `/zones/<target>`.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..', '..');
const websiteDir = path.join(repoDir, 'website');
const demoDir = path.join(repoDir, 'demo');

type StackCommand = 'build' | 'start' | 'dev' | 'start:dev';

type ServerApp = {
  name: string;
  dir: string;
  port: number;
};

type TargetApp = ServerApp & {
  manifestKind: 'splitter' | 'heavy-baseline';
  facadePath: `/zones/${string}`;
};

/**
 * Environment variable consumed by benchmark manifest generation.
 *
 * This is intentionally not a Next.js `basePath`. It only tells the manifest
 * writer which website facade path will expose the target's routes and chunks.
 * Target apps still build and serve at `/`, so their direct local and Vercel
 * preview URLs remain readable.
 */
const BENCHMARK_ZONE_PATH_ENV = 'BENCHMARK_ZONE_PATH';

/**
 * Read the port from a target's local origin.
 *
 * @param origin Local HTTP origin from the benchmark target table.
 * @returns Numeric port used by the local stack runner.
 */
const parseLocalOriginPort = (origin: DemoTargetLocalOrigin): number => {
  const port = Number(new URL(origin).port);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid local benchmark origin "${origin}".`);
  }

  return port;
};

/**
 * Resolve which manifest kind a target app should emit.
 *
 * @param target Benchmark target from the shared website target table.
 * @returns Splitter manifest kind for comparison targets, baseline kind for heavy targets.
 */
const getTargetManifestKind = (
  target: DemoTarget
): TargetApp['manifestKind'] =>
  target.role === 'baseline' ? 'heavy-baseline' : 'splitter';

/**
 * Convert shared benchmark target metadata into a local runnable app entry.
 *
 * @param target Benchmark target from the shared website target table.
 * @returns Local target app definition for build and server orchestration.
 */
const createTargetApp = (target: DemoTarget): TargetApp => ({
  name: target.id,
  dir: path.join(demoDir, target.id),
  manifestKind: getTargetManifestKind(target),
  port: parseLocalOriginPort(target.localOrigin),
  facadePath: target.zonePath
});

/**
 * Create environment variables that point the website facade to local targets.
 *
 * @param targets Benchmark targets that the website can proxy.
 * @returns Environment object passed to the local website process.
 */
const createBenchmarkOrigins = (
  targets: ReadonlyArray<DemoTarget>
): Partial<NodeJS.ProcessEnv> => {
  const env: Partial<NodeJS.ProcessEnv> = {};

  for (const target of targets) {
    env[target.originEnvName] = target.localOrigin;
  }

  return env;
};

const targetApps = DEMO_TARGETS.map(createTargetApp);
const BENCHMARK_ORIGINS = createBenchmarkOrigins(DEMO_TARGETS);

const benchmarkApp: ServerApp = {
  name: 'benchmark',
  dir: websiteDir,
  port: 4000
};
const serverApps: ServerApp[] = [...targetApps, benchmarkApp];

const [, , commandName] = process.argv;

const isStackCommand = (value: string): value is StackCommand =>
  value === 'build' ||
  value === 'start' ||
  value === 'dev' ||
  value === 'start:dev';

const printUsageAndExit = (): never => {
  console.error(
    [
      'Usage: node website/dist/run-benchmark-stack.js <command>',
      '',
      'Commands:',
      '  build       Build all benchmark target apps plus the facade.',
      '  start       Start the already-built local production stack.',
      '  dev         Build target apps, start them in production mode, and run the facade in dev mode.',
      '  start:dev   Start already-built target apps and run the facade in dev mode.'
    ].join('\n')
  );
  process.exit(1);
};

const createPrefixedWriter =
  (prefix: string, stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    const text = chunk.toString();

    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        stream.write(`[${prefix}] ${line}\n`);
      }
    }
  };

const run = (
  label: string,
  command: string,
  args: string[],
  {
    cwd = repoDir,
    env = {}
  }: {
    cwd?: string;
    env?: Partial<NodeJS.ProcessEnv>;
  } = {}
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', createPrefixedWriter(label, process.stdout));
    child.stderr.on('data', createPrefixedWriter(label, process.stderr));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}.`));
      }
    });
  });

const spawnServer = (
  label: string,
  command: string,
  args: string[],
  {
    cwd,
    env = {}
  }: {
    cwd: string;
    env?: Partial<NodeJS.ProcessEnv>;
  }
): ChildProcess => {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout?.on('data', createPrefixedWriter(label, process.stdout));
  child.stderr?.on('data', createPrefixedWriter(label, process.stderr));

  return child;
};

const buildPackage = async (): Promise<void> => {
  await run('next-slug-splitter', 'pnpm', ['build']);
};

/**
 * Build one target app and write its benchmark route-chunk manifest.
 *
 * The target app itself is built for root URLs. `BENCHMARK_ZONE_PATH` is only
 * available to the benchmark adapter so the manifest records facade URLs such
 * as `/zones/page-router/_next/...`.
 *
 * @param app Target app to build.
 * @returns A promise that resolves when the target build and manifest are done.
 */
const buildTargetApp = async (app: TargetApp): Promise<void> => {
  await run(app.name, 'pnpm', ['--dir', app.dir, 'build'], {
    env: {
      [BENCHMARK_ZONE_PATH_ENV]: app.facadePath,
      BENCHMARK_MANIFEST_KIND: app.manifestKind
    }
  });
};

/**
 * Build the benchmark website facade.
 *
 * The facade receives local target origins so server-side route handlers can
 * proxy requests from `/zones/<target>` to the separately running target app.
 *
 * @returns A promise that resolves when the website build completes.
 */
const buildBenchmarkApp = async (): Promise<void> => {
  await run(
    benchmarkApp.name,
    'pnpm',
    ['--dir', benchmarkApp.dir, 'build'],
    {
      env: BENCHMARK_ORIGINS
    }
  );
};

/**
 * Build the package, target apps, target manifests, and website facade.
 *
 * @returns A promise that resolves when every benchmark build step succeeds.
 */
const buildStack = async (): Promise<void> => {
  await buildPackage();

  for (const app of targetApps) {
    await buildTargetApp(app);
  }

  await buildBenchmarkApp();
};

const isPortAvailable = (port: number): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });

const assertServerPortsAvailable = async (): Promise<void> => {
  const occupiedPorts: string[] = [];

  for (const app of serverApps) {
    if (!(await isPortAvailable(app.port))) {
      occupiedPorts.push(`${app.name}:${app.port}`);
    }
  }

  if (occupiedPorts.length > 0) {
    throw new Error(
      `Benchmark stack ports are already in use: ${occupiedPorts.join(
        ', '
      )}. Stop the existing stack before starting a new one.`
    );
  }
};

/**
 * Start one already-built target app at its root URL.
 *
 * No benchmark facade env is passed here on purpose. The manifest already
 * contains `/zones/...` browser paths, while the target server itself should
 * keep normal URLs like `/de` and `/_next/static/...`.
 *
 * @param app Target app to start.
 * @returns Spawned child process for the target server.
 */
const startTargetApp = (app: TargetApp): ChildProcess =>
  spawnServer(
    app.name,
    'pnpm',
    ['--dir', app.dir, 'exec', 'next', 'start', '-p', String(app.port)],
    {
      cwd: repoDir
    }
  );

const startBenchmarkApp = (
  mode: 'dev' | 'start'
): ChildProcess =>
  spawnServer(
    benchmarkApp.name,
    'pnpm',
    [
      '--dir',
      benchmarkApp.dir,
      'exec',
      'next',
      mode,
      '-p',
      String(benchmarkApp.port)
    ],
    {
      cwd: repoDir,
      env: BENCHMARK_ORIGINS
    }
  );

const waitForServers = (
  servers: ChildProcess[]
): Promise<void> =>
  new Promise((resolve, reject) => {
    let shuttingDown = false;

    const shutdown = (reason: string) => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      console.log(`[benchmark-stack] ${reason}; stopping servers.`);

      for (const server of servers) {
        server.kill('SIGTERM');
      }
    };

    process.on('SIGINT', () => shutdown('received SIGINT'));
    process.on('SIGTERM', () => shutdown('received SIGTERM'));

    for (const server of servers) {
      server.on('error', reject);
      server.on('exit', (code, signal) => {
        if (shuttingDown) {
          resolve();
          return;
        }

        const error = new Error(
          `A benchmark server exited unexpectedly with code ${code} and signal ${signal}.`
        );
        shutdown(error.message);
        reject(error);
      });
    }
  });

const startStack = async ({
  benchmarkMode,
  checkPorts = true
}: {
  benchmarkMode: 'dev' | 'start';
  checkPorts?: boolean;
}): Promise<void> => {
  if (checkPorts) {
    await assertServerPortsAvailable();
  }

  const servers = [
    ...targetApps.map(startTargetApp),
    startBenchmarkApp(benchmarkMode)
  ];

  console.log(
    `[benchmark-stack] open http://127.0.0.1:${benchmarkApp.port}`
  );
  await waitForServers(servers);
};

const main = async (): Promise<void> => {
  if (commandName == null || !isStackCommand(commandName)) {
    printUsageAndExit();
  }

  if (commandName === 'build') {
    await buildStack();
  } else if (commandName === 'start') {
    await startStack({ benchmarkMode: 'start' });
  } else if (commandName === 'dev') {
    await assertServerPortsAvailable();
    await buildStack();
    await startStack({ benchmarkMode: 'dev', checkPorts: false });
  } else {
    await startStack({ benchmarkMode: 'dev' });
  }
};

main().catch(error => {
  console.error(
    `[benchmark-stack] ${
      error instanceof Error ? error.message : 'Unknown benchmark failure.'
    }`
  );
  process.exitCode = 1;
});
