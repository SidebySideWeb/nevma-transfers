# Prompt 1 of 2 — Admin design (Elite Protection), incl. brand dropdowns

Run after kit 1 prompt 11 (the admin exists and its tests pass). Presentation only: no change to queries, actions, auth, signing or database rights. ~1.5 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/DESIGN-ADMIN.md` and open `design/admin/index.html`, `components.html` and every board it links first. The boards are the visual target; `design/admin/admin.css` is the component layer, `design/admin/tokens.css` the Elite Protection tokens, `design/admin/admin.js` the reference behaviour for the dropdown. Do not touch `apps/web` or `design/tokens.css`. Keep the existing tests green and add the ones below first. The calendar and New booking boards are built by prompt 2; here only add their nav item and buttons as links.

1. Styles: copy `design/admin/tokens.css` to `apps/admin/src/styles/tokens.css` and `design/admin/admin.css` to `apps/admin/src/styles/admin.css`, dropping the "board chrome" block at the end. Remove the old admin rules that came from `design/screens/screens.css`. Self-host Jost (300, 400, 500, 600) and Playfair Display (500, 600, italic 500) as woff2 in `apps/admin/public/fonts` with `font-display: swap`; no Google Fonts request.
2. Layout: `AdminLayout.astro` = the shell on the boards: skip link, sidebar with the "Elite Protection · Office" wordmark, grouped nav (Operations: Bookings with the count of confirmed bookings without a vehicle in the next 7 days, Fleet calendar, Blocked slots; Pricing: Zone prices, Hourly rates, Extras; Setup: Fleet, Zones, Settings), signed-in email and Sign out; below 1024 px a Menu button that toggles the nav (`aria-expanded`, `aria-controls`); page head with breadcrumbs, Playfair title and page actions; the banner slot (DEMO settings, Sanity/Postgres class mismatches). Titles use "Elite Protection Admin".
3. Components in `apps/admin/src/components/`: `Button` (primary, secondary, quiet, danger, danger-solid, small, busy), `StatusBadge` (booking status → `s-*` class plus the word), `Flag` (VIP security, Invoice, Hourly, Office, DEMO), `Field`, `MoneyInput` (`€` prefix, the existing euros ↔ cents helper), `Switch`, `Panel`, `Facts`, `Totals`, `DataTable` (region wrapper with a unique label, sticky head, `aria-sort` links, day group rows, `table-cards` phone mode with `data-label` on every cell), `Banner`, `Toast`, `ConfirmDialog` (native `<dialog>`, restates reference, customer and amount, confirm label names action and amount), `Timeline`, `EmptyState`, and **`Select`** — the brand dropdown, exactly as `enhanceSelect` in `design/admin/admin.js` and the `.ep-select*` CSS: button `role="combobox"`, `role="listbox"` list, `aria-activedescendant`, arrows, Home/End, type-ahead, Enter/Space pick, Escape/Tab close, click outside closes, optional right-aligned option meta, disabled options visible, hidden native `<select>` kept in the form (works without JS). Replace every `<select>` in the admin with `Select`.
4. Screens, matching the boards: `/login`, `/bookings`, `/bookings/[reference]` (+ refund and cancel dialogs), `/blocked-slots`, `/prices`, `/hourly-rates`, `/extras`, `/fleet`, `/zones`, `/settings`, "Booking not found", empty and loading states. Skip for now (later updates): the VAT lines in the Payment panel, the `vat_rate_bp` setting row, the "update the website" banner.
5. Add one line to `.cursor/rules/80-admin-app.mdc`: "Look: Elite Protection admin design (`design/admin/`, `docs/DESIGN-ADMIN.md`): Jost for text, Playfair only for the wordmark, page titles and totals, square corners, gold means act here, status always as a word, brand dropdown for every select, errors stay on the page."

Tests:
- Vitest: `StatusBadge` renders the word for every status; `ConfirmDialog` confirm label contains the formatted amount; every `DataTable` cell carries `data-label`; `Select` opens with ArrowDown, moves, type-ahead finds an option, Enter picks and updates the hidden native select, Escape closes without changing it, disabled options cannot be picked.
- Playwright: axe (serious and critical) on every admin page at 390, 1024 and 1440 px with no horizontal page overflow; the Menu button opens the nav at 390 px; a filter dropdown on Bookings is operable by keyboard only and changes the list.
- Existing admin tests (AC-10, AC-18, AC-19, AC-24) still pass.

Check (run and report pass/fail):
- `pnpm --filter @tem/admin test`, `pnpm lint`, `pnpm typecheck` pass.
- Screenshots of `/bookings`, a booking and `/prices` at 1440 and 390 px next to the boards: same layout, colours and type; an open dropdown matches `components.html`.
- No request to fonts.googleapis.com from the admin.

Commit: `feat(admin): Elite Protection admin design and brand dropdowns`
