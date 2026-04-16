/**
 * Runtime trait keys understood by the demo handler factory.
 */
export const runtimeTrait = {
  selection: 'selection',
  wrapper: 'wrapper'
} as const;

/**
 * One supported runtime trait key.
 */
export type RuntimeTrait = (typeof runtimeTrait)[keyof typeof runtimeTrait];

/**
 * Ordered list of runtime traits attached to one component entry.
 */
export type RuntimeTraits = ReadonlyArray<RuntimeTrait>;

/**
 * Small helper constants reused by the demo processors.
 */
export const runtimeTraits = {
  selection: [runtimeTrait.selection],
  wrapper: [runtimeTrait.wrapper],
  wrapperAndSelection: [runtimeTrait.wrapper, runtimeTrait.selection]
} as const;

/**
 * Optional runtime metadata emitted into generated handler entries.
 */
export type RuntimeConfig = {
  runtimeTraits?: RuntimeTraits;
};
