/**
 * Feature flags for the admin app.
 * Drivers / dispatch is for other deployments; Elite leaves FEATURE_DRIVERS unset or false.
 */

/** True only when FEATURE_DRIVERS is the exact string `"true"` (or boolean true in tests). */
export function isDriversEnabled(raw?: string | boolean | undefined): boolean {
  const v = raw ?? import.meta.env.FEATURE_DRIVERS ?? process.env.FEATURE_DRIVERS;
  return v === true || v === 'true';
}
