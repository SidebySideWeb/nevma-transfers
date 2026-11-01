# Admin design (Elite Protection) — Cursor prompt

Run after kit 1 prompt 11 (the admin exists and its tests pass). Presentation only: no change to queries, actions, auth, signing or database rights. ~1.5 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/DESIGN-ADMIN.md` and open `design/admin/index.html`, `components.html` and every board it links first. The boards are the visual target; `design/admin/admin.css` is the component layer and `design/admin/tokens.css` the Elite Protection tokens. Do not touch `apps/web` or `design/tokens.css`. Keep the existing tests green and add the ones below first.

1. Styles: copy `design/admin/tokens.css` to `apps/admin/src/styles/tokens.css` and `design/admin/admin.css` to `apps/admin/src/styles/admin.css`, dropping the "board chrome" block at the end. Remove the old admin rules that came from `design/screens/screens.css`. Self-host Jost (300, 400, 500, 600) and Playfair Display (500, 600, italic 500) as woff2 in `apps/admin/public/fonts` with `font-display: swap`; no Google Fonts request.
2. Layout: `AdminLayout.astro` = the shell on the boards: skip link, sidebar with the "Elite Protection · Office" wordmark, grouped nav (Operations: Bookings with the count of confirmed bookings without a vehicle in the next 7 days, Blocked slots; Pricing: Zone prices, Hourly rates, Extras; Setup: Fleet, Zones, Settings), signed-in email and Sign out; below 1024 px a Menu button that toggles the nav (`aria-expanded`, `aria-controls`) with a few lines of inline script; page head with breadcrumbs, Playfair title and page actions; the banner slot (DEMO settings, Sanity/Postgres class mismatches). Page titles and the HTML title use "Elite Protection Admin".
3. Components in `apps/admin/src/components/`: `Button` (primary, secondary, quiet, danger, danger-solid, small, busy), `StatusBadge` (booking status → `s-*` class plus the word), `Flag` (VIP security, Invoice, Hourly, DEMO), `Field` (label, help, error with `aria-invalid`/`aria-describedby`), `MoneyInput` (`€` prefix, decimal input, the existing euros ↔ cents helper), `Switch`, `Panel`, `Facts`, `Totals`, `DataTable` (region wrapper with a unique label, sticky head, `aria-sort` links, day group rows, `table-cards` phone mode with `data-label` on every cell), `Banner`, `Toast`, `ConfirmDialog` (native `<dialog>`, restates reference, customer and amount, confirm label names action and amount, focus to the first field, Escape closes), `Timeline`, `EmptyState`.
4. Screens, matching the boards: `/login` (`login.html`), `/bookings` (`bookings.html`: stat strip for the next 7 days, quick-view tabs, filters in the query string with removable chips, rows grouped by Athens day, "Assign" link where a confirmed booking has no vehicle, pager), `/bookings/[reference]` (`booking.html`, `booking-dialogs.html`; the exclusion-constraint error shown under the vehicle field), `/blocked-slots`, `/prices`, `/hourly-rates`, `/extras`, `/fleet`, `/zones`, `/settings`, plus "Booking not found", empty and loading states (`states.html`). Skip for now (later updates): the VAT lines in the Payment panel, the `vat_rate_bp` setting row, the "update the website" banner.
5. Add one line to `.cursor/rules/80-admin-app.mdc`: "Look: Elite Protection admin design (`design/admin/`, `docs/DESIGN-ADMIN.md`): Jost for text, Playfair only for the wordmark, page titles and totals, square corners, gold means act here, status always as a word, errors stay on the page."

Tests:
- Vitest: `StatusBadge` renders the word for every status (`pending`, `confirmed`, `assigned`, `completed`, `cancelled`, `expired`); `ConfirmDialog` confirm label contains the formatted amount; every `DataTable` cell carries `data-label`.
- Playwright: axe (serious and critical) on every admin page at 390, 1024 and 1440 px with no horizontal page overflow; at 390 px the Menu button opens the nav; Tab reaches every table region; the refund dialog shows reference, customer and refundable amount and Escape closes it.
- The existing admin tests (AC-10, AC-18, AC-19, AC-24) still pass.

Check (run and report pass/fail):
- `pnpm --filter @tem/admin test`, `pnpm lint`, `pnpm typecheck` pass.
- Screenshots of `/bookings`, a booking and `/prices` at 1440 and 390 px next to the boards: same layout, colours and type.
- No request to fonts.googleapis.com from the admin.

Commit: `feat(admin): Elite Protection admin design`
