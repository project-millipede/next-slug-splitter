import Link from 'next/link';

const INTEGRATION_README_URL =
  'https://github.com/project-millipede/next-slug-splitter/blob/main/integrations/frameworks/fumadocs-next/README.md';

/**
 * Introduce the integration and explain what it preserves and improves.
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-fd-muted-foreground">
        Fumadocs + next-slug-splitter
      </p>
      <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight">
        Keep heavy custom components page-specific
      </h1>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
        <Link className="font-medium underline underline-offset-4" href="/docs">
          Explore the integration
        </Link>
        <a
          className="text-fd-muted-foreground underline underline-offset-4"
          href={INTEGRATION_README_URL}
          rel="noreferrer"
          target="_blank"
        >
          Read the integration guide
        </a>
      </div>
      <p className="mt-5 max-w-2xl text-fd-muted-foreground">
        Keep broad documentation routes and the standard Fumadocs experience
        without making every page download every heavy MDX component.
      </p>

      <section
        aria-labelledby="integration-benefits"
        className="mt-10 max-w-4xl"
      >
        <h2 id="integration-benefits" className="text-xl font-semibold">
          What this integration gives you
        </h2>
        <ul className="mt-5 grid gap-4 text-left md:grid-cols-3">
          <li className="rounded-lg border p-5">
            <strong>Standard Fumadocs</strong>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              Keep the normal docs layout, page tree, search, MDX rendering,
              and public route structure.
            </p>
          </li>
          <li className="rounded-lg border p-5">
            <strong>Page-specific heavy UI</strong>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              Load interactive components only for the documentation pages
              that actually use them.
            </p>
          </li>
          <li className="rounded-lg border p-5">
            <strong>Stable documentation URLs</strong>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              Preserve the authored `/docs` routes while generated handlers
              provide isolated bundle boundaries internally.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
