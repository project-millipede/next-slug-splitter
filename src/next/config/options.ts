import type { ContentLocaleMode, EmitFormat } from '../../core/types';
import { createConfigError } from '../../utils/errors';
import type { DynamicRouteParam } from '../types';

import { isUndefined } from '../../utils/type-guards';
import { isNonEmptyArray } from '../../utils/type-guards-extended';
import {
  isDynamicRouteParamKind,
  isNonEmptyString,
  isObjectRecord,
  readObjectProperty
} from './shared';

/**
 * Read a required string-valued config option.
 *
 * @param value - Raw option value.
 * @param label - Human-readable option label used in error messages.
 * @returns The validated non-empty string value.
 * @throws If the value is missing or not a non-empty string.
 */
export const readRequiredStringOption = (
  value: unknown,
  label: string
): string => {
  if (isNonEmptyString(value)) {
    return value;
  }

  throw createConfigError(`${label} must be a non-empty string.`);
};

/**
 * Normalize the configured emit format.
 *
 * @param value Raw emit format value.
 * @returns `'ts'` by default, or the validated configured emit format.
 * @throws If the value is not one of the supported emit formats.
 */
export const readEmitFormatOption = (value: unknown): EmitFormat => {
  if (isUndefined(value)) {
    return 'ts';
  }

  if (value === 'js' || value === 'ts') {
    return value;
  }

  throw createConfigError('emitFormat must be "js" or "ts".');
};

/**
 * Normalize the configured content locale mode.
 *
 * @param value Raw content locale mode value.
 * @returns `'filename'` by default, or the validated configured mode.
 * @throws If the value is not one of the supported locale modes.
 */
export const readContentLocaleModeOption = (
  value: unknown
): ContentLocaleMode => {
  if (isUndefined(value)) {
    return 'filename';
  }

  if (value === 'filename' || value === 'default-locale') {
    return value;
  }

  throw createConfigError(
    'contentLocaleMode must be "filename" or "default-locale".'
  );
};

/**
 * Normalize a configured route base path.
 *
 * @param value Raw route base path.
 * @returns A leading-slash route base path without a trailing slash, except for
 * the root path itself.
 * @throws If the path does not start with `/`.
 */
export const normalizeRouteBasePath = (value: string): string => {
  if (!value.startsWith('/')) {
    throw createConfigError('routeBasePath must start with "/".');
  }

  if (value === '/') {
    return value;
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
};

/**
 * Normalize a route segment string into a slash-joined path without empty
 * segments.
 *
 * @param value Raw route segment value.
 * @returns Normalized route segment string.
 * @throws If the value does not contain at least one non-empty path segment.
 */
export const normalizeRouteSegment = (value: string): string => {
  if (!isNonEmptyString(value)) {
    throw createConfigError('routeSegment must be a non-empty string.');
  }

  const rawSegments = value.split('/');
  const normalizedSegments: Array<string> = [];
  for (const rawSegment of rawSegments) {
    if (isNonEmptyString(rawSegment)) {
      normalizedSegments.push(rawSegment);
    }
  }

  if (!isNonEmptyArray(normalizedSegments)) {
    throw createConfigError(
      'routeSegment must contain at least one path segment.'
    );
  }

  return normalizedSegments.join('/');
};

/**
 * Normalize a target id.
 *
 * @param value Raw target id.
 * @returns The validated target id.
 * @throws If the value is empty.
 */
export const normalizeTargetId = (value: string): string => {
  if (!isNonEmptyString(value)) {
    throw createConfigError('targetId must be a non-empty string.');
  }

  return value;
};

/**
 * Derive a target id from a route base path.
 *
 * @param routeBasePath Normalized route base path.
 * @returns Target id derived from the route path.
 * @throws If no target id can be derived from the path.
 */
export const deriveTargetIdFromRouteBasePath = (
  routeBasePath: string
): string => {
  const normalized = routeBasePath.replace(/^\/+/, '').replace(/\/+/g, '-');
  if (normalized.length === 0) {
    throw createConfigError(
      'Could not derive targetId from routeBasePath.'
    );
  }

  return normalized;
};

/**
 * Normalize the configured dynamic route parameter descriptor.
 *
 * @param value Raw handler route param value.
 * @returns Validated dynamic route param descriptor.
 * @throws If the descriptor is missing required fields or uses an unsupported
 * kind.
 */
export const normalizeHandlerRouteParam = (
  value: unknown
): DynamicRouteParam => {
  if (!isObjectRecord(value)) {
    throw createConfigError('handlerRouteParam must be an object.');
  }

  const name = readObjectProperty(value, 'name');
  const kind = readObjectProperty(value, 'kind');

  if (!isNonEmptyString(name)) {
    throw createConfigError(
      'handlerRouteParam.name must be a non-empty string.'
    );
  }

  if (!isDynamicRouteParamKind(kind)) {
    throw createConfigError(
      'handlerRouteParam.kind must be "single", "catch-all", or "optional-catch-all".'
    );
  }

  return { name, kind };
};
