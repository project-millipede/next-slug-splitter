import { describe, expect, it } from 'vitest';

import { extractPageConfigMetadataFromSource } from '../../core/page-config-metadata';

const TEST_COMPONENT_TRAIT_SOURCE = `
  const runtimeTraitCatalog = {
    selection: ['selection'],
    wrapper: ['wrapper']
  } as const;

  export const primaryComponents = defineComponents(
    {
      PrimarySelectionComponent: defineEntry({
        component: PrimarySelectionComponent,
        runtimeTraits: runtimeTraitCatalog.selection
      }),
      PrimaryStaticComponent: defineEntry({
        component: PrimaryStaticComponent
      }),
      IgnoredUtilityComponent: createIgnoredEntry({
        component: IgnoredUtilityComponent
      })
    },
    () => ({})
  );

  export const secondaryComponents = defineComponents(
    {
      SecondaryWrapperComponent: defineEntry({
        component: SecondaryWrapperComponent,
        runtimeTraits: runtimeTraitCatalog.wrapper
      })
    },
    () => ({})
  );
`;

const TEST_INLINE_TRAIT_SOURCE = `
  export const primaryComponents = defineComponents(
    {
      PrimarySelectionComponent: defineEntry({
        component: PrimarySelectionComponent,
        runtimeTraits: ['selection']
      }),
      SecondaryWrapperComponent: defineEntry({
        component: SecondaryWrapperComponent,
        runtimeTraits: ['wrapper']
      })
    },
    () => ({})
  );
`;

const TEST_INVALID_SCALAR_TRAIT_SOURCE = `
  export const primaryComponents = defineComponents(
    {
      PrimarySelectionComponent: defineEntry({
        component: PrimarySelectionComponent,
        runtimeTraits: 123
      })
    },
    () => ({})
  );
`;

const TEST_INVALID_CALL_TRAIT_SOURCE = `
  export const primaryComponents = defineComponents(
    {
      PrimarySelectionComponent: defineEntry({
        component: PrimarySelectionComponent,
        runtimeTraits: createTraits()
      })
    },
    () => ({})
  );
`;

const extractMetadata = (sourceText: string) =>
  extractPageConfigMetadataFromSource({
    filePath: '/tmp/page-config.tsx',
    sourceText
  });

describe('page-config metadata parser', () => {
  it('extracts runtime traits from property access expressions', () => {
    const metadata = extractPageConfigMetadataFromSource({
      filePath: '/tmp/page-config.tsx',
      sourceText: TEST_COMPONENT_TRAIT_SOURCE
    });

    expect(metadata.entries).toEqual([
      {
        key: 'PrimarySelectionComponent',
        runtimeTraits: ['selection']
      },
      {
        key: 'PrimaryStaticComponent',
        runtimeTraits: []
      },
      {
        key: 'SecondaryWrapperComponent',
        runtimeTraits: ['wrapper']
      }
    ]);
  });

  it('extracts runtime traits from inline string arrays', () => {
    expect(extractMetadata(TEST_INLINE_TRAIT_SOURCE).entries).toEqual([
      {
        key: 'PrimarySelectionComponent',
        runtimeTraits: ['selection']
      },
      {
        key: 'SecondaryWrapperComponent',
        runtimeTraits: ['wrapper']
      }
    ]);
  });

  it('rejects invalid scalar runtimeTraits values', () => {
    expect(() => extractMetadata(TEST_INVALID_SCALAR_TRAIT_SOURCE)).toThrow(
      'runtimeTraits for "PrimarySelectionComponent" in "/tmp/page-config.tsx" must be a string array literal or property access.'
    );
  });

  it('rejects invalid call-expression runtimeTraits values', () => {
    expect(() => extractMetadata(TEST_INVALID_CALL_TRAIT_SOURCE)).toThrow(
      'runtimeTraits for "PrimarySelectionComponent" in "/tmp/page-config.tsx" must be a string array literal or property access.'
    );
  });

  it('ignores non-defineEntry properties inside defineComponents', () => {
    expect(extractMetadata(TEST_COMPONENT_TRAIT_SOURCE).entries).not.toContainEqual(
      expect.objectContaining({
        key: 'IgnoredUtilityComponent'
      })
    );
  });
});
