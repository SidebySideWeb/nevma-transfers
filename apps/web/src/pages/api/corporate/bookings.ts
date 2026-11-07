import type { APIRoute } from 'astro';
import {
  corporateOff,
  failMember,
  listCompanyBookings,
  requireMember,
} from '../../../lib/server/corporate';
import { json } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    const when = url.searchParams.get('when');
    const bookings = await listCompanyBookings(member, {
      q: url.searchParams.get('q') ?? '',
      when: when === 'past' || when === 'all' ? when : 'upcoming',
    });
    return json({ bookings });
  } catch (e) {
    return failMember(e);
  }
};
