import { formatEuro } from '../lib/money';

/** Confirm button text: action name + formatted amount (e.g. "Refund € 10.00"). */
export function confirmActionLabel(action: string, amountCents: number): string {
  return `${action} ${formatEuro(amountCents)}`;
}
