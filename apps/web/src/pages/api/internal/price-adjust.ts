import type { APIRoute } from 'astro';
import { fail, json } from '../../../lib/server/http';
import { internalPriceAdjust } from '../../../lib/server/price-adjust';
import { verifySignature } from '../../../lib/server/signing';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { rawBody } = await verifySignature(request);
    const body = JSON.parse(rawBody) as unknown;
    const data = await internalPriceAdjust(body);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
