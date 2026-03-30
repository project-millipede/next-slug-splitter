import type { NextConfig } from 'next';

/**
 * Alias for Next.js config type.
 *
 * @remarks
 * Kept as a compatibility surface so unrelated modules do not need to churn
 * when the CLI no longer loads `next.config.*` directly.
 */
export type NextConfigLike = NextConfig;
