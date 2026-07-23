import Link from 'next/link';

import { BENCHMARK_PATH, GITHUB_URL, SITE_NAME } from '../../lib/site/config';

import styles from './QuickStartPage.module.css';

const readmeContents = [
  {
    href: `${GITHUB_URL}#overview`,
    label: 'Overview'
  },
  {
    href: `${GITHUB_URL}#getting-started`,
    label: 'Getting Started'
  },
  {
    href: `${GITHUB_URL}#quick-start`,
    label: 'Quick Start'
  },
  {
    href: `${GITHUB_URL}#usage`,
    label: 'Usage'
  },
  {
    href: `${GITHUB_URL}#operation-modes`,
    label: 'Operation Modes'
  },
  {
    href: `${GITHUB_URL}#configuration-reference`,
    label: 'Configuration Reference'
  },
  {
    href: `${GITHUB_URL}#architecture`,
    label: 'Architecture'
  },
  {
    href: `${GITHUB_URL}#capabilities`,
    label: 'Capabilities'
  },
  {
    href: `${GITHUB_URL}#nextjs-integration-points`,
    label: 'Next.js Integration Points'
  }
];

const setupSteps = [
  {
    title: 'Install',
    body: 'Add the splitter beside Next.js. The repository README remains the source of truth for supported versions.',
    code: 'pnpm add next-slug-splitter next'
  },
  {
    title: 'Wrap the Next config',
    body: 'Register the splitter so the build can prepare generated route handlers before Next finalizes the app.',
    code: `import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfig } from './route-handlers-config';

export default withSlugSplitter(nextConfig, {
  routeHandlersConfig
});`
  },
  {
    title: 'Describe route targets',
    body: 'Point the config at the broad route, the content source, and the processor that knows which page keys map to which imports.',
    code: `export const routeHandlersConfig = {
  routerKind: 'app',
  targets: [
    createAppCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      contentDir: 'content/pages',
      routeContract: relativeModule('app/docs/[...slug]/route-contract'),
      handlerBinding
    })
  ]
};`
  },
  {
    title: 'Build and verify',
    body: 'Run the normal Next build. Then use the benchmark to confirm that light routes no longer carry heavier route chunks.',
    code: 'pnpm next build'
  }
];

const requirements = [
  'A broad dynamic or catch-all Next.js route',
  'A build-time way to know what one page needs',
  'A route target config that gives the splitter that boundary'
];

export function QuickStartPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>How to use</p>
          <h1>Give the build the page boundary the bundler cannot infer.</h1>
          <p className={styles.lede}>
            {SITE_NAME} works when a broad Next.js route can identify the
            route-specific code one page needs. This page gives the short path;
            the full reference stays in GitHub next to the implementation.
          </p>
        </div>
        <div className={styles.heroCard}>
          <strong>What you provide</strong>
          <ul>
            {requirements.map(requirement => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.steps} aria-label='Quick start steps'>
        {setupSteps.map((step, index) => (
          <article className={styles.step} key={step.title}>
            <div className={styles.stepCopy}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
            <pre className={styles.codeBlock}>
              <code>{step.code}</code>
            </pre>
          </article>
        ))}
      </section>

      <section className={styles.references}>
        <div>
          <p className={styles.eyebrow}>Reference</p>
          <h2>Details live in GitHub.</h2>
          <p>
            The README contains the full setup guide, router-specific examples,
            operation modes, and configuration reference. The website stays
            short so it does not drift from the code.
          </p>
        </div>
        <ol className={styles.referenceList}>
          {readmeContents.map(link => (
            <li key={link.href}>
              <a href={link.href} rel='noreferrer' target='_blank'>
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <Link href={BENCHMARK_PATH}>Run the live benchmark</Link>
          </li>
        </ol>
      </section>
    </main>
  );
}
