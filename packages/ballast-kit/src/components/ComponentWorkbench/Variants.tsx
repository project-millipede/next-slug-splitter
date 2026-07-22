import {
  type WorkbenchVariant,
  workbenchTokensByVariant,
  workbenchVariants
} from './data';
import styles from './styles.module.css';

type VariantsProps = {
  variant: WorkbenchVariant;
  onSelectVariant: (variant: WorkbenchVariant) => void;
};

/**
 * Render variant controls and token metadata.
 */
export const Variants = ({ variant, onSelectVariant }: VariantsProps) => (
  <aside className={styles.variantsPanel} aria-label='Variant controls'>
    <span className={styles.panelLabel}>Variant</span>
    {workbenchVariants.map(item => (
      <button
        aria-pressed={variant === item}
        className={
          variant === item
            ? styles.variantButtonActive
            : styles.variantButton
        }
        key={item}
        onClick={() => onSelectVariant(item)}
        type='button'
      >
        {item}
      </button>
    ))}

    <TokenList variant={variant} />
  </aside>
);

/**
 * Render design token values for the selected variant.
 */
const TokenList = ({ variant }: { variant: WorkbenchVariant }) => {
  const tokens = workbenchTokensByVariant[variant];

  return (
    <dl className={styles.tokenList}>
      <div>
        <dt>Radius</dt>
        <dd>{tokens.radius}</dd>
      </div>
      <div>
        <dt>Gap</dt>
        <dd>{tokens.gap}</dd>
      </div>
      <div>
        <dt>Theme</dt>
        <dd>{tokens.theme}</dd>
      </div>
    </dl>
  );
};
