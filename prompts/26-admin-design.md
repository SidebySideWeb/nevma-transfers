# 26 — Admin design (Elite Protection)

> Already done if you ran design/admin/PROMPT-1-admin-design.md from the admin update: skip this prompt.

Needs: kit 1 prompt 11 (the admin exists and its tests pass); prompt 23 if kit 2 is applied (the "update the website" banner). Produces: the admin restyled to the Elite Protection admin design kit, plus the sign-in page, zones and settings screens in the same style. No behaviour change. ~1.5 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/DESIGN-ADMIN.md` and open `design/admin/index.html`, `components.html` and every board it links first. The boards are the visual target; `design/admin/admin.css` is the component layer. Do not change queries, actions, auth, signing or database rights: this prompt is presentation only. Keep the existing tests green and add the ones below first.

1. Styles: copy `design/tokens.css` to `apps/admin/src/styles/tokens.css` (it gained `--color-info`, `--color-danger-strong`, `--color-danger-text`, `--color-glow`) and `design/admin/admin.css` to `apps/admin/src/styles/admin.css`, dropping the "board chrome" block at the end. Replace any previous admin stylesheet rules. Self-host Jost (300, 400, 500, 600) and Playfair Display (500, 600, italic 500) as woff2 in `apps/admin/public/fonts` with `font-display: swap`; no Google Fonts request.
2. Layout: `AdminLayout.astro` = the shell on the boards: skip link, sidebar with the wordmark, grouped nav (Operations: Bookings with the count of confirmed unassigned bookings in the next 7 days, Blocked slots; Pricing: Zone prices, Hourly rates, Extras; Setup: Fleet, Zones, Settings), signed-in email and Sign out; below 1024 px a Menu button that toggles the nav (`aria-expanded`, `aria-controls`) with a few lines of inline script; page head with breadcrumbs, Playfair title and page actions; the banner slot (DEMO/Sanity mismatches, "Prices changed: update the website").
3. Components in `apps/admin/src/components/`: `Button` (primary, secondary, quiet, danger, danger-solid, small, busy), `StatusBadge` (maps booking status to the `s-*` classes and the word), `Flag` (VIP security, Invoice, Hourly, DEMO), `Field` (label, help, error with `aria-invalid`/`aria-describedby`), `MoneyInput` (`€` prefix, decimal input, euros ↔ cents through the existing helper), `Switch`, `Panel`, `Facts`, `Totals`, `DataTable` (region wrapper with a unique label, sticky head, `aria-sort` links, day group rows, `table-cards` phone mode with `data-label`), `Banner`, `Toast`, `ConfirmDialog` (native `<dialog>`, restates reference, customer and amount, confirm label names action and amount, focus to the first field, Escape closes), `Timeline`, `EmptyState`.
4. Screens, matching the boards: `/login` (`login.html`, neutral error), `/bookings` (`bookings.html`: stat strip for the next 7 days, quick-view tabs, filters in the query string with removable chips, rows grouped by Athens day, "Assign" link where a confirmed booking has no vehicle, pager), `/bookings/[reference]` (`booking.html` and `booking-dialogs.html`: left column trip with blocked time and vehicle assignment, customer, VIP security notes, invoice; right column payment totals with refundable amount, timeline, payments and refunds; the exclusion-constraint error shown under the vehicle field as on the board), `/blocked-slots`, `/prices` (one tab per class, matrix with dashed empty cells and gold changed cells, routes and durations panel), `/hourly-rates`, `/extras`, `/fleet` (classes and vehicles, "No Sanity page" flag), `/zones`, `/settings` (DEMO rows flagged), plus 404 "Booking not found" and the empty and loading states from `states.html`.
5. Copy: plain English as on the boards; times always Athens time; money `€ 70.00` with tabular numbers.

Tests:
- Vitest: `StatusBadge` renders the word for every status (`pending`, `confirmed`, `assigned`, `completed`, `cancelled`, `expired`); `ConfirmDialog` confirm label contains the formatted amount; `DataTable` cells all carry `data-label`.
- Playwright: AC-19 axe (serious and critical) on every admin page at 390, 1024 and 1440 px, no horizontal page overflow; keyboard: Menu button opens the nav at 390 px, Tab reaches every table region and the dialog traps focus until Escape; the refund dialog shows reference, customer and the refundable amount.
- The existing admin tests (AC-10, AC-18, AC-24, AC-31) still pass.

Check (run and report pass/fail):
- `pnpm --filter @tem/admin test`, `pnpm lint`, `pnpm typecheck` pass.
- Screenshots of `/bookings`, a booking, `/prices` at 1440 and 390 px side by side with the boards: same layout, colours and type.
- No request to fonts.googleapis.com from the admin (network tab).

Commit: `feat(admin): Elite Protection admin design`
