import styles from './styles.module.css';

/**
 * Render the flow composer heading and draft status.
 */
export const Header = () => (
  <div className={styles.header}>
    <div>
      <p className={styles.eyebrow}>Flow composer</p>
      <h3>Documentation publish pipeline</h3>
    </div>
    <span className={styles.statusBadge}>Draft</span>
  </div>
);
