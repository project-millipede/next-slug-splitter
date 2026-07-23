'use client';

import Link from 'next/link';

import styles from './BenchmarkPreview.module.css';

const previewCards = [
  {
    title: 'Light route',
    description: 'Static content behind the same catch-all route.',
    before: '400 kB',
    beforePercent: 100,
    after: '0 kB',
    afterPercent: 0,
    notShipped: '400 kB not shipped',
    outcome: 'Light pages stay light.'
  },
  {
    title: 'Heavier route',
    description: 'Interactive content that still needs its own client code.',
    before: '400 kB',
    beforePercent: 100,
    after: '100 kB',
    afterPercent: 25,
    notShipped: '300 kB not shipped',
    outcome: 'Only route-specific code travels.'
  }
];

export function BenchmarkPreview() {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Benchmark preview</p>
        <h2>See the catch-all tax removed per route.</h2>
        <p>
          The route starts as one accumulated chunk. Splitter turns it into
          page-specific route chunks, so each page carries only its own
          transport.
        </p>
        <Link href='/benchmark'>Open full benchmark</Link>
      </div>

      <div className={styles.cards} aria-label='Benchmark preview'>
        {previewCards.map(card => (
          <article className={styles.card} key={card.title}>
            <div className={styles.cardHeader}>
              <div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
              <strong>{card.notShipped}</strong>
            </div>

            <div className={styles.payloadRows}>
              <div className={styles.payloadRow}>
                <div className={styles.payloadLabel}>
                  <span>Before splitter</span>
                  <strong>{card.before}</strong>
                </div>
                <div
                  aria-label={`${card.title} before splitter ${card.before} accumulated route chunk`}
                  className={styles.payloadTrack}
                >
                  <span
                    className={styles.payloadBeforeIndicator}
                    style={{ width: `${card.beforePercent}%` }}
                  />
                </div>
                <small>Accumulated route chunk</small>
              </div>

              <div className={styles.payloadRow}>
                <div className={styles.payloadLabel}>
                  <span>After splitter</span>
                  <strong>{card.after}</strong>
                </div>
                <div
                  aria-label={`${card.title} after splitter ${card.after} page-specific route chunk`}
                  className={styles.payloadTrack}
                >
                  <span
                    className={`${styles.payloadAfterIndicator} ${
                      card.afterPercent === 0
                        ? styles.payloadZeroIndicator
                        : ''
                    }`}
                    style={{ width: `${card.afterPercent}%` }}
                  />
                </div>
                <small>Page-specific route chunk</small>
              </div>
            </div>

            <p className={styles.outcome}>{card.outcome}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
