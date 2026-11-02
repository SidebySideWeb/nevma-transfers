import { formatEuro } from './money';

export function statementStatusBadge(status: string | null | undefined): { cls: string; text: string } {
  if (status === 'paid') return { cls: 's-confirmed', text: 'Paid' };
  if (status === 'approved') return { cls: 's-assigned', text: 'Approved' };
  if (status === 'draft') return { cls: 's-pending', text: 'Draft' };
  return { cls: 'plain', text: '—' };
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    salary: 'Salary',
    day: 'Day',
    hours: 'Hours',
    percent: 'Percent',
    transfer: 'Transfer',
    adjustment: 'Adjustment',
    tip: 'Tip',
    waiting: 'Waiting',
    expense: 'Expense',
    bonus: 'Bonus',
    deduction: 'Deduction',
    advance: 'Advance',
  };
  return map[kind] ?? kind;
}

export function formatPeriodRange(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  if (from === to) return a.toLocaleDateString('en-GB', opts);
  const sameMonth = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  if (sameMonth) {
    return `${a.getUTCDate()}–${b.toLocaleDateString('en-GB', opts)}`;
  }
  return `${a.toLocaleDateString('en-GB', opts)} – ${b.toLocaleDateString('en-GB', opts)}`;
}

export function formatSignedEuro(cents: number): string {
  if (cents < 0) return `− ${formatEuro(-cents)}`;
  return formatEuro(cents);
}

export function eurosNumber(cents: number): number {
  return cents / 100;
}
