import styles from './styles.module.css';
import type { ExamplePreviewDensity, ExamplePreviewTab } from './types';

type PaneProps = {
  activeTab: ExamplePreviewTab;
  density: ExamplePreviewDensity;
};

/**
 * Render the selected example panel: live preview, source code, or props.
 */
export const Pane = ({ activeTab, density }: PaneProps) => (
  <div className={styles.previewPane} role='tabpanel'>
    {activeTab === 'Preview' ? <LivePreview density={density} /> : null}
    {activeTab === 'Code' ? <CodePreview /> : null}
    {activeTab === 'Props' ? <PropsPreview density={density} /> : null}
  </div>
);

/**
 * Render the live combobox mock.
 */
const LivePreview = ({ density }: { density: ExamplePreviewDensity }) => (
  <div
    className={`${styles.demoSurface} ${
      density === 'Compact' ? styles.demoSurfaceCompact : ''
    }`}
  >
    <label className={styles.comboboxLabel} htmlFor='demo-combobox'>
      Choose a fruit
    </label>
    <div className={styles.comboboxInputGroup}>
      <input
        className={styles.comboboxInput}
        id='demo-combobox'
        placeholder='e.g. Apple'
        readOnly
        value={density === 'Compact' ? 'Mango' : ''}
      />
      <button
        aria-expanded='true'
        aria-label='Toggle fruit options'
        className={styles.comboboxToggleButton}
        type='button'
      >
        <span aria-hidden='true'>▾</span>
      </button>
    </div>
    <div className={styles.comboboxPopover} role='listbox'>
      <span aria-selected='true' role='option'>Apple</span>
      <span aria-selected='false' role='option'>Mango</span>
      <span aria-selected='false' role='option'>Orange</span>
    </div>
  </div>
);

/**
 * Render the source-code pane.
 */
const CodePreview = () => (
  <pre className={styles.codeBlock}>
    <code>{`<Combobox.Root items={fruits}>
  <Combobox.Input placeholder="e.g. Apple" />
  <Combobox.Popup />
</Combobox.Root>`}</code>
  </pre>
);

/**
 * Render the props summary pane.
 */
const PropsPreview = ({ density }: { density: ExamplePreviewDensity }) => (
  <dl className={styles.propsGrid}>
    <div>
      <dt>items</dt>
      <dd>Fruit[]</dd>
    </div>
    <div>
      <dt>openOnFocus</dt>
      <dd>true</dd>
    </div>
    <div>
      <dt>density</dt>
      <dd>{density.toLowerCase()}</dd>
    </div>
  </dl>
);
