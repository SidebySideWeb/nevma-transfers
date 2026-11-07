/**
 * Admin feature flags — re-export `@tem/features` (docs/FEATURES.md).
 * Prefer `features().drivers` / `notFoundUnless(features().drivers)` at call sites.
 */
import { features as featuresFn } from '@tem/features';

export {
  features,
  publicFeatures,
  notFoundUnless,
  filterAdminNav,
  ADMIN_NAV,
  type Features,
} from '@tem/features';

/** @deprecated Use `features().drivers`. Kept for a few tests and thin wrappers. */
export function isDriversEnabled(raw?: string | boolean | undefined): boolean {
  if (raw !== undefined) return raw === true || raw === 'true';
  return featuresFn().drivers;
}
