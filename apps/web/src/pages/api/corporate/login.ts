import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { corporateOff, sendCorporateMagicLink } from '../../../lib/server/corporate';
import { fail, json } from '../../../lib/server/http';
import { getPublicEnv } from '../../../lib/env';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const body = (await request.json()) as { email?: string };
    const email = String(body.email || '').trim();
    if (!email.includes('@')) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'invalid_email',
      });
    }
    const site = getPublicEnv().PUBLIC_SITE_URL.replace(/\/$/, '');
    await sendCorporateMagicLink(email, `${site}/business/app`);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
};
