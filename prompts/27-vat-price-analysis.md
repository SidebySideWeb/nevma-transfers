# 27 — Final prices and VAT price analysis

Needs: kit 1 prompts 06–08 and 10 (pricing, booking API, emails, booking flow); prompt 25 if done (manage page). Produces: migration 0010 applied, final-price labels everywhere, the price analysis on the review step and in the confirmation email. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/BOOKING-RULES.md` §2 "VAT", `docs/DATA-MODEL.md` (0010), `docs/ACCEPTANCE.md` AC-37 and `packages/db/migrations/0010_vat.sql` first. Decision (1 Nov): every price the customer sees is final, VAT included; the VAT share appears only on the review step and in the confirmation email. Tests first.

1. Database: sync `0010_vat.sql` into `supabase/migrations/` as in prompt 04 and `supabase db push` (development first). Regenerate the Supabase types: `bookings.vat_rate_bp`, `bookings.vat_cents`. Do not set `vat_rate_bp` in `POST /api/bookings`; the trigger copies it from `settings`.
2. Labels: remove any "excl. VAT" wording; vehicle rows, extras, sticky summary and "from" prices show final prices; the summary shows `booking.priceNote`. The staff column grants stay unchanged (staff cannot edit VAT fields).
3. Review step: under the items, a "Price analysis" block (`booking.review.priceAnalysis`): each item at its final price, then `booking.review.net` (`price_cents − vat_cents`), `booking.review.vat` with `{rate}` = `vat_rate_bp / 100` formatted without trailing zeros, and `booking.review.totalInclVat` = `price_cents`. Values come from the created booking returned by the API (add `vatRateBp`, `vatCents` to its response); never compute VAT in the browser.
4. Confirmation email: the same block with `email.confirmation.priceAnalysis`, `.net`, `.vat`, `.total`, in the HTML and the text part. The manage page (prompt 25), if present, shows total paid only, plus the same analysis under a "Price analysis" disclosure.
5. Admin booking detail: in the Payment panel add two read-only lines under the items, "Price before VAT" and "VAT {rate}%", as on `design/admin/booking.html`.
6. Sanity: re-import the seed or add the new UI strings (`booking.priceNote`, `booking.review.*` VAT keys, `email.confirmation.priceAnalysis|net|vat|total`).

Tests:
- `pnpm --filter @tem/db test` (0010 test: € 220.00 → € 177.42 + € 42.58; rate change does not touch past bookings).
- Vitest: the email renders the analysis lines with the stored values and the rate `24`; a 13% booking renders `VAT 13%`.
- Playwright: review step shows the analysis and the totals add up; no page contains "excl." (search the built HTML).

Check (run and report pass/fail):
- Tests, `pnpm lint`, `pnpm typecheck` pass.
- One booking end to end in Viva test mode: Viva amount = total shown; email shows the analysis.
- `settings.vat_rate_bp` is still marked DEMO until the accountant confirms the rate (O18).

Commit: `feat(booking): final prices with VAT price analysis on review and email`
