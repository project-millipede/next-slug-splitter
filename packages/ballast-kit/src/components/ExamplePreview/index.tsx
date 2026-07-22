'use client';

import { useState } from 'react';

import { BALLAST_DATA } from '../../ballast/generated/example-preview-ballast';
import { Controls } from './Controls';
import { Header } from './Header';
import { Pane } from './Pane';
import type { ExamplePreviewDensity, ExamplePreviewTab } from './types';

import styles from './styles.module.css';

const examplePreviewBallastSize = JSON.stringify(BALLAST_DATA).length;

/**
 * Interactive docs example preview.
 *
 * The UI mirrors a real component-docs block with a live preview, source tab,
 * and prop controls. The ballast import simulates the preview runtime carried
 * only by routes that render this component.
 */
export const ExamplePreview = () => {
  const [activeTab, setActiveTab] = useState<ExamplePreviewTab>('Preview');
  const [density, setDensity] = useState<ExamplePreviewDensity>('Comfortable');

  return (
    <section
      className={styles.examplePreview}
      data-ballast={examplePreviewBallastSize}
    >
      <Header activeTab={activeTab} onSelectTab={setActiveTab} />
      <div className={styles.body}>
        <Pane activeTab={activeTab} density={density} />
        <Controls density={density} onSelectDensity={setDensity} />
      </div>
    </section>
  );
};
