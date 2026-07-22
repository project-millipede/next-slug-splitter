import type { FlowStep } from './data';
import styles from './styles.module.css';

type CanvasProps = {
  selectedStepId: string;
  steps: FlowStep[];
  onSelectStep: (stepId: string) => void;
};

/**
 * Render selectable flow nodes on the composer canvas.
 */
export const Canvas = ({
  selectedStepId,
  steps,
  onSelectStep
}: CanvasProps) => (
  <ol className={styles.canvas} aria-label='Pipeline steps'>
    {steps.map((step, index) => {
      const isSelected = step.id === selectedStepId;

      return (
        <li className={styles.nodeItem} key={step.id}>
          <button
            aria-pressed={isSelected}
            className={`${styles.node} ${
              isSelected ? styles.nodeSelected : ''
            }`}
            onClick={() => onSelectStep(step.id)}
            type='button'
          >
            <span className={styles.nodeIndex}>{index + 1}</span>
            <strong>{step.label}</strong>
            <span className={styles.nodeDescription}>{step.description}</span>
            <span className={styles.nodeStatus}>{step.status}</span>
          </button>
        </li>
      );
    })}
  </ol>
);
