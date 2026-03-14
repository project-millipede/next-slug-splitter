import {
  isObjectRecord,
  isStringArray,
  readObjectProperty
} from '../../utils/type-guards-custom';
import { isNonEmptyString } from '../../utils/type-guards-extended';
import type { DynamicRouteParamKind } from '../types';

export { isNonEmptyString, isObjectRecord, isStringArray, readObjectProperty };

/**
 * Determine whether a value is one of the supported dynamic route parameter
 * kinds.
 *
 * @param value - Candidate kind value.
 * @returns `true` when the value is a supported route parameter kind.
 */
export const isDynamicRouteParamKind = (
  value: unknown
): value is DynamicRouteParamKind =>
  value === 'single' || value === 'catch-all' || value === 'optional-catch-all';
