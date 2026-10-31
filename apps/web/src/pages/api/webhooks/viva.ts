import type { APIRoute } from 'astro';
import { fail, json } from '../../../lib/server/http';
import { handleVivaGet, handleVivaPost } from '../../../lib/server/webhook-viva';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    return json(await handleVivaGet());
  } catch (e) {
    return fail(e);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    await handleVivaPost(body);
    return json({ ok: true }, 200);
  } catch {
    // Always 200 so Viva does not retry forever on our bugs after we logged.
    console.error(JSON.stringify({ level: 'error', code: 'viva_webhook_handler' }));
    return json({ ok: true }, 200);
  }
};
