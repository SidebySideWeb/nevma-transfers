import 'server-only';
import { BookingError, type ErrorCode } from '../booking/types';
import { t, type UiStringKey } from '../strings';

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  no_price: 404,
  unavailable: 409,
  payment_failed: 502,
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      date: new Date().toUTCString(),
      ...headers,
    },
  });
}

function statusFor(error: BookingError, httpOverride?: number): number {
  if (httpOverride != null) return httpOverride;
  if (error.message === 'rate_limit' || error.message === 'too_many_holds') return 429;
  return STATUS[error.code];
}

export function fail(error: BookingError | unknown, httpOverride?: number): Response {
  if (error instanceof BookingError) {
    const body: {
      error: ErrorCode;
      message: string;
      fields?: Record<string, string>;
      reference?: string;
    } = {
      error: error.code,
      message: t(error.stringKey, error.vars),
    };
    if (error.field) {
      body.fields = { [error.field]: body.message };
    }
    const ref = (error as BookingError & { reference?: string }).reference;
    if (ref) body.reference = ref;
    return json(body, statusFor(error, httpOverride));
  }

  const id = crypto.randomUUID().slice(0, 8);
  const detail =
    error instanceof Error
      ? error.message.slice(0, 180)
      : typeof error === 'string'
        ? error.slice(0, 180)
        : 'unknown';
  console.error(JSON.stringify({ level: 'error', id, code: 'unhandled', detail }));
  return json(
    {
      error: 'invalid_request' satisfies ErrorCode,
      message: t('error.invalid_request' satisfies UiStringKey),
    },
    500,
  );
}

export function failWithStatus(error: BookingError, status: number): Response {
  return fail(error, status);
}

export function mapPgBookingError(err: unknown): BookingError {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('unavailable')) {
    return new BookingError('unavailable', { stringKey: 'error.unavailable', message });
  }
  if (message.includes('no_price')) {
    return new BookingError('no_price', { stringKey: 'error.no_price', message });
  }
  if (message.includes('too_many_holds')) {
    return new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'too_many_holds',
    });
  }
  return new BookingError('invalid_request', {
    stringKey: 'error.invalid_request',
    message,
  });
}
