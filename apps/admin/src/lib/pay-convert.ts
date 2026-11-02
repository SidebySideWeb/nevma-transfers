import { eurosToCents } from './money';

/** Percentage (e.g. 10 or 10.5) → basis points (1000 or 1050). Max 100%. */
export function percentToBp(input: string): number {
  const raw = input.trim().replace(',', '.');
  if (raw === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('invalid_percent');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('invalid_percent');
  return Math.round(n * 100);
}

export function bpToPercentInput(bp: number): string {
  const p = bp / 100;
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const NEGATIVE_KINDS = new Set(['deduction', 'advance']);

/** UI always enters a positive amount; store negative for deduction/advance. */
export function adjustmentAmountCents(kind: string, euros: string): number {
  const cents = Math.abs(eurosToCents(euros));
  if (cents === 0) throw new Error('invalid_euros');
  return NEGATIVE_KINDS.has(kind) ? -cents : cents;
}

/** Empty or blank → 0; otherwise euros → cents (for optional plan fields). */
export function eurosOrZero(input: string): number {
  if (input.trim() === '') return 0;
  const c = eurosToCents(input);
  if (c < 0) throw new Error('invalid_euros');
  return c;
}

/** The day before `validFrom` (ISO date). Ends the previous plan that day. */
export function endPreviousPlanOn(validFrom: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) throw new Error('invalid_date');
  const [y, m, d] = validFrom.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
