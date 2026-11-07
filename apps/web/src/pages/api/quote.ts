import type { APIRoute } from 'astro';
import { features } from '@tem/features';
import { quote } from '../../lib/server/booking-service';
import { loadCompanyPriceMap, memberFromRequest } from '../../lib/server/corporate';
import { bookingDb } from '../../lib/server/db';
import { fail, json } from '../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = await request.json();
    let company: { id: string; prices: Record<string, number>; discountPct: number } | null = null;
    if (features().corporate) {
      const member = await memberFromRequest(request);
      if (member) {
        const fromZone = typeof body?.fromZone === 'string' ? body.fromZone : null;
        const toZone = typeof body?.toZone === 'string' ? body.toZone : null;
        const bookingType = body?.type === 'hourly' ? 'hourly' : 'transfer';
        let fromZoneId: string | null = null;
        let toZoneId: string | null = null;
        if (bookingType === 'transfer' && fromZone && toZone) {
          const { rows } = await bookingDb().query<{ id: string; code: string }>(
            `select id, code from public.zones where code = any($1::text[]) and active`,
            [[fromZone, toZone]],
          );
          fromZoneId = rows.find((r) => r.code === fromZone)?.id ?? null;
          toZoneId = rows.find((r) => r.code === toZone)?.id ?? null;
        }
        const prices = await loadCompanyPriceMap({
          companyId: member.companyId,
          bookingType,
          fromZoneId,
          toZoneId,
        });
        company = {
          id: member.companyId,
          prices,
          discountPct: member.discountPct,
        };
      }
    }
    const data = await quote(body, clientAddress, { company });
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
