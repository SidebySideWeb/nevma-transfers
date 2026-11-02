import type { APIRoute } from 'astro';
import { handleShiftEnd } from '../../../../../lib/driver-api/handler';
import { preflight } from '../../../../../lib/driver-api/cors';

export const prerender = false;

export const OPTIONS: APIRoute = async ({ request }) => preflight(request);
export const POST: APIRoute = (ctx) => handleShiftEnd(ctx);
