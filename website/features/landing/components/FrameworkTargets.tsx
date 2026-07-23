'use client';

import { Collapsible } from '@base-ui/react/collapsible';

import styles from './FrameworkTargets.module.css';

const targetGroups = [
  {
    label: 'Now',
    summary: 'MDX-based Next.js content routes.',
    defaultOpen: true,
    targets: [
      {
        label: 'Next.js route targets',
        category: 'Current core',
        detail:
          'App Router and Pages Router can split broad catch-all content routes without giving up the route shape.'
      },
      {
        label: 'Docs framework integrations',
        category: 'Current integrations',
        detail:
          'Apply the same MDX component-key model inside popular Next.js content frameworks.',
        links: [
          {
            label: 'Fumadocs demo',
            href: 'https://next-slug-splitter-fumadocs-integra.vercel.app/'
          }
        ]
      }
    ]
  },
  {
    label: 'Future',
    summary: 'Provider-backed composition sources.',
    defaultOpen: false,
    targets: [
      {
        label: 'Headless CMS',
        category: 'Key provider',
        detail:
          'Contentful, Sanity, Storyblok, and custom CMS section types can become component keys when page composition is available at build time.'
      },
      {
        label: 'Page builders',
        category: 'Key provider',
        detail:
          'Page snapshots from tools like Makeswift and Builder.io already know which registered components an editor placed on a page.'
      },
      {
        label: 'Commerce routes',
        category: 'Use case',
        detail:
          'Product, category, campaign, and landing routes often combine templates, CMS blocks, and page-builder sections. When those inputs expose component keys at build time, broad storefront routes can stay broad without one page pulling in every block.'
      }
    ]
  }
];

export function FrameworkTargets() {
  return (
    <section className={styles.section}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Where it fits</p>
        <h2>Where page composition is known.</h2>
        <p>
          Today the splitter is MDX-first. The broader idea is target-based:
          when a Next.js content route can identify the components needed for
          one page, the splitter can give that page its own route boundary.
        </p>
      </div>
      <div className={styles.panel}>
        {targetGroups.map(group => (
          <Collapsible.Root
            className={styles.group}
            defaultOpen={group.defaultOpen}
            key={group.label}
          >
            <Collapsible.Trigger className={styles.groupTrigger}>
              <span className={styles.groupHeader}>
                <strong>{group.label}</strong>
                <span>{group.summary}</span>
              </span>
              <span className={styles.groupIcon} aria-hidden='true'>
                &gt;
              </span>
            </Collapsible.Trigger>
            <Collapsible.Panel className={styles.groupPanel} hiddenUntilFound>
              <div className={styles.groupTargets}>
                {group.targets.map(target => {
                  const links =
                    'links' in target && target.links != null
                      ? target.links
                      : [];

                  return (
                    <article className={styles.target} key={target.label}>
                      <div className={styles.targetHeader}>
                        <strong>{target.label}</strong>
                        <span>{target.category}</span>
                      </div>
                      <p>{target.detail}</p>
                      {links.length > 0 ? (
                        <div className={styles.targetLinks}>
                          {links.map(link => (
                            <a
                              href={link.href}
                              key={link.href}
                              rel='noreferrer'
                              target='_blank'
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        ))}
      </div>
    </section>
  );
}
