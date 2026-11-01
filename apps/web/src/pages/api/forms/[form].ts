import type { APIRoute } from 'astro';
import { FORM_FLASH_COOKIE, formPagePath, signFormFlash } from '../../../lib/forms/form-cookie';
import { submitForm } from '../../../lib/server/form-service';
import { json } from '../../../lib/server/http';

export const prerender = false;

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await request.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return {};
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') || '';
  return accept.includes('application/json');
}

export const POST: APIRoute = async ({ params, request, clientAddress, cookies }) => {
  const formKey = params.form || '';
  let body: Record<string, unknown> = {};
  try {
    body = await parseBody(request);
  } catch {
    if (wantsJson(request)) {
      return json({ error: 'invalid_request', message: 'Invalid body' }, 400);
    }
    return new Response(null, { status: 400 });
  }

  const result = await submitForm(formKey, body, { ip: clientAddress });

  if (result.ok) {
    if (wantsJson(request)) {
      return json({ ok: true, redirect: result.redirect });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: result.redirect || `/thank-you/${formKey}` },
    });
  }

  if (result.status === 404) {
    return wantsJson(request)
      ? json({ error: result.error, message: result.message }, 404)
      : new Response(null, { status: 404 });
  }

  if (result.status === 429) {
    return wantsJson(request)
      ? json({ error: result.error, message: result.message }, 429)
      : new Response(null, { status: 429 });
  }

  if (result.status === 500) {
    return wantsJson(request)
      ? json({ error: result.error, message: result.message }, 500)
      : new Response(null, {
          status: 303,
          headers: { Location: formPagePath(formKey) },
        });
  }

  // Validation / Turnstile failure
  if (wantsJson(request)) {
    return json(
      {
        error: result.error || 'invalid_request',
        message: result.message,
        fields: result.fields,
      },
      400,
    );
  }

  const flash = signFormFlash({
    form: formKey,
    values: result.flashValues || {},
    fields: result.fields || {},
  });
  cookies.set(FORM_FLASH_COOKIE, flash, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 10 * 60,
  });
  return new Response(null, {
    status: 303,
    headers: { Location: formPagePath(formKey) },
  });
};
