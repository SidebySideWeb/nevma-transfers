import 'server-only';

/** Address autocomplete (docs/ADDRESS-AUTOCOMPLETE.md). Off unless flag + key. */
export function placesEnabled(): boolean {
  const flag = import.meta.env.PUBLIC_ADDRESS_AUTOCOMPLETE ?? process.env.PUBLIC_ADDRESS_AUTOCOMPLETE;
  const key = import.meta.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
  return flag === 'true' && typeof key === 'string' && key.length > 0;
}

export function placesApiKey(): string {
  return (import.meta.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY ?? '') as string;
}

export function placesBias() {
  const lat = Number(import.meta.env.PLACES_BIAS_LAT ?? process.env.PLACES_BIAS_LAT ?? 37.9838);
  const lng = Number(import.meta.env.PLACES_BIAS_LNG ?? process.env.PLACES_BIAS_LNG ?? 23.7275);
  const radiusM = Number(
    import.meta.env.PLACES_BIAS_RADIUS_M ?? process.env.PLACES_BIAS_RADIUS_M ?? 50000,
  );
  return { lat, lng, radiusM };
}

/** Same-origin: Origin must match PUBLIC_SITE_URL (or be absent for same-site navigations). */
export function assertSameOrigin(request: Request, allowedOrigin: string): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = allowedOrigin.replace(/\/$/, '');
  if (origin.replace(/\/$/, '') !== allowed) {
    const err = new Error('cross_origin');
    (err as Error & { code: string }).code = 'cross_origin';
    throw err;
  }
}
