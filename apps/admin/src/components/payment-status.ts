export const PAYMENT_STATUSES = [
  'unpaid',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const WORDS: Record<PaymentStatus, string> = {
  unpaid: 'Pending',
  paid: 'Paid',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  failed: 'Failed',
};

const CLASS: Record<PaymentStatus, string> = {
  unpaid: 's-pending',
  paid: 's-confirmed',
  partially_refunded: 's-info',
  refunded: 's-completed',
  failed: 's-cancelled',
};

export function isPaymentStatus(raw: string): raw is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(raw);
}

export function paymentStatusClass(status: PaymentStatus): string {
  return CLASS[status];
}

export function paymentStatusWord(status: PaymentStatus): string {
  return WORDS[status];
}
