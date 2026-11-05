/** Drivers / dispatch module switch (`FEATURE_DRIVERS`). Default off. */

import { isDriversEnabled } from './features';

/** @deprecated Prefer `isDriversEnabled` from `./features`. Kept for call-site compatibility. */
export function driversEnabled(raw?: string | boolean | undefined): boolean {
  return isDriversEnabled(raw);
}

/** Return a 404 Response when the module is off (pages and API routes). */
export function driversNotFound(): Response | null {
  if (isDriversEnabled()) return null;
  return new Response(null, { status: 404, statusText: 'Not Found' });
}
