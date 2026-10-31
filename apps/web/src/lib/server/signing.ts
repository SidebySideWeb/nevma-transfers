import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';

const MAX_SKEW_SEC = 5 * 60;

function secret(): string {
  const s = import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET || process.env.ADMIN_TO_WEB_SIGNING_SECRET;
  if (!s) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'signing_not_configured',
    });
  }
  return s;
}

/** Pure HMAC used by admin ↔ web; keep in sync with apps/admin `signPayload`. */
export function signWithSecret(secretValue: string, body: string, timestamp: number | string): string {
  return createHmac('sha256', secretValue).update(`${timestamp}.${body}`).digest('hex');
}

export function sign(body: string, timestamp: number | string): string {
  return signWithSecret(secret(), body, timestamp);
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type VerifiedInternal = {
  staffUserId: string;
  rawBody: string;
};

/** Verify HMAC + timestamp + staff membership. Throws BookingError → 401. */
export async function verifySignature(req: Request): Promise<VerifiedInternal> {
  const rawBody = await req.text();
  const tsHeader = req.headers.get('x-tem-timestamp');
  const sigHeader = req.headers.get('x-tem-signature');
  const staff = req.headers.get('x-tem-staff');

  if (!tsHeader || !sigHeader || !staff) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'missing_signature_headers',
    });
  }

  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SEC) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'timestamp_skew',
    });
  }

  const expected = sign(rawBody, ts);
  if (!safeEqualHex(expected, sigHeader)) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'bad_signature',
    });
  }

  const { rows } = await bookingDb().query<{ user_id: string }>(
    `select user_id::text from public.staff where user_id = $1::uuid`,
    [staff],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'not_staff',
    });
  }

  return { staffUserId: staff, rawBody };
}
