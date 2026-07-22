'use client';

import { useState } from 'react';

import { BALLAST_DATA } from '../../ballast/generated/flow-composer-ballast';
import { flowStepsById, initialFlowStep, flowSteps } from './data';
import { Canvas } from './Canvas';
import { Header } from './Header';
import { Inspector } from './Inspector';

import styles from './styles.module.css';

const flowComposerBallastSize = JSON.stringify(BALLAST_DATA).length;

/**
 * Visual flow composer for docs examples.
 *
 * This represents a realistic client-side builder or workflow editor. The
 * ballast import simulates the graph runtime and editor controls carried only
 * by routes that embed the composer.
 */
export const FlowComposer = () => {
  const [selectedStepId, setSelectedStepId] = useState(initialFlowStep.id);
  const selectedStep = flowStepsById.get(selectedStepId) ?? initialFlowStep;

  return (
    <section
      className={styles.flowComposer}
      data-ballast={flowComposerBallastSize}
    >
      <Header />
      <div className={styles.workspace}>
        <Canvas
          selectedStepId={selectedStepId}
          steps={flowSteps}
          onSelectStep={setSelectedStepId}
        />
        <Inspector selectedStep={selectedStep} />
      </div>
    </section>
  );
};
