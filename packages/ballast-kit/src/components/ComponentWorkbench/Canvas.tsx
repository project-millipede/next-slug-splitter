import {
  type WorkbenchVariant,
  workbenchPreviewViewportWidth
} from './data';
import styles from './styles.module.css';

type CanvasProps = {
  showGrid: boolean;
  variant: WorkbenchVariant;
};

/**
 * Render the central component preview canvas.
 */
export const Canvas = ({ showGrid, variant }: CanvasProps) => (
  <div
    className={`${styles.canvas} ${showGrid ? styles.canvasGrid : ''}`}
    aria-label='Component preview'
  >
    <div className={styles.previewToolbar}>
      <span>{variant}</span>
      <strong>{workbenchPreviewViewportWidth}</strong>
    </div>
    <div className={styles.previewCard}>
      <p>Deployment target</p>
      <div className={styles.buttonGroup}>
        <button type='button'>Preview</button>
        <button type='button'>Promote</button>
        <button type='button'>Rollback</button>
      </div>
    </div>
  </div>
);
