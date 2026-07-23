import { compileHeavyPageData } from '@next-slug-splitter/mdx-build/compile-page-data';

/**
 * Compile all Pages Router MDX page data for the heavy baseline.
 *
 * The heavy route reads the generated artifact during `getStaticProps`, which
 * keeps the build route simple while the MDX/esbuild work stays isolated in the
 * shared MDX build process.
 */
await compileHeavyPageData({
  compilerModule: new URL('./page-data-compiler.mjs', import.meta.url),
  contentDir: '../shared/docs-content/pages',
  outputPath: '.benchmark/page-data/docs.json',
  targetId: 'docs'
});
