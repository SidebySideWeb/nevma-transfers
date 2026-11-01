import { createHmac, timingSafeEqual } from 'node:crypto';

export const FORM_FLASH_COOKIE = 'tem_form_flash';
const MAX_AGE_SEC = 10 * 60;

export type FormFlash = {
  form: string;
  values: Record<string, string>;
  fields: Record<string, string>;
  exp: number;
};

function secret(): string {
  return (
    import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET ||
    process.env.ADMIN_TO_WEB_SIGNING_SECRET ||
    'dev-form-flash'
  );
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signFormFlash(flash: Omit<FormFlash, 'exp'> & { exp?: number }): string {
  const payload: FormFlash = {
    ...flash,
    exp: flash.exp ?? Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function readFormFlash(raw: string | undefined | null): FormFlash | null {
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as FormFlash;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function formPagePath(form: string): string {
  if (form === 'transfer-request') return '/request-a-transfer';
  if (form === 'vip-security') return '/vip-security';
  if (form === 'contact') return '/contact';
  return '/';
}
