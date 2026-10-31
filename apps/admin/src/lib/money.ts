/** Parse a euro string from an admin form into integer cents. Rejects >2 decimal places. */
export function eurosToCents(input: string): number {
  const raw = input.trim().replace(',', '.');
  if (raw === '') {
    throw new Error('empty');
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('invalid_euros');
  }
  const [whole, frac = ''] = raw.split('.');
  const sign = whole!.startsWith('-') ? -1 : 1;
  const absWhole = whole!.replace('-', '');
  const cents = sign * (Number(absWhole) * 100 + Number(frac.padEnd(2, '0')));
  if (!Number.isInteger(cents) || !Number.isFinite(cents)) {
    throw new Error('invalid_euros');
  }
  return cents;
}

/** Optional field: empty → null (delete price row). */
export function optionalEurosToCents(input: string): number | null {
  if (input.trim() === '') return null;
  return eurosToCents(input);
}

export function formatEuro(cents: number): string {
  const euros = (cents / 100).toFixed(2);
  return `€ ${euros}`;
}

export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
