/**
 * Stable semantic key for one localized heavy-route identity.
 *
 * @remarks
 * Multiple subsystems need to talk about "this exact localized content path"
 * without passing around a full route object shape:
 *
 * - page-time heavy-route lookup
 * - proxy lazy discovery reuse
 * - persisted lazy discovery projection back into page-time lookup
 *
 * Centralizing the encoding keeps those layers aligned and avoids subtle
 * drift where one layer might join locale/slug differently from another.
 */

/**
 * Encode a locale and slug array into a unique heavy-route lookup key.
 *
 * @param locale - Locale code that owns the route.
 * @param slugArray - Ordered slug segments for the route.
 * @returns Stable path key string.
 */
export const toHeavyRoutePathKey = (
  locale: string,
  slugArray: Array<string>
): string => `${locale}:${slugArray.join('/')}`;
