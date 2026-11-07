import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { corporateOff, requireMember } from '../../../lib/server/corporate';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const m = await requireMember(request);
    return json({
      companyId: m.companyId,
      companyName: m.companyName,
      email: m.email,
      role: m.role,
      payOnAccount: m.payOnAccount,
      creditLimitCents: m.creditLimitCents,
      discountPct: m.discountPct,
    });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'unauthorized') return fail(e, 401);
    return fail(e);
  }
};
