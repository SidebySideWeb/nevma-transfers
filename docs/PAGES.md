# Pages and routes — kit 1

Visual target for every public route: the V2 design page listed in `docs/DESIGN-V2.md` (`design/v2/`). The Screen column below names the earlier structural wireframes (states, fields, string keys).

Visual reference: `design/screens/*.html` (open `design/index.html`). Every string comes from `uiStrings` or a Sanity document; keys are named below.

## apps/web (public site)

| Route | Rendering | Robots | Source | Screen |
| --- | --- | --- | --- | --- |
| `/` | prerendered | index | `page-home` sections in order (hero, richText, faq, ctaBand); "Book now" goes to `/book` | `design/screens/home.html` |
| `/book` | prerendered shell + React island (`client:load`) | noindex | `/api/booking-options`, `/api/quote`, `/api/holds`, `/api/bookings` | search, vehicle-choice, details, review |
| `/booking/confirmed` | on demand | noindex | Viva success URL; polls `/api/booking-status?s=` | `confirmed.html` |
| `/booking/not-completed` | on demand | noindex | Viva failure URL; "try again" (`/api/bookings/pay`) or "choose another vehicle" | `not-completed.html` |
| `/booking/cancel/[token]` | on demand | noindex | reached from the manage page; shows reference, date, route and refund preview; confirm button posts to `/api/bookings/cancel` | `cancel.html` → design `V2Cancel` |
| `/booking/find` | prerendered shell + small script | noindex | find my booking: reference + email → `/api/bookings/lookup`; always shows `lookup.sent` after submit | design `V2Lookup` |
| `/booking/manage/[token]` | on demand | noindex | the booking, status timeline, amounts, actions (invoice request, call, add to calendar, cancel) | design `V2Manage` |
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

## Kit 2 — content pages (apps/web)

Header navigation from kit 2: `nav.fleet` → `/fleet`, `nav.services` → `/services`, `nav.vipSecurity` → `/vip-security`, `nav.about` → `/about`, `nav.contact` → `/contact`, `nav.book` button → `/book` (hidden while `PUBLIC_BOOKING_OPEN=false`; then "Request a quote" → `/request-a-transfer`). Phone: a menu button (`nav.menu`) opens the same list. Footer adds the same links. Breadcrumbs (`site.breadcrumb.home`) on fleet, vehicle and route pages.

| Route | Rendering | Source | Structured data | Screen |
| --- | --- | --- | --- | --- |
| `/fleet` | prerendered | `page-fleet` sections; `vehicleClassList` renders one card per class: photo, name, tagline, capacity (`booking.vehicle.capacity`), `site.fromPrice` (lowest transfer price) and `site.perHour` (hourly rate), `site.viewVehicle` | `BreadcrumbList` | `fleet.html` |
| `/fleet/[key]` | prerendered per active class with Sanity content | `vehicleClass`: gallery, description, specs, capacity, "From" prices for featured routes, Book now (`/book?class=<key>`), Request a quote | `Service` (`offers.lowPrice` when shown), `BreadcrumbList` | `vehicle.html` |
| `/services` | prerendered | `page-services` sections (hero, featureGrid, steps, routeList) | — | `services.html` |
| `/routes/[slug]` | prerendered per `route` whose zone codes exist in Postgres | `route`: photo, intro, `site.duration` (route duration), price table per class (`site.pricesForRoute`; `site.noOnlinePrice` + Request a quote when missing), body, FAQ, `site.bookRoute` → `/book?from=<code>&to=<code>` | `Service` with `offers` per class, `FAQPage`, `BreadcrumbList` | `route.html` |
| `/vip-security` | prerendered | `page-vip-security` sections; `formBlock` → VIP security form with `id="enquiry"`; `contactDetails` | `Service` | `vip-security.html` |
| `/about` | prerendered | `page-about` sections (imageText, ctaBand) | `Organization` | (components from `vip-security.html` and `home.html`) |
| `/contact` | prerendered | `page-contact` sections: `contactDetails`, `formBlock` (contact form with topics) | `Organization` with `contactPoint` | `contact.html` |
| `/request-a-transfer` | prerendered; query string prefill handled by a small script | `page-request-a-transfer` sections; transfer request form (`docs/FORMS.md`), zones and classes from the build-time catalog | — | `request-a-transfer.html` |
| `/thank-you/[form]` | prerendered per form, `noindex` | `form.successTitle`, `form.successMessage`, links home and to `/book` | — | `thank-you.html` |

`/book` (kit 1) accepts `?from=`, `?to=`, `?class=`, `?type=hourly` to prefill the search step (prompt 19 adds this).

## apps/admin (office), all routes noindex, staff only

Design: `docs/DESIGN-ADMIN.md` and the boards in `design/admin/` (states: `design/admin/states.html`; components: `design/admin/components.html`).

| Route | Purpose | Screen |
| --- | --- | --- |
| `/login` | Supabase Auth email + password (magic link optional); non-staff are signed out with a neutral message | `design/admin/login.html` |
| `/` → `/bookings` | Bookings list: filters status, date range, type, VIP security, invoice status; columns reference, pick-up time, type, route or hours, class, vehicle, customer name, total, payment, VIP flag, invoice | `design/admin/bookings.html` |
| `/bookings/[reference]` | Detail: trip, customer, extras, payments and refunds history; actions: assign or change vehicle (only free vehicles of the class listed), mark completed, security notes, invoice status and number, cancel (via `/api/internal/cancel`), refund (via `/api/internal/refund`, shows refundable amount) | `design/admin/booking.html`, `design/admin/booking-dialogs.html` |
| `/bookings/new` | Office (manual) booking: customer lookup, trip, class with free count and list price, optional vehicle, extras, payment link or offline, price override with reason (`docs/OFFICE-BOOKINGS.md` §1) | `design/admin/new-booking.html` |
| `/calendar` | Fleet calendar: day (default) and week; one row per vehicle, free per hour per class, click to open, empty time to book or block (`docs/OFFICE-BOOKINGS.md` §2) | `design/admin/calendar.html`, `design/admin/calendar-week.html` |
| `/blocked-slots` | Block a vehicle for a time range with a reason; list and delete future blocks | `design/admin/blocked-slots.html` |
| `/prices` | Zone price matrix per class (euros in, cents stored); empty cell = no online price; routes and durations | `design/admin/prices.html` |
| `/hourly-rates` | Rate, min hours, max hours per class | `design/admin/hourly-rates.html` |
| `/extras` | Name, price, active; includes `vip-security` and `night-surcharge` | `design/admin/extras.html` |
| `/fleet` | Vehicle classes (capacity, luggage, buffer, active) and vehicles (label, status) | `design/admin/fleet.html` |
| `/fleet/[key]` | Class page: booking details, vehicles, Sanity content status and link, prices, "Ready for customers?" checklist (`docs/FLEET-SETUP.md`) | `design/admin/fleet-class.html`, `design/admin/setup-dialogs.html` |
| `/zones` | Zones (code, name, order, active) | `design/admin/zones.html` |
| `/settings` | Values of `settings` with descriptions; DEMO rows highlighted | `design/admin/settings.html` |

A banner on every admin page lists vehicle classes that exist in Postgres but not in Sanity (or the reverse), any `settings` row still marked DEMO, and (kit 2) Sanity routes whose zone codes do not exist in Postgres. After any save on `/prices`, `/hourly-rates`, `/extras`, `/fleet` or `/zones`, a second banner offers "Prices changed: update the website" (AC-31).
