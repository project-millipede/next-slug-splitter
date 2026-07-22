/**
 * Record shape shared by every generated ballast module.
 *
 * Single source of truth for the ballast contract: the committed `.d.ts`
 * stubs in `generated/` and the payload files emitted by `generate.ts` both
 * reference this type, so a shape change that misses either side becomes a
 * compile error instead of silent drift.
 */
export type BallastRecord = {
  id: number;
  key: string;
  value: string;
  payload: string;
};
