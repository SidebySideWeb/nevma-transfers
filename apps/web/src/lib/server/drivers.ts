import 'server-only';

/** Drivers / dispatch module switch (`FEATURE_DRIVERS`). Default off. */

export function driversEnabled(raw?: string | boolean | undefined): boolean {
  const v = raw ?? import.meta.env.FEATURE_DRIVERS ?? process.env.FEATURE_DRIVERS;
  return v === true || v === 'true';
}

/** Return a 404 Response when the module is off (API routes added by the drivers kit). */
export function driversNotFound(): Response | null {
  if (driversEnabled()) return null;
  return new Response(null, { status: 404, statusText: 'Not Found' });
}
