import type { APIRoute } from 'astro';
import { buildCalendarIcs, managePageView } from '../../../../lib/server/booking-manage';

export const prerender = false;

function siteHost(): string {
  const raw =
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    'http://localhost:4321';
  try {
    return new URL(raw).host;
  } catch {
    return 'localhost';
  }
}

export const GET: APIRoute = async ({ params }) => {
  const token = params.token ?? '';
  const view = await managePageView(token);
  if (view.kind !== 'ok') {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  }

  const ics = buildCalendarIcs({
    reference: view.reference,
    siteHost: siteHost(),
    pickupAt: view.pickupAt,
    durationMinutes: view.durationMinutes,
    pickupAddress: view.pickupAddress,
    officePhone: view.officePhone,
    summary: `Elite Protection · ${view.reference}`,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${view.reference}.ics"`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
};
