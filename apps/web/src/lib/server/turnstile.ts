import 'server-only';

export type TurnstileVerifier = (token: string, ip: string | undefined) => Promise<boolean>;

let verifier: TurnstileVerifier = defaultVerify;

export function setTurnstileVerifier(fn: TurnstileVerifier): void {
  verifier = fn;
}

export function resetTurnstileVerifier(): void {
  verifier = defaultVerify;
}

async function defaultVerify(token: string, ip: string | undefined): Promise<boolean> {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  // Cloudflare dummy secret - always pass (local / Playwright).
  if (secret === '1x0000000000000000000000000000000AA') return true;
  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!data.success) {
    // No token/secret — only Cloudflare's error codes (e.g. hostname-mismatch).
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'turnstile_verify_failed',
        errorCodes: data['error-codes'] ?? [],
      }),
    );
    return false;
  }
  return true;
}

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  return verifier(token, ip);
}
