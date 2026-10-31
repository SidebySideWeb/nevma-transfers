# Pages and routes — kit 1

Visual reference: `design/screens/*.html` (open `design/index.html`). Every string comes from `uiStrings` or a Sanity document; keys are named below.

## apps/web (public site)

| Route | Rendering | Robots | Source | Screen |
| --- | --- | --- | --- | --- |
| `/` | prerendered | index | `page-home` sections in order (hero, richText, faq, ctaBand); "Book now" goes to `/book` | `design/screens/home.html` |
| `/book` | prerendered shell + React island (`client:load`) | noindex | `/api/booking-options`, `/api/quote`, `/api/holds`, `/api/bookings` | search, vehicle-choice, details, review |
| `/booking/confirmed` | on demand | noindex | Viva success URL; polls `/api/booking-status?s=` | `confirmed.html` |
| `/booking/not-completed` | on demand | noindex | Viva failure URL; "try again" (`/api/bookings/pay`) or "choose another vehicle" | `not-completed.html` |
| `/booking/cancel/[token]` | on demand | noindex | shows reference, date, route and refund preview; confirm button posts to `/api/bookings/cancel` | `cancel.html` |
| `/privacy`, `/cookies`, `/terms`, `/cancellation` | prerendered | index | `page-<slug>` | legal (uses base layout) |
| `/404`, `/500` | prerendered | noindex | `uiStrings` codes defaults; `/500` makes no data calls | — |
| `/robots.txt`, `/sitemap.xml` | prerendered | — | home + legal pages only | — |

### Shared layout
Header: logo or company name (`siteSettings`), "Book now" button, phone link. Footer: company name, address, phone, email, opening hours, links to the four legal pages, "Cookie settings". No NEVMA links.

### `/book`, the booking island (one page, four steps)

The URL keeps the step in a hash (`#search`, `#vehicle`, `#details`, `#review`) so the back button works; state lives in one reducer.

1. **Search** (`booking.search.title`): toggle Transfer / By the hour (`booking.toggle.*`); pick-up area; drop-off area (transfer) or number of hours with hint `booking.hours.hint` (hourly); date and time (local, Europe/Athens, labelled); passengers; luggage; submit `booking.search.submit` → `POST /api/quote`.
2. **Vehicle** (`booking.vehicle.title`): one card per class: photo, name, tagline, capacity (`booking.vehicle.capacity`), price "€ 70.00", Select (`booking.vehicle.select`). Unavailable classes are shown greyed with `error.unavailable`; no price → `booking.contactUs` with phone and email. Select → `POST /api/holds` (Turnstile) → step 3 with the hold timer.
3. **Details** (`booking.details.title`): hold timer (`booking.hold.timer`, warning at 2 minutes, expiry message); addresses (`booking.pickup.address`, `booking.dropoff.address` for transfers); flight number; name, email, phone; notes; extras (`booking.extras.title`): night surcharge and **VIP security** (`booking.extras.vip` + price + `booking.extras.vip.hint`), never pre-selected; invoice block (`booking.invoice.*`); consent checkbox linking terms and privacy; continue → `POST /api/bookings` (Turnstile).
4. **Review** (`booking.review.title`): summary of trip, vehicle, extras as lines with amounts, `booking.total` from the created booking, hold timer; `booking.pay` → hand-off screen (`booking.handoff.*`) → `checkoutUrl`.

Back from step 3 to step 2 releases the hold (`DELETE /api/holds/:id`). On hold expiry: message `booking.hold.expired`, back to step 2, entered details kept.

## apps/admin (office), all routes noindex, staff only

| Route | Purpose | Screen |
| --- | --- | --- |
| `/login` | Supabase Auth email + password (magic link optional); non-staff are signed out with a neutral message | — |
| `/` → `/bookings` | Bookings list: filters status, date range, type, VIP security, invoice status; columns reference, pick-up time, type, route or hours, class, vehicle, customer name, total, payment, VIP flag, invoice | `admin-bookings.html` |
| `/bookings/[reference]` | Detail: trip, customer, extras, payments and refunds history; actions: assign or change vehicle (only free vehicles of the class listed), mark completed, security notes, invoice status and number, cancel (via `/api/internal/cancel`), refund (via `/api/internal/refund`, shows refundable amount) | `admin-booking.html` |
| `/blocked-slots` | Block a vehicle for a time range with a reason; list and delete future blocks | — |
| `/prices` | Zone price matrix per class (euros in, cents stored); empty cell = no online price; routes and durations | `admin-prices.html` |
| `/hourly-rates` | Rate, min hours, max hours per class | (in `admin-prices.html`) |
| `/extras` | Name, price, active; includes `vip-security` and `night-surcharge` | (in `admin-prices.html`) |
| `/fleet` | Vehicle classes (capacity, luggage, buffer, active) and vehicles (label, status) | — |
| `/zones` | Zones (code, name, order, active) | — |
| `/settings` | Values of `settings` with descriptions; DEMO rows highlighted | — |

A banner on every admin page lists vehicle classes that exist in Postgres but not in Sanity (or the reverse), and any `settings` row still marked DEMO.
