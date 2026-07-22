import { examplePreviewTabs, type ExamplePreviewTab } from './types';
import styles from './styles.module.css';

type HeaderProps = {
  activeTab: ExamplePreviewTab;
  onSelectTab: (tab: ExamplePreviewTab) => void;
};

/**
 * Render the example title and tab switcher.
 */
export const Header = ({ activeTab, onSelectTab }: HeaderProps) => (
  <div className={styles.header}>
    <div>
      <p className={styles.eyebrow}>Example preview</p>
      <h3>Combobox interaction</h3>
    </div>
    <div className={styles.modeTabs} role='tablist' aria-label='Preview mode'>
      {examplePreviewTabs.map(tab => (
        <button
          aria-selected={activeTab === tab}
          className={activeTab === tab ? styles.modeTabActive : styles.modeTab}
          key={tab}
          onClick={() => onSelectTab(tab)}
          role='tab'
          type='button'
        >
          {tab}
        </button>
      ))}
    </div>
  </div>
);
