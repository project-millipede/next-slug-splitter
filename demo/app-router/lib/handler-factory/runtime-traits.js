/**
 * Runtime trait keys understood by the demo handler factory.
 */
export const runtimeTrait = {
    selection: 'selection',
    wrapper: 'wrapper'
};
/**
 * Small helper constants reused by the demo processors.
 */
export const runtimeTraits = {
    selection: [runtimeTrait.selection],
    wrapper: [runtimeTrait.wrapper],
    wrapperAndSelection: [runtimeTrait.wrapper, runtimeTrait.selection]
};
