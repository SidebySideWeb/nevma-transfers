import 'server-only';
import { Resend } from 'resend';

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  tag: string;
  /** Logged on failure only - never put in the email body by this helper. */
  reference?: string;
  replyTo?: string;
};

export type EmailTransport = (input: SendEmailInput) => Promise<{ ok: boolean; status?: number }>;

let transport: EmailTransport | null = null;

export function setEmailTransport(fn: EmailTransport | null): void {
  transport = fn;
}

function defaultTransport(): EmailTransport {
  return async (input) => {
    const key = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
    const from = import.meta.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
    if (!key || !from) {
      return { ok: false, status: 500 };
    }
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      tags: [{ name: 'kind', value: input.tag }],
    });
    if (result.error) {
      const status = typeof result.error.statusCode === 'number' ? result.error.statusCode : 500;
      return { ok: false, status };
    }
    return { ok: true, status: 200 };
  };
}

async function attempt(input: SendEmailInput): Promise<{ ok: boolean; status?: number }> {
  const send = transport ?? defaultTransport();
  return send(input);
}

/**
 * Send via Resend. Retries once on 5xx. Failures are logged with the booking
 * reference and never thrown (payment flow must not roll back).
 */
export async function sendEmailResult(
  input: SendEmailInput,
): Promise<{ ok: boolean; status?: number }> {
  try {
    const first = await attempt(input);
    if (first.ok) return first;
    if (first.status != null && first.status >= 500) {
      const second = await attempt(input);
      if (second.ok) return second;
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'email_failed',
          tag: input.tag,
          reference: input.reference ?? null,
          status: second.status ?? first.status,
        }),
      );
      return second;
    }
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'email_failed',
        tag: input.tag,
        reference: input.reference ?? null,
        status: first.status ?? null,
      }),
    );
    return first;
  } catch {
    try {
      const second = await attempt(input);
      if (second.ok) return second;
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'email_failed',
          tag: input.tag,
          reference: input.reference ?? null,
          status: second.status ?? null,
        }),
      );
      return second;
    } catch {
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'email_failed',
          tag: input.tag,
          reference: input.reference ?? null,
        }),
      );
      return { ok: false };
    }
  }
}

/** Send via Resend. Failures are logged and never thrown. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sendEmailResult(input);
}
