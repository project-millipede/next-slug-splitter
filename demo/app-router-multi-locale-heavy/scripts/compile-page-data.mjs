import { compileHeavyPageData } from '@next-slug-splitter/mdx-build/compile-page-data';

/**
 * Compile all App Router multi-locale MDX page data for the heavy baseline.
 *
 * The heavy baseline renders the same content directly from a catch-all route,
 * so it needs the same compiled MDX page payloads that the splitter route
 * handlers would normally prepare at request time.
 */
await compileHeavyPageData({
  compilerModule: new URL('./page-data-compiler.mjs', import.meta.url),
  contentDir: '../shared/docs-content/pages',
  outputPath: '.benchmark/page-data/docs.json',
  targetId: 'docs'
});
