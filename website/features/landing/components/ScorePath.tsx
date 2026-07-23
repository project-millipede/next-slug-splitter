import styles from './ScorePath.module.css';

const scorePath = [
  {
    label: 'Less route JS',
    value: 'Only the page-specific code ships',
    active: true
  },
  {
    label: 'Less transport',
    value: 'Less transport to download',
    active: true
  },
  {
    label: 'Less main-thread work',
    value: 'Less JavaScript to prepare',
    active: false
  },
  {
    label: 'Better page experience signals',
    value: 'Paint and responsiveness can improve',
    active: false
  }
];

export function ScorePath() {
  return (
    <section className={styles.section}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Why ranking systems can care</p>
        <h2>Performance scores see symptoms. Ranking systems care about experience.</h2>
        <p>
          Search ranking systems care about page experience, and performance is
          part of that experience. Route splitting does not boost SEO directly.
          It removes unnecessary JavaScript before the page ships, which can
          improve the conditions behind faster loading, less main-thread work,
          and better responsiveness.
        </p>
        <p>
          Lighthouse, Core Web Vitals, and search page experience systems then
          observe the downstream outcomes. Bundle size is not the whole story,
          but it is one root input into performance.
        </p>
      </div>

      <div className={styles.path} aria-label="Bundle size scoring path">
        {scorePath.map(item => (
          <article
            className={`${styles.step} ${
              item.active ? styles.stepActive : ''
            }`}
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
