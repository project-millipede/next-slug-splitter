import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const scriptExtension = path.extname(fileURLToPath(import.meta.url));

type Locale = 'en' | 'de';

type CompileJob = {
  locale: Locale;
  slug: string[];
};

type CompiledPageData = {
  code: string;
  locale: Locale;
  slug: string[];
};

type PageDataArtifact = {
  version: 1;
  targetId: string;
  generatedAt: string;
  routes: Record<string, CompiledPageData>;
};

export type CompileHeavyPageDataInput = {
  /**
   * Module exporting a `pageDataCompiler` object.
   *
   * The worker imports this module in an isolated process so MDX/esbuild
   * dependencies stay out of the Next.js route module graph.
   */
  compilerModule: string | URL;
  /**
   * Directory containing localized MDX files shaped as
   * `<contentDir>/<slug>/<locale>.mdx`.
   */
  contentDir: string | URL;
  /**
   * JSON artifact path consumed by the heavy baseline route at build time.
   */
  outputPath: string | URL;
  /**
   * Stable compiler target identifier passed through to `pageDataCompiler`.
   */
  targetId: string;
};

const SUPPORTED_LOCALES = new Set<Locale>(['en', 'de']);

const resolveInputPath = (inputPath: string | URL): string =>
  inputPath instanceof URL
    ? fileURLToPath(inputPath)
    : path.resolve(inputPath);

const collectMdxFiles = async (
  dir: string,
  base = ''
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(
        ...(await collectMdxFiles(path.join(dir, entry.name), relativePath))
      );
    } else if (entry.name.endsWith('.mdx')) {
      files.push(relativePath);
    }
  }

  return files;
};

const filePathToCompileJob = (filePath: string): CompileJob | null => {
  const routeSegments = filePath.replace(/\.mdx$/, '').split('/');
  const locale = routeSegments.pop();
  const slug = routeSegments;

  if (
    locale == null ||
    !SUPPORTED_LOCALES.has(locale as Locale) ||
    slug.length === 0
  ) {
    return null;
  }

  return {
    locale: locale as Locale,
    slug
  };
};

const toPageDataKey = ({ locale, slug }: CompileJob): string =>
  `${locale}:${slug.join('/')}`;

const compareCompileJobs = (left: CompileJob, right: CompileJob): number =>
  toPageDataKey(left).localeCompare(toPageDataKey(right));

const isCompiledPageData = (value: unknown): value is CompiledPageData =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CompiledPageData).code === 'string' &&
  SUPPORTED_LOCALES.has((value as CompiledPageData).locale) &&
  Array.isArray((value as CompiledPageData).slug) &&
  (value as CompiledPageData).slug.every(segment => typeof segment === 'string');

const discoverCompileJobs = async (contentDir: string): Promise<CompileJob[]> => {
  const files = await collectMdxFiles(contentDir);
  const jobs = files
    .map(filePathToCompileJob)
    .filter((job): job is CompileJob => job != null);

  return jobs.sort(compareCompileJobs);
};

const runWorker = async ({
  compilerModulePath,
  targetId,
  jobs
}: {
  compilerModulePath: string;
  targetId: string;
  jobs: CompileJob[];
}): Promise<CompiledPageData[]> =>
  new Promise((resolve, reject) => {
    const workerPath = path.join(
      scriptDir,
      `compile-heavy-page-data-worker${scriptExtension}`
    );
    const child = spawn(process.execPath, [workerPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(
            `Heavy page-data worker exited with code ${code}.\n${stderr}`
          )
        );
        return;
      }

      const parsed = JSON.parse(stdout) as { pages?: unknown };

      if (
        !Array.isArray(parsed.pages) ||
        !parsed.pages.every(isCompiledPageData)
      ) {
        reject(new Error('Heavy page-data worker returned invalid output.'));
        return;
      }

      resolve(parsed.pages);
    });
    child.stdin.end(
      JSON.stringify({
        compilerModulePath,
        targetId,
        jobs
      })
    );
  });

const writeArtifact = async ({
  outputPath,
  targetId,
  pages
}: {
  outputPath: string;
  targetId: string;
  pages: CompiledPageData[];
}): Promise<void> => {
  const artifact: PageDataArtifact = {
    version: 1,
    targetId,
    generatedAt: new Date().toISOString(),
    routes: Object.fromEntries(
      pages.map(page => [
        toPageDataKey({
          locale: page.locale,
          slug: page.slug
        }),
        page
      ])
    )
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
};

/**
 * Compile heavy-baseline MDX page data.
 *
 * The caller owns the small, readable TypeScript script that points at the
 * app's compiler module and content directory. This helper owns the repetitive
 * mechanics: discover localized MDX routes, isolate the compiler in a child
 * process, and write the JSON artifact consumed by the heavy baseline route.
 *
 * @param input Compile configuration owned by the heavy baseline package.
 * @param input.compilerModule Module exporting `pageDataCompiler`.
 * @param input.contentDir Root directory containing localized MDX files.
 * @param input.outputPath Artifact path to write.
 * @param input.targetId Stable target identifier passed to the compiler.
 * @returns A promise that resolves after the page-data artifact is written.
 */
export const compileHeavyPageData = async ({
  compilerModule,
  contentDir,
  outputPath,
  targetId
}: CompileHeavyPageDataInput): Promise<void> => {
  const contentDirPath = resolveInputPath(contentDir);
  const compilerModulePath = resolveInputPath(compilerModule);
  const outputFilePath = resolveInputPath(outputPath);
  const jobs = await discoverCompileJobs(contentDirPath);
  const pages = await runWorker({
    compilerModulePath,
    targetId,
    jobs
  });

  await writeArtifact({
    outputPath: outputFilePath,
    targetId,
    pages
  });

  console.log(
    `[mdx-build] compiled ${pages.length} page-data artifacts to ${path.relative(
      process.cwd(),
      outputFilePath
    )}`
  );
};
