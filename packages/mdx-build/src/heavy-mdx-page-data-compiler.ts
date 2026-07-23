import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { globalExternals } from '@fal-works/esbuild-plugin-global-externals';
import mdx from '@mdx-js/esbuild';
import esbuild from 'esbuild';

type SupportedLocale = 'en' | 'de';

type PageDataCompilerInput = {
  locale: SupportedLocale;
  slug: string[];
};

type PageDataCompilerResult = {
  code: string;
  locale: SupportedLocale;
  slug: string[];
};

export type HeavyMdxPageDataCompilerOptions = {
  /**
   * Directory containing localized MDX files shaped as
   * `<contentDir>/<slug>/<locale>.mdx`.
   */
  contentDir: string | URL;
  /**
   * Human-readable target label used in validation errors.
   */
  label: string;
};

const SUPPORTED_LOCALES = new Set<SupportedLocale>(['en', 'de']);

const resolveInputPath = (inputPath: string | URL): string =>
  inputPath instanceof URL
    ? fileURLToPath(inputPath)
    : path.resolve(inputPath);

const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  typeof value === 'string' && SUPPORTED_LOCALES.has(value as SupportedLocale);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(segment => typeof segment === 'string');

/**
 * Compile the MDX content for one slug into an evaluatable IIFE string.
 *
 * React, ReactDOM, and the JSX runtime are declared as global externals. The
 * heavy baseline MDX runtime injects those globals when it evaluates the
 * compiled page payload, so each generated payload contains only route content.
 *
 * @param input Compile details for one localized content file.
 * @param input.contentDir Absolute content root.
 * @param input.locale Locale identifying the content file.
 * @param input.slug Slug segments identifying the content page.
 * @returns Bundled executable code consumed by the MDX runtime.
 */
const compileContentForSlug = async ({
  contentDir,
  locale,
  slug
}: {
  contentDir: string;
  locale: SupportedLocale;
  slug: string[];
}): Promise<string> => {
  const filePath = path.join(contentDir, ...slug, `${locale}.mdx`);

  const result = await esbuild.build({
    entryPoints: [filePath],
    write: false,
    bundle: true,
    format: 'iife',
    globalName: 'Component',
    target: 'es2020',
    treeShaking: false,
    minify: false,
    keepNames: true,
    jsx: 'automatic',
    jsxImportSource: 'react',
    plugins: [
      globalExternals({
        react: { varName: 'React', type: 'cjs' },
        'react-dom': { varName: 'ReactDOM', type: 'cjs' },
        'react/jsx-runtime': { varName: '_jsx_runtime', type: 'cjs' }
      }),
      mdx()
    ]
  });

  const [outputFile] = result.outputFiles;

  if (outputFile == null) {
    throw new Error('esbuild did not return a compiled MDX output file.');
  }

  const code = outputFile.text;
  return `${code};return Component;`;
};

/**
 * Create the shared heavy-baseline page-data compiler contract.
 *
 * Each heavy demo exposes a local `scripts/page-data-compiler.mjs` module so
 * the compile entry remains easy to inspect. Those local modules should call
 * this factory instead of reimplementing MDX compilation or worker payload
 * validation.
 *
 * @param options Heavy compiler configuration.
 * @param options.contentDir Root directory containing localized MDX files.
 * @param options.label Human-readable target label for diagnostics.
 * @returns A `pageDataCompiler` object consumed by the page-data worker.
 */
export const createHeavyMdxPageDataCompiler = ({
  contentDir,
  label
}: HeavyMdxPageDataCompilerOptions) => {
  const resolvedContentDir = resolveInputPath(contentDir);

  return {
    /**
     * Compile the requested MDX page and return the route data consumed by the
     * heavy baseline catch-all route.
     *
     * @param compileInput Worker-owned compile invocation details.
     * @param compileInput.input Serializable route payload.
     * @returns Compiled page data for one docs slug.
     */
    async compile({
      input
    }: {
      targetId: string;
      input: PageDataCompilerInput;
    }): Promise<PageDataCompilerResult> {
      const locale = input?.locale;
      const slug = input?.slug;

      if (!isSupportedLocale(locale)) {
        throw new Error(
          `${label} pageDataCompiler expected input.locale to be "en" or "de".`
        );
      }

      if (!isStringArray(slug)) {
        throw new Error(
          `${label} pageDataCompiler expected input.slug to be a string array.`
        );
      }

      return {
        code: await compileContentForSlug({
          contentDir: resolvedContentDir,
          locale,
          slug
        }),
        locale,
        slug
      };
    }
  };
};
