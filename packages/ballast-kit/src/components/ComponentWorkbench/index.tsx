'use client';

import { useState } from 'react';

import { BALLAST_DATA } from '../../ballast/generated/component-workbench-ballast';
import { Audit } from './Audit';
import { defaultWorkbenchVariant, type WorkbenchVariant } from './data';
import { Canvas } from './Canvas';
import { Variants } from './Variants';
import { Header } from './Header';

import styles from './styles.module.css';

const componentWorkbenchBallastSize = JSON.stringify(BALLAST_DATA).length;

/**
 * Rich component workbench for docs and design-system pages.
 *
 * The workbench represents the kind of prop editor, preview canvas, and audit
 * panel commonly embedded in component documentation. Its ballast import is
 * intentionally larger because these workbench surfaces often bring broad
 * editor/runtime dependencies.
 */
export const ComponentWorkbench = () => {
  const [variant, setVariant] = useState<WorkbenchVariant>(
    defaultWorkbenchVariant
  );
  const [showGrid, setShowGrid] = useState(true);

  return (
    <section
      className={styles.componentWorkbench}
      data-ballast={componentWorkbenchBallastSize}
    >
      <Header
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(value => !value)}
      />
      <div className={styles.workspace}>
        <Variants variant={variant} onSelectVariant={setVariant} />
        <Canvas showGrid={showGrid} variant={variant} />
        <Audit />
      </div>
    </section>
  );
};
