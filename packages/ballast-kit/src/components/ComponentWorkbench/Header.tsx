import styles from './styles.module.css';

type HeaderProps = {
  showGrid: boolean;
  onToggleGrid: () => void;
};

/**
 * Render the workbench title and preview-grid toggle.
 */
export const Header = ({ showGrid, onToggleGrid }: HeaderProps) => (
  <div className={styles.header}>
    <div>
      <p className={styles.eyebrow}>Component workbench</p>
      <h3>Button group playground</h3>
    </div>
    <label className={styles.toggle}>
      <input checked={showGrid} onChange={onToggleGrid} type='checkbox' />
      Grid
    </label>
  </div>
);
