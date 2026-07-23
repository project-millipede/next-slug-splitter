'use client';

import { useId } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import {
  COMPARISON_DEMO_TARGETS,
  type ComparisonTargetId
} from '../../../lib/benchmark/catalog';

import styles from './TargetSelector.module.css';

type TargetSelectorProps = {
  isMeasurementRunning: boolean;
  selectedTargetId: ComparisonTargetId;
  onSelect: (targetId: ComparisonTargetId) => void;
};

export function TargetSelector({
  isMeasurementRunning,
  selectedTargetId,
  onSelect
}: TargetSelectorProps) {
  const targetSelectorId = useId();

  return (
    <RadioGroup
      aria-label='Target app'
      className={styles.radioGroup}
      disabled={isMeasurementRunning}
      onValueChange={(value: unknown) => {
        const selectedTarget = COMPARISON_DEMO_TARGETS.find(
          target => target.id === value
        );

        if (selectedTarget != null) {
          onSelect(selectedTarget.id);
        }
      }}
      value={selectedTargetId}
    >
      {COMPARISON_DEMO_TARGETS.map(target => {
        const isActive = target.id === selectedTargetId;
        const labelId = `${targetSelectorId}-${target.id}-label`;
        const pathId = `${targetSelectorId}-${target.id}-path`;

        return (
          <div
            className={`${styles.targetItem} ${
              isActive ? styles.targetItemActive : ''
            }`}
            key={target.id}
            onClick={event => {
              if (isMeasurementRunning) {
                return;
              }

              event.currentTarget
                .querySelector<HTMLElement>('[role="radio"]')
                ?.focus();
              onSelect(target.id);
            }}
          >
            <Radio.Root
              aria-describedby={pathId}
              aria-labelledby={labelId}
              className={styles.radio}
              value={target.id}
            >
              <Radio.Indicator className={styles.radioIndicator} />
            </Radio.Root>
            <span className={styles.targetLabel} id={labelId}>
              {target.label}
            </span>
            <code className={styles.targetPath} id={pathId}>
              {target.zonePath}
            </code>
            <a
              aria-label={`Open ${target.label}`}
              className={styles.appLink}
              href={target.appUrl}
              onClick={event => {
                event.stopPropagation();
              }}
              rel='noreferrer'
              target='_blank'
            >
              Open app
            </a>
          </div>
        );
      })}
    </RadioGroup>
  );
}
