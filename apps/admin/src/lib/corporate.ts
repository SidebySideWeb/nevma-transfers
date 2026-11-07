/** Corporate accounts (B9) module switch — via `@tem/features`. Default off. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { features, notFoundUnless } from '@tem/features';

/** True when FEATURE_CORPORATE resolves on (exact `"true"`). */
export function corporateEnabled(): boolean {
  return features().corporate;
}

/** Return a 404 Response when the module is off (pages and API routes). */
export function corporateNotFound(): Response | null {
  return notFoundUnless(features().corporate);
}

/**
 * Migration 0030 tables are not in the generated `database.types.ts` yet; use an untyped view
 * of the same session client for them.
 */
export function corporateDb(supabase: unknown): SupabaseClient {
  return supabase as SupabaseClient;
}

export type CompanyTab = 'details' | 'prices' | 'users' | 'bookings' | 'statements';
const TABS: CompanyTab[] = ['details', 'prices', 'users', 'bookings', 'statements'];

export function parseCompanyTab(value: string | null | undefined): CompanyTab {
  return TABS.includes(value as CompanyTab) ? (value as CompanyTab) : 'details';
}

/** RFC 4180 field; guards spreadsheet formula injection from guest-typed text. */
function csvField(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type StatementLine = {
  reference: string;
  pickup_at: string;
  guest_name: string | null;
  cost_center: string | null;
  price_cents: number;
};

const dayAthens = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(iso));
const euros = (cents: number) => (cents / 100).toFixed(2);

/** CSV of the on-account bookings in a statement period. Money in euros with two decimals. */
export function statementToCsv(lines: StatementLine[], totalCents: number): string {
  const rows = [
    ['Reference', 'Pickup date', 'Guest', 'Cost centre', 'Amount EUR'],
    ...lines.map((l) => [
      l.reference,
      dayAthens(l.pickup_at),
      l.guest_name ?? '',
      l.cost_center ?? '',
      euros(l.price_cents),
    ]),
    ['', '', '', 'Total', euros(totalCents)],
  ];
  return `${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}
