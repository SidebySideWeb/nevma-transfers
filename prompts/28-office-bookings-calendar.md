# 28 — Office bookings, fleet calendar, customers, brand dropdowns

> Already done if you ran design/admin/PROMPT-2-office-bookings-calendar.md from the admin update: skip this prompt.

Needs: kit 1 prompts 04, 06–08, 11 (database, booking API, Viva, emails, admin); the admin design prompt (26) first or together. Produces: migration 0011 applied, `POST /api/internal/bookings` and `/api/internal/payments`, admin pages `/bookings/new` and `/calendar`, the offline payment dialog, the customer lookup, and the brand dropdown on every admin select. ~4 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/OFFICE-BOOKINGS.md` (all of it), `docs/DESIGN-ADMIN.md`, `packages/db/migrations/0011_office_bookings_calendar.sql` and `packages/db/tests/office.test.mjs`, and open `design/admin/new-booking.html`, `calendar.html`, `calendar-week.html`, `booking-dialogs.html` (offline payment) and `components.html` (Dropdowns) first. Tests first. The admin still never uses the service role.

1. Database: sync `0011_office_bookings_calendar.sql` into `supabase/migrations/` as in prompt 04, run the db tests, `supabase db push` (development first), regenerate types (`bookings.source|created_by|list_price_cents|price_override_reason|payment_method|customer_id`, `payments.method|note`, `customers`, `calendar_items`, `create_office_hold`, `class_free_by_hour`). Add the three `email.paymentLink.*` strings from `docs/OFFICE-BOOKINGS.md` to the Studio defaults and the seed.
2. Web app (`apps/web`): `POST /api/internal/bookings` and `POST /api/internal/payments` with the existing signing and idempotency helpers, implementing `docs/OFFICE-BOOKINGS.md` §1 rules 1–11. Reuse the pricing, availability, Athens-time and Viva order code of `POST /api/bookings` by extracting shared functions; do not copy them. Check Viva's maximum order timeout in the Viva docs and cap the hold to it. Payment-link e-mail template.
3. Admin — brand dropdown: a `Select` component (select-only combobox exactly as `design/admin/admin.js` `enhanceSelect` and the CSS `.ep-select*`): button `role="combobox"`, `role="listbox"` list, `aria-activedescendant`, arrows, Home/End, type-ahead, Enter/Space, Escape/Tab, click outside, optional option meta, disabled options, hidden native `<select>` kept for form posts and no-JS. Replace every `<select>` in the admin with it.
4. Admin — `/bookings/new` (`new-booking.html`): customer lookup (combobox on an input; server action searching `customers` by name, e-mail or phone, top 8, debounced 250 ms; picking fills name, e-mail, phone and invoice details), trip (transfer/hourly), class with free count and list price per class for the chosen time (server action using `class_availability` and the price list), optional vehicle (only free vehicles of the class), extras, payment choice (link / paid offline / to collect) with offline method, "e-mail the customer" (default on), office notes, price override switch with required reason, sticky summary; the submit label follows the payment choice. Prefill from `?vehicle=&at=` (calendar). Posts to `/api/internal/bookings`; on success go to the booking page with a toast; errors stay on the page next to the field.
5. Admin — booking page: "Office" flag and "Added by {staff} · {method}" line for office bookings; **Record offline payment…** dialog for `offline_collect` bookings (posts to `/api/internal/payments`); offline refunds recorded without Viva (dialog text says so).
6. Admin — `/calendar` (`calendar.html`, `calendar-week.html`): implement `docs/OFFICE-BOOKINGS.md` §2. Server-render the grid from `calendar_items` and `class_free_by_hour`; positions from minutes since Athens midnight (handle the DST days: 23 or 25 hours); popover for empty time; "now" line on today; nav item "Fleet calendar" and a "New booking" action on Bookings and Calendar.
7. Bookings list: "Office" flag and a Source filter (All, Online, Office).

Tests:
- db: `office.test.mjs` passes (office price override, offline payments, office holds, calendar items and RLS, free per hour, customers link and rights).
- Vitest (web): internal booking route rejects unsigned or stale requests, requires a reason for an override, never trusts a client price, creates link / offline-paid / to-collect bookings with the right status, payment status and payments rows; repeated idempotency key returns the first result.
- Vitest (admin): `Select` keyboard behaviour (open, move, type-ahead, pick, Escape) and that the hidden native select value changes; calendar position helper for 25 Oct 2026 (25-hour day).
- Playwright: create an office booking paid offline from the calendar's empty-time popover → it appears on the calendar on the chosen vehicle and in the bookings list with the Office flag; create one with a payment link → pending, held, e-mail sent (Resend test mode); record an offline payment on a to-collect booking; axe on the new pages at 390/1024/1440 px; the dropdown is operable by keyboard only.

Check (run and report pass/fail):
- All tests, `pnpm lint`, `pnpm typecheck` pass.
- A phone booking for a busy hour shows "0 free" for that class and cannot be created; the calendar class row shows 0 for that hour.
- No service role key in the admin build (AC-24).

Commit: `feat(admin): office bookings, fleet calendar, customers, brand dropdowns`
