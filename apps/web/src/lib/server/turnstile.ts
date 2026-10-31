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
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
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
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  return verifier(token, ip);
}
