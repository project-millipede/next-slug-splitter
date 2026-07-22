import type { ExamplePreviewDensity } from './types';
import styles from './styles.module.css';

type ControlsProps = {
  density: ExamplePreviewDensity;
  onSelectDensity: (density: ExamplePreviewDensity) => void;
};

/**
 * Render the example controls sidebar next to the preview pane.
 */
export const Controls = ({ density, onSelectDensity }: ControlsProps) => (
  <aside className={styles.densityControls} aria-label='Example controls'>
    <span className={styles.panelLabel}>Density</span>
    <DensityButton
      density='Comfortable'
      selectedDensity={density}
      onSelectDensity={onSelectDensity}
    />
    <DensityButton
      density='Compact'
      selectedDensity={density}
      onSelectDensity={onSelectDensity}
    />
  </aside>
);

/**
 * Render one density selection button.
 */
const DensityButton = ({
  density,
  selectedDensity,
  onSelectDensity
}: {
  density: ExamplePreviewDensity;
  selectedDensity: ExamplePreviewDensity;
  onSelectDensity: (density: ExamplePreviewDensity) => void;
}) => (
  <button
    aria-pressed={selectedDensity === density}
    className={
      selectedDensity === density
        ? styles.densityButtonActive
        : styles.densityButton
    }
    onClick={() => onSelectDensity(density)}
    type='button'
  >
    {density}
  </button>
);
