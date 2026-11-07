import type { APIRoute } from 'astro';
import { BookingError } from '../../../../lib/booking/types';
import { internalCompanyStatementPaid } from '../../../../lib/server/company-admin';
import { corporateOff } from '../../../../lib/server/corporate';
import { fail, json } from '../../../../lib/server/http';
import { verifySignature } from '../../../../lib/server/signing';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const { staffUserId, rawBody } = await verifySignature(request);
    const data = await internalCompanyStatementPaid(JSON.parse(rawBody) as unknown, staffUserId);
    return json(data);
  } catch (e) {
    if (e instanceof BookingError) {
      const auth =
        e.message === 'bad_signature' ||
        e.message === 'timestamp_skew' ||
        e.message === 'not_staff' ||
        e.message === 'missing_signature_headers';
      return fail(e, auth ? 401 : undefined);
    }
    return fail(e);
  }
};
