import styles from './WhyBoundaries.module.css';

const ranking = [
  {
    number: '01',
    label: 'Fix the boundary',
    title: 'Give the bundler a page-specific module.',
    detail:
      'A catch-all route puts many pages behind one file. The bundler follows every reachable import because that is the only safe boundary it can see.'
  },
  {
    number: '02',
    label: 'Then tune delivery',
    title: 'Compression, caching, and prefetching work on smaller output.',
    detail:
      'Those optimizations still matter, but they become cleaner once light pages are not carrying code from heavier pages in the same route.'
  },
  {
    number: '03',
    label: 'Use mitigations last',
    title: 'next/dynamic can defer cost, not explain the route.',
    detail:
      'Dynamic imports are useful for interaction-driven UI. They do not tell Next.js which slug needs which component at build time, so they are a mitigation layer, not the route-boundary fix.'
  }
];

export function WhyBoundaries() {
  return (
    <section className={styles.section}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Why it exists</p>
        <h2>Fix the bundle boundary before tuning around it.</h2>
        <p>
          The bundler is not failing. It is doing the conservative thing for the
          shared module graph it receives. Splitter changes that input at build
          time, so page-specific routes become visible before delivery
          optimizations begin.
        </p>
      </div>

      <div className={styles.ranking} aria-label="Optimization order">
        {ranking.map(item => (
          <article className={styles.rankItem} key={item.number}>
            <div className={styles.rankMeta}>
              <span>{item.number}</span>
              <strong>{item.label}</strong>
            </div>
            <div className={styles.rankCopy}>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
