import 'server-only';

/** Placeholder until prompt 08 wires Resend. Logs reference only. */
export type ConfirmedHook = (reference: string) => void | Promise<void>;
export type LateRefundHook = (reference: string) => void | Promise<void>;

let onConfirmed: ConfirmedHook = async (reference) => {
  console.error(JSON.stringify({ level: 'info', code: 'on_confirmed', reference }));
};

let onLateRefund: LateRefundHook = async (reference) => {
  console.error(JSON.stringify({ level: 'info', code: 'on_late_refund', reference }));
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

export async function fireOnConfirmed(reference: string): Promise<void> {
  confirmedCalls.push(reference);
  await onConfirmed(reference);
}

export async function fireOnLateRefund(reference: string): Promise<void> {
  await onLateRefund(reference);
}
