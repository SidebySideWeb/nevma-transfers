# Admin design (apps/admin)

The office tool uses the Elite Protection brand at work density. Elite Protection tokens in `design/admin/tokens.css` (the V2 design; the public site keeps `design/tokens.css` until it moves to V2); its own component layer (`design/admin/admin.css`). Boards: open `design/admin/index.html`.

## Boards

| Route | Board |
| --- | --- |
| `/login` | `design/admin/login.html` |
| `/bookings` | `design/admin/bookings.html` |
| `/bookings/[reference]` | `design/admin/booking.html` |
| refund, cancel, vehicle conflict, toasts | `design/admin/booking-dialogs.html` |
| `/blocked-slots` | `design/admin/blocked-slots.html` |
| `/prices` | `design/admin/prices.html` |
| `/hourly-rates` | `design/admin/hourly-rates.html` |
| `/extras` | `design/admin/extras.html` |
| `/fleet` | `design/admin/fleet.html` |
| `/zones` | `design/admin/zones.html` |
| `/settings` | `design/admin/settings.html` |
| empty, loading, banners, not staff, not found | `design/admin/states.html` |
| all components | `design/admin/components.html` |

These boards replace the older wireframes `design/screens/admin-*.html`. Three details belong to later updates and are skipped until then: the VAT lines in the booking Payment panel and the `vat_rate_bp` setting (VAT update), and the "Prices changed: update the website" banner (kit 2).

## Rules

1. **Type.** Jost for everything read or typed: 15 px body and table text (`--admin-text`), 13 px meta (`--admin-text-sm`). Playfair Display only for the wordmark, page titles (`--admin-title`, 30 px) and money totals. Labels: 11 px tracked caps in `--color-label`. All numbers `font-variant-numeric: tabular-nums`.
2. **Colour roles.** Gold (`--color-accent`) means "act here": primary button, links, focus ring, current nav item, VIP flag, unsaved price cells. Status colours only for status, always with a word: pending `--status-pending`, confirmed `--status-confirmed`, assigned `--status-assigned` (gold), completed and expired `--status-completed`, cancelled `--status-cancelled`, information `--status-info`. Red only for destructive actions and errors.
3. **Shape and density.** Square corners, 1 px gold hairlines. Controls 40 px (`--admin-control`), table rows 44 px (`--admin-row`, also the phone tap size). One primary button per area.
4. **Shell.** Sidebar 248 px on `--color-bg-deep` from 1024 px, grouped nav (Operations, Pricing, Setup) with a count on Bookings (confirmed, unassigned, next 7 days); below 1024 px a header with a Menu button (`aria-expanded`). Signed-in email and Sign out at the bottom.
5. **Lists are tables**: sticky header, server-side sort with `aria-sort`, Athens-day group rows where time matters, a gold left edge on VIP rows, muted rows for cancelled. Wrap every table in `.table-wrap` with `role="region" tabindex="0"` and a unique label. Below 720 px tables with `.table-cards` become stacked cards; every cell needs `data-label`, the first cell gets `.card-title`.
6. **Filters** live in the query string; active filters show as removable chips; quick views are tabs (`aria-current="page"`).
7. **Money and destructive actions** open a native `<dialog>` that restates reference, customer and amount; the confirm button names the action and the amount ("Refund € 10.00", "Cancel and refund € 220.00"). The idempotency key is created when the dialog opens. While waiting, the button shows a spinner and "Refunding…" and is `aria-disabled`.
8. **Feedback.** Success: a toast (`role="status"`, 6 s). Errors that need action stay on the page: under the field with `aria-invalid` and `aria-describedby`, or a red banner with `role="alert"`. Never only a toast.
9. **Banners** on every page: DEMO data and Sanity mismatches (warning, link to Settings or Fleet), "Prices changed: update the website" (info, the deploy-hook button), website updating (success), Sanity route with an unknown zone (danger).
10. **Prices matrix.** Rows pick-up zone, columns drop-off zone, one tab per vehicle class; euros with a `€` prefix, right-aligned; empty cell dashed with "No price" = no online price; changed cells gold until saved; the diagonal shows "—".
11. **Motion.** Colour changes only, 150 ms (`--admin-dur`). No slide-ins or photo effects. `prefers-reduced-motion` removes transitions.
12. **Accessibility.** AA contrast on every pair (`scripts/contrast.test.mjs`), visible 2 px gold focus ring, labels on every input (visually hidden where the column header says it), status never by colour alone, skip link to the main content. axe-clean at 390, 1024 and 1440 px.
13. **Fonts.** Self-host Jost (300–600) and Playfair Display (500, 600, italic 500) in `apps/admin/public/fonts`; the boards load Google Fonts only for preview.
