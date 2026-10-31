# 05 — Pricing, time and range rules as pure functions

Needs: 01. Produces: `apps/web/src/lib/booking/` with pure, fully tested functions used by every API route. No I/O in this folder. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/BOOKING-RULES.md` (§1 to §4), `docs/ACCEPTANCE.md` (AC-01, AC-03, AC-14, AC-15) and `packages/db/migrations/0003_bookings_payments.sql` (`blocked_range_for`) first. **Write the tests first**, see them fail, then implement. Test names start with the AC id.

Create these files in `apps/web/src/lib/booking/` (pure TypeScript, no imports from `lib/server`, Sanity or Supabase):

1. `types.ts`: `BookingType = 'transfer' | 'hourly'`; `ErrorCode = 'invalid_request' | 'no_price' | 'unavailable' | 'payment_failed'`; `class BookingError extends Error { code: ErrorCode; field?: string; stringKey: UiStringKey; vars? }`.
2. `time.ts` (uses `@js-temporal/polyfill`):
   - `localToInstant(local: string /* YYYY-MM-DDTHH:mm */, timeZone: string): Date` — use `getPossibleInstantsFor`: none → throw `BookingError('invalid_request', field 'pickupLocal')`; one or two → the **first** (earlier).
   - `formatLocal(instant: Date, timeZone: string): string` → "Tue 1 Dec 2026, 10:00".
   - `toIsoWithOffset(instant: Date, timeZone: string): string` → "2026-12-01T10:00:00+02:00".
   - `assertLeadTime(pickup: Date, now: Date, minLeadMinutes: number): void` → `invalid_request` with `error.lead_time` and `{ hours }` (minutes / 60, rounded up) when `pickup < now + minLead`.
3. `range.ts`: `blockedRange(pickup: Date, durationMinutes: number, bufferMinutes: number): { start: Date; end: Date }` (real elapsed minutes, identical to SQL `blocked_range_for`).
4. `pricing.ts`:
   - `quoteTransfer(input: { zonePriceCents: number | null }): number` → base cents or `no_price`.
   - `quoteHourly(input: { rateCents: number | null; minHours: number; maxHours: number; hours: number }): number` → rate × hours; `no_price` when no rate; `invalid_request` with `error.hours_range` and `{min, max}` when hours is not an integer or outside min..max.
   - `totalWithExtras(baseCents: number, chosen: string[], extras: { code: string; priceCents: number; active: boolean }[]): { totalCents: number; lines: { code: string; cents: number }[] }` → duplicates removed; unknown or inactive code → `invalid_request` (field `extras`).
   - `formatEuro(cents: number): string` → "€ 70.00".
5. `validation.ts`: `zod` schemas `QuoteRequest`, `HoldRequest`, `BookingRequest`, `CancelRequest` exactly as the bodies in `docs/API.md` (strict: unknown keys rejected). A helper `rejectMoneyFields(body: unknown)` throws `invalid_request` if any key at any depth is `price`, `amount`, `total` or ends with `Cents`.

Tests (`*.test.ts` next to each file) must include at least:
- AC-14: `localToInstant('2027-03-28T03:30', 'Europe/Athens')` throws; `localToInstant('2026-10-25T03:30', 'Europe/Athens')` returns `2026-10-25T00:30:00Z` (the +03:00 occurrence); `localToInstant('2026-12-01T10:00', 'Europe/Athens')` returns `2026-12-01T08:00:00Z`; `blockedRange` across 25 Oct 2026 02:30 +03:00 for 180 minutes with 30 buffer spans exactly 4 hours.
- AC-15: pickup 119 minutes from now with lead 120 throws `error.lead_time`; 121 minutes passes; a past time throws.
- AC-03: hours 2 and 13 rejected with min 3 / max 12; 3 and 12 accepted; 3.5, 0, -1 rejected.
- AC-01: transfer price returned as given; hourly 4 × 6000 = 24000; extras add up; duplicates counted once; inactive `vip-security` rejected; `rejectMoneyFields({ customer: { amount: 1 } })` throws; `formatEuro(22000) === '€ 220.00'`.
- No price: `quoteTransfer({ zonePriceCents: null })` throws `no_price`.

Check (run and report pass/fail):
- `pnpm --filter @tem/web test -- src/lib/booking` passes; coverage of `lib/booking` ≥ 95 % lines.
- `lib/booking` imports nothing from `lib/server`, `@supabase/*`, `@sanity/*` (add an ESLint `no-restricted-imports` rule for the folder).

Commit: `feat(booking): pure pricing, time and range rules with tests`
