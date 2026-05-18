import type { LoadableComponentEntry } from './types';

export type EmittedComponentKeySelection = {
  emittedComponentKeys: Array<string>;
  hasEmittedComponentKeys: boolean;
};

/**
 * Select emitted component keys from normalized component entries.
 *
 * The input already represents the processor-selected subset of captured MDX
 * components. Captured components omitted by the processor remain on the MDX
 * component scope path.
 *
 * @param componentEntries - Normalized component entries selected for emission.
 * @returns Emitted component keys plus an explicit non-empty selection flag.
 */
export const selectEmittedComponentKeys = (
  componentEntries: ReadonlyArray<LoadableComponentEntry>
): EmittedComponentKeySelection => {
  const emittedComponentKeys = componentEntries.map(({ key }) => key);

  return {
    emittedComponentKeys,
    hasEmittedComponentKeys: emittedComponentKeys.length > 0
  };
};
