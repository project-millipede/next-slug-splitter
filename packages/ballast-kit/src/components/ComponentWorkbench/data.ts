export const workbenchVariants = ['Default', 'Dense', 'Marketing'] as const;

export type WorkbenchVariant = (typeof workbenchVariants)[number];

export const defaultWorkbenchVariant: WorkbenchVariant = 'Default';

/** Simulated preview viewport width shown in the canvas toolbar. */
export const workbenchPreviewViewportWidth = '1280 px';

/** Design token values shown in the variant panel, keyed by variant. */
export const workbenchTokensByVariant: Record<
  WorkbenchVariant,
  { radius: string; gap: string; theme: string }
> = {
  Default: { radius: '6px', gap: '8px', theme: 'System' },
  Dense: { radius: '6px', gap: '4px', theme: 'System' },
  Marketing: { radius: '6px', gap: '8px', theme: 'System' }
};

export const workbenchEventLog = [
  'Loaded accessibility tree',
  'Resolved variant tokens',
  'Synced preview viewport',
  'Validated keyboard order'
];
