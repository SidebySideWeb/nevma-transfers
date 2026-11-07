import type { APIRoute } from 'astro';
import { features, notFoundUnless } from '@tem/features';
import { BookingError } from '../../../lib/booking/types';
import { lookupFlight } from '../../../lib/server/flight-tracking';
import { fail, json } from '../../../lib/server/http';
import { assertRateLimit } from '../../../lib/server/rate-limit';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const off = notFoundUnless(features().flightTracking);
  if (off) return off;
  try {
    const visitorKey = getOrSetVisitorKey(cookies);
    if (clientAddress) await assertRateLimit(`flight-lookup:ip:${clientAddress}`, 60, 20);
    await assertRateLimit(`flight-lookup:vid:${visitorKey}`, 60, 20);

    const body = (await request.json()) as { number?: string; date?: string };
    const result = await lookupFlight({
      number: String(body.number || ''),
      date: String(body.date || ''),
    });
    return json({
      found: result.found,
      airline: result.airline ?? null,
      origin: result.origin ?? null,
      schedArr: result.schedArr ?? null,
      eta: result.eta ?? null,
      status: result.status ?? null,
      terminal: result.terminal ?? null,
      suggestedPickupAt: result.suggestedPickupAt ?? null,
      warning: result.warning ?? null,
    });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'rate_limit') {
      return fail(e, 429);
    }
    return fail(e);
  }
};
