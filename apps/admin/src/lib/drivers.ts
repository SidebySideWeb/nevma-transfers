/** Drivers / dispatch module switch — via `@tem/features`. Default off. */

import { features, notFoundUnless } from '@tem/features';

/** True when FEATURE_DRIVERS resolves on (exact `"true"`). */
export function driversEnabled(): boolean {
  return features().drivers;
}

/** Return a 404 Response when the module is off (pages and API routes). */
export function driversNotFound(): Response | null {
  return notFoundUnless(features().drivers);
}
