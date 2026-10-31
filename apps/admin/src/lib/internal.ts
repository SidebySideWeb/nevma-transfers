import { signWithEnv } from './signing';

function siteUrl(): string {
  return (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

async function postInternal(
  path: '/api/internal/cancel' | '/api/internal/refund',
  body: unknown,
  staffUserId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string; status: number }> {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWithEnv(rawBody, timestamp);
  const res = await fetch(`${siteUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tem-timestamp': String(timestamp),
      'x-tem-signature': signature,
      'x-tem-staff': staffUserId,
    },
    body: rawBody,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: (data as { message?: string }).message || `HTTP ${res.status}`,
    };
  }
  return { ok: true, data };
}

export async function callInternalCancel(
  body: {
    reference: string;
    refund: 'full' | 'none' | { amountCents: number };
    reason: string;
    idempotencyKey: string;
  },
  staffUserId: string,
) {
  return postInternal('/api/internal/cancel', body, staffUserId);
}

export async function callInternalRefund(
  body: {
    reference: string;
    amountCents: number;
    reason: string;
    idempotencyKey: string;
  },
  staffUserId: string,
) {
  return postInternal('/api/internal/refund', body, staffUserId);
}
