import { randomUUID } from 'node:crypto';

export type DriverApiErrorBody = { error: string; message: string };

const CODE_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_a_driver: 403,
  forbidden: 403,
  already_on_shift: 409,
  vehicle_in_use: 409,
  no_shift: 409,
  invalid_transition: 409,
  vehicle_unavailable: 422,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
};

const PREFIX_RE =
  /\b(already_on_shift|vehicle_in_use|vehicle_unavailable|no_shift|invalid_transition|forbidden|not_found|invalid_request|unauthorized|not_a_driver|rate_limited):\s*([^\n]+)/i;

export function jsonError(
  status: number,
  error: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify({ error, message } satisfies DriverApiErrorBody), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function unauthorized(headers?: HeadersInit): Response {
  return jsonError(401, 'unauthorized', 'Sign in again.', headers);
}

export function notADriver(headers?: HeadersInit): Response {
  return jsonError(403, 'not_a_driver', 'This account is not an active driver.', headers);
}

export function rateLimited(headers?: HeadersInit): Response {
  return jsonError(429, 'rate_limited', 'Too many requests. Try again in a minute.', headers);
}

export function mapDbErrorToResponse(
  err: { message?: string; code?: string } | null | undefined,
  headers?: HeadersInit,
): Response {
  const message = String(err?.message ?? '');
  const m = message.match(PREFIX_RE);
  if (m?.[1] && m[2]) {
    const code = m[1].toLowerCase();
    const status = CODE_STATUS[code] ?? 500;
    return jsonError(status, code, m[2].trim(), headers);
  }
  if (/^forbidden\b/i.test(message.trim())) {
    return jsonError(403, 'forbidden', 'You are not allowed to do that.', headers);
  }
  const requestId = randomUUID();
  console.error(`[driver-api] ${requestId} unexpected`, { code: err?.code });
  return jsonError(500, 'server_error', 'Something went wrong. Try again.', headers);
}
