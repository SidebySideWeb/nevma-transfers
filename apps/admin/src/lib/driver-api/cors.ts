/** CORS for the drivers' web app origin only. */

export function driverAppOrigin(): string {
  return (import.meta.env.DRIVER_APP_ORIGIN ?? process.env.DRIVER_APP_ORIGIN ?? '').replace(/\/$/, '');
}

export function corsHeaders(request: Request): Headers {
  const h = new Headers();
  const origin = request.headers.get('Origin');
  const allowed = driverAppOrigin();
  if (origin && allowed && origin === allowed) {
    h.set('Access-Control-Allow-Origin', allowed);
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    h.set('Vary', 'Origin');
  }
  return h;
}

export function mergeCors(response: Response, request: Request): Response {
  const cors = corsHeaders(request);
  const headers = new Headers(response.headers);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function preflight(request: Request): Response {
  const cors = corsHeaders(request);
  return new Response(null, { status: 204, headers: cors });
}
