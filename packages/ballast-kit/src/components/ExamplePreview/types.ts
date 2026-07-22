export const examplePreviewTabs = ['Preview', 'Code', 'Props'] as const;

export type ExamplePreviewTab = (typeof examplePreviewTabs)[number];

export type ExamplePreviewDensity = 'Comfortable' | 'Compact';
