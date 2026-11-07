import type { APIRoute } from 'astro';
import {
  cancelCompanyBooking,
  corporateOff,
  failMember,
  requireMember,
} from '../../../../../lib/server/corporate';
import { json } from '../../../../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    return json(await cancelCompanyBooking(member, String(params.ref ?? '')));
  } catch (e) {
    return failMember(e);
  }
};
