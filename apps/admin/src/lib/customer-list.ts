/** Safe search / sort / CSV helpers for the admin customers list. */

export const CUSTOMER_PAGE_SIZE = 50;

export type CustomerSort = 'last' | 'name' | 'bookings' | 'paid';

export type CustomerSummaryRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  bookings_count: number;
  last_pickup_at: string | null;
  has_vip_security: boolean;
  paid_cents: number;
};

/** Escape ILIKE wildcards so user input cannot broaden the match. */
export function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Build a PostgREST `or` filter for name/email/phone/company.
 * Strips filter-breaking characters; escapes `%` and `_`. Returns null when too short.
 */
export function buildCustomerSearchOr(rawQuery: string): string | null {
  // Strip characters that break PostgREST `or` filter syntax (* is the PostgREST wildcard).
  // ILIKE wildcards % and _ are escaped, not stripped, so they match literally.
  // Semicolons are removed so the value cannot look like a second statement.
  const cleaned = rawQuery
    .replace(/[*,()\\"';]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2) return null;
  const pattern = `*${escapeIlike(cleaned)}*`;
  return `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company.ilike.${pattern}`;
}

export function parseCustomerSort(raw: string | null | undefined): CustomerSort {
  if (raw === 'name' || raw === 'bookings' || raw === 'paid') return raw;
  return 'last';
}

export function customerSortColumn(sort: CustomerSort): {
  column: 'last_pickup_at' | 'name' | 'bookings_count' | 'paid_cents';
  ascending: boolean;
} {
  switch (sort) {
    case 'name':
      return { column: 'name', ascending: true };
    case 'bookings':
      return { column: 'bookings_count', ascending: false };
    case 'paid':
      return { column: 'paid_cents', ascending: false };
    default:
      return { column: 'last_pickup_at', ascending: false };
  }
}

const CSV_HEADERS = [
  'name',
  'email',
  'phone',
  'company',
  'bookings_count',
  'last_pickup_at',
  'paid_cents',
  'has_vip_security',
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV of the current filter. Never includes notes. */
export function customersToCsv(rows: CustomerSummaryRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.company),
        csvCell(r.bookings_count),
        csvCell(r.last_pickup_at),
        csvCell(r.paid_cents),
        csvCell(r.has_vip_security),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function csvHasNotesColumn(csv: string): boolean {
  const header = csv.split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  return /(^|,)notes(,|$)/.test(header);
}
