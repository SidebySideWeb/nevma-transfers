import 'server-only';
import {
  sendCancellationEmails,
  sendConfirmationEmails,
  sendLateRefundEmails,
} from './booking-emails';

export type ConfirmedOpts = {
  siblingTokens?: { reference: string; token: string }[];
};

export type ConfirmedHook = (
  reference: string,
  cancelToken: string,
  opts?: ConfirmedOpts,
) => void | Promise<void>;
export type LateRefundHook = (reference: string) => void | Promise<void>;
export type CancelledHook = (reference: string, refundCents: number) => void | Promise<void>;

let onConfirmed: ConfirmedHook = async (reference, cancelToken, opts) => {
  await sendConfirmationEmails(reference, cancelToken, { siblingTokens: opts?.siblingTokens });
};

let onLateRefund: LateRefundHook = async (reference) => {
  await sendLateRefundEmails(reference);
};

let onCancelled: CancelledHook = async (reference, refundCents) => {
  await sendCancellationEmails(reference, refundCents);
};

const confirmedCalls: string[] = [];

export function getConfirmedCalls(): string[] {
  return [...confirmedCalls];
}

export function clearConfirmedCalls(): void {
  confirmedCalls.length = 0;
}

export function setOnConfirmed(fn: ConfirmedHook): void {
  onConfirmed = fn;
}

export function setOnLateRefund(fn: LateRefundHook): void {
  onLateRefund = fn;
}

export function setOnCancelled(fn: CancelledHook): void {
  onCancelled = fn;
}

export function resetEmailHooks(): void {
  onConfirmed = async (reference, cancelToken, opts) => {
    await sendConfirmationEmails(reference, cancelToken, { siblingTokens: opts?.siblingTokens });
  };
  onLateRefund = async (reference) => {
    await sendLateRefundEmails(reference);
  };
  onCancelled = async (reference, refundCents) => {
    await sendCancellationEmails(reference, refundCents);
  };
}

export async function fireOnConfirmed(
  reference: string,
  cancelToken: string,
  opts?: ConfirmedOpts,
): Promise<void> {
  confirmedCalls.push(reference);
  try {
    await onConfirmed(reference, cancelToken, opts);
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 180) : 'unknown';
    console.error(JSON.stringify({ level: 'error', code: 'on_confirmed_failed', reference, detail }));
  }
}

export async function fireOnLateRefund(reference: string): Promise<void> {
  try {
    await onLateRefund(reference);
  } catch {
    console.error(JSON.stringify({ level: 'error', code: 'on_late_refund_failed', reference }));
  }
}

export async function fireOnCancelled(reference: string, refundCents: number): Promise<void> {
  try {
    await onCancelled(reference, refundCents);
  } catch {
    console.error(JSON.stringify({ level: 'error', code: 'on_cancelled_failed', reference }));
  }
}
