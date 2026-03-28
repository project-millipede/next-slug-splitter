import { describe, expect, it } from 'vitest';

import * as nextExports from '../../next';
import * as nextConfigExports from '../../next/config';

describe('next public exports', () => {
  it('does not expose internal bootstrap helpers', () => {
    expect('loadRouteHandlersConfigOrRegistered' in nextExports).toBe(false);
    expect('resolveLocaleConfigFromInputOrRuntimeSemantics' in nextExports).toBe(
      false
    );
    expect('resolveRouteHandlersAppContext' in nextExports).toBe(false);
    expect('resolveRouteHandlersConfigBaseFromAppConfig' in nextConfigExports).toBe(
      false
    );
    expect(
      'resolveRouteHandlersConfigBasesFromAppConfig' in nextConfigExports
    ).toBe(false);
    expect('resolveRouteHandlersConfigsFromAppConfig' in nextConfigExports).toBe(
      false
    );
  });
});
