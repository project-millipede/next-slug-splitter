'use client';

import { Popover } from '@base-ui/react/popover';

import styles from './PathDisclosure.module.css';

type PathDisclosureProps = {
  label: string;
  path: string;
};

/**
 * Present a path within bounded space and disclose its complete value.
 *
 * Pointer hover, keyboard focus, and touch press all expose the same full path.
 *
 * @param props Path disclosure configuration.
 * @returns Truncated path trigger with an accessible full-path popover.
 */
export function PathDisclosure({ label, path }: PathDisclosureProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Show full ${label}: ${path}`}
        className={styles.trigger}
        openOnHover
        type='button'
      >
        <code className={styles.preview}>{path}</code>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>{label}</Popover.Title>
            <code className={styles.fullPath}>{path}</code>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
