import type { APIRoute } from 'astro';
import { handleAdminAutocomplete, placesEnabled } from '../../../lib/places-api';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const prerender = false;

const NO_STORE = { 'cache-control': 'no-store' };

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (!placesEnabled()) return new Response(null, { status: 404, headers: NO_STORE });
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized', message: 'unauthorized' }), {
      status: 401,
      headers: { ...NO_STORE, 'content-type': 'application/json' },
    });
  }
  return handleAdminAutocomplete(request, supabase, user.id, clientAddress);
};
