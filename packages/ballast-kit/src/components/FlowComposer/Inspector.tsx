import type { FlowStep } from './data';
import styles from './styles.module.css';

type InspectorProps = {
  selectedStep: FlowStep;
};

/**
 * Render the selected composer step's details in the inspector sidebar.
 */
export const Inspector = ({ selectedStep }: InspectorProps) => (
  <aside className={styles.inspector} aria-label='Selected step details'>
    <span className={styles.panelLabel}>Selected step</span>
    <h4>{selectedStep.label}</h4>
    <p>{selectedStep.description}</p>
    <dl>
      <div>
        <dt>Mode</dt>
        <dd>{selectedStep.mode}</dd>
      </div>
      <div>
        <dt>Validation</dt>
        <dd>{selectedStep.validation}</dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd>{selectedStep.owner}</dd>
      </div>
    </dl>
  </aside>
);
