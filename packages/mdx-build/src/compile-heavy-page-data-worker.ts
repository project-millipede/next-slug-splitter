import process from 'node:process';
import { pathToFileURL } from 'node:url';

type Locale = 'en' | 'de';

type CompileJob = {
  locale: Locale;
  slug: string[];
};

type WorkerInput = {
  compilerModulePath: string;
  targetId: string;
  jobs: CompileJob[];
};

type CompiledPageData = {
  code: string;
  locale: Locale;
  slug: string[];
};

type PageDataCompiler = {
  compile(input: {
    targetId: string;
    input: {
      locale: Locale;
      slug: string[];
    };
  }): Promise<CompiledPageData>;
};

type CompilerModule = {
  pageDataCompiler?: PageDataCompiler;
};

const readStdin = async (): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      body += chunk;
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(body));
  });

const isLocale = (value: unknown): value is Locale =>
  value === 'en' || value === 'de';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isCompileJob = (value: unknown): value is CompileJob =>
  typeof value === 'object' &&
  value !== null &&
  isLocale((value as CompileJob).locale) &&
  isStringArray((value as CompileJob).slug);

const parseWorkerInput = (text: string): WorkerInput => {
  const value = JSON.parse(text) as WorkerInput;

  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.compilerModulePath !== 'string' ||
    typeof value.targetId !== 'string' ||
    !Array.isArray(value.jobs) ||
    !value.jobs.every(isCompileJob)
  ) {
    throw new Error('Invalid heavy page-data worker input.');
  }

  return value;
};

const isCompiledPageData = (value: unknown): value is CompiledPageData =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CompiledPageData).code === 'string' &&
  isLocale((value as CompiledPageData).locale) &&
  isStringArray((value as CompiledPageData).slug);

const importCompilerModule = async (
  compilerModulePath: string
): Promise<CompilerModule> => {
  const moduleUrl = pathToFileURL(compilerModulePath).href;
  const compilerModule = (await import(moduleUrl)) as CompilerModule;

  if (compilerModule.pageDataCompiler == null) {
    throw new Error(
      `Compiler module "${compilerModulePath}" must export pageDataCompiler.`
    );
  }

  return compilerModule;
};

const compileJob = async ({
  compilerModule,
  targetId,
  job
}: {
  compilerModule: CompilerModule;
  targetId: string;
  job: CompileJob;
}): Promise<CompiledPageData> => {
  const result = await compilerModule.pageDataCompiler?.compile({
    targetId,
    input: job
  });

  if (!isCompiledPageData(result)) {
    throw new Error('pageDataCompiler returned invalid page data.');
  }

  return result;
};

const main = async (): Promise<void> => {
  const input = parseWorkerInput(await readStdin());
  const compilerModule = await importCompilerModule(input.compilerModulePath);
  const pages: CompiledPageData[] = [];

  for (const job of input.jobs) {
    pages.push(
      await compileJob({
        compilerModule,
        targetId: input.targetId,
        job
      })
    );
  }

  process.stdout.write(JSON.stringify({ pages }));
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
