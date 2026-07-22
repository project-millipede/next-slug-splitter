import { workbenchEventLog } from './data';
import styles from './styles.module.css';

/**
 * Render runtime and accessibility checks for the workbench preview as a
 * diagnostic event list.
 */
export const Audit = () => (
  <aside className={styles.auditPanel} aria-label='Workbench diagnostics'>
    <span className={styles.panelLabel}>Runtime checks</span>
    <ul>
      {workbenchEventLog.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </aside>
);
