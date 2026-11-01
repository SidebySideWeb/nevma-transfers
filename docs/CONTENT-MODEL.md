# Content model — Sanity

One Sanity project for Elite Protection (kit 1 and kit 2). Dataset `production`, private. The Studio in `apps/studio` is provided and validated with Sanity 6.21 (0 errors, 0 warnings; `sanity build` passes; 22 schema and seed tests). **Do not redesign it.**

Sanity holds content and form submissions. Zones, prices, hourly rates, extras, vehicles, availability and bookings are in Postgres (`docs/DATA-MODEL.md`) and are managed in the admin app. Sanity routes and vehicle classes join Postgres by code (`fromZone`/`toZone` = `zones.code`; `vehicleClass.key` = `vehicle_classes.key`).

## Documents

| Type | Id | Fields | Used by |
| --- | --- | --- | --- |
| `siteSettings` | `siteSettings` (singleton) | `companyName`*, `tagline`, `phone`*, `email`*, `bookingNotificationEmail`*, `address`, `openingHours`, `timezone` (read-only, Europe/Athens), `showFromPrices` (kit 2, default on), `defaultSeo`, `logo` (+ alt), `internalNote` | header, footer, contact details, emails, SEO defaults, price display |
| `uiStrings` | `uiStrings` (singleton) | `strings[]` of `{ area: booking \| errors \| emails \| site \| forms, key, value }`; keys must be in the table below and unique | every user-facing label and message outside page copy |
| `vehicleClass` | `vehicleClass-<key>` | `key`* (= Postgres, read-only after publish), `name`*, `tagline`, `photos[]` (1–8, alt*), `copy`, `specs[] {label, value}`, `sortOrder`, `seo`, `internalNote` | booking cards; kit 2 `/fleet` and `/fleet/[key]` |
| `page` | `page-<slug>` | `kind`* (`home` \| `legal` \| `standard`), `title`*, `slug`*, `sections[]`, `seo`, `internalNote` | `/`, legal pages, and kit 2 standard pages: `fleet`, `services`, `vip-security`, `about`, `contact`, `request-a-transfer` |
| `route` (kit 2) | `route-<slug>` | `title`*, `slug`*, `fromZone`*, `toZone`* (zone codes, different), `intro`*, `body`, `photo` (+ alt), `faq[] {question, answer}`, `featured`, `sortOrder`, `seo`, `internalNote` | `/routes/[slug]`, route lists |
| `form` (kit 2) | `form-<key>` | `key`* (`transfer-request` \| `vip-security` \| `contact`, read-only after publish), `title`*, `intro`, `recipientEmail`*, `topics[] {key, label, recipientEmail}` (contact only), `submitLabel`, `successTitle`*, `successMessage`*, `retentionMonths`* (1–120, default 24), `internalNote` | form blocks, thank-you pages, office emails, retention cron |
| `formSubmission` (kit 2) | `submission-<uuid>` | `status` (`new` \| `in-progress` \| `done`), `internalNote` (office notes) — editable; read-only: `form` ref, `formKey`, `topic`, `submittedAt`, `name`, `email`, `phone`, `answers[] {key, label, value}`, `consent`, `emailStatus` | written by the site server only; never in "Create new"; actions: publish, discard, delete, restore |

`*` required. Every image requires alt text. `internalNote` on content documents is never shown on the site; the DEMO seed marks it so the launch guard can find leftovers.

## Page sections

| Type | Fields |
| --- | --- |
| `hero` | `heading`*, `subheading`, `image` (+ alt), `ctaLabel`, `ctaTarget` (`book` \| `url`), `ctaUrl` |
| `richText` | `heading`, `body`* (Portable Text) |
| `ctaBand` | `heading`*, `text`, `ctaLabel`*, `ctaTarget`, `ctaUrl` |
| `faq` | `heading`, `items[] { question*, answer* }` |
| `featureGrid` (kit 2) | `heading`, `intro`, `items[] { title*, text*, link }` (2–6) |
| `imageText` (kit 2) | `heading`*, `body`*, `image`* (+ alt), `imageSide` (`left` \| `right`), `ctaLabel`, `ctaTarget` (`book` \| `quote` \| `url`), `ctaUrl` |
| `steps` (kit 2) | `heading`, `items[] { title*, text }` (2–6) |
| `vehicleClassList` (kit 2) | `heading`, `intro` — renders all active classes with Sanity content, in `sortOrder`, with "From" prices |
| `routeList` (kit 2) | `heading`, `intro`, `routes[]` (references; empty = featured routes) |
| `contactDetails` (kit 2) | `heading`, `showHours` — values from `siteSettings` |
| `formBlock` (kit 2) | `form`* (reference to `form`), `heading` (defaults to the form title) |

## Desk structure

Site settings · UI strings · Pages · Routes · Vehicle classes · **Forms and submissions** → Form settings, then per form (Request a transfer, VIP security enquiries, Contact): New, In progress, Done, All (newest first).

## Reading and writing content in apps/web

- Queries in `apps/web/src/lib/sanity/queries.ts` with `defineQuery`; `pnpm --filter @tem/studio typegen` regenerates `apps/web/src/sanity/sanity.types.ts`.
- Perspective `published`; read with `SANITY_READ_TOKEN` (Viewer) on the server and at build only.
- Submissions are created with `SANITY_WRITE_TOKEN` (Editor robot) in `apps/web` server code only (`docs/FORMS.md`).
- Strings: `t(key, vars)` with code defaults from `apps/studio/schemaTypes/lib/uiStringDefaults.ts`.

## Seed (DEMO)

`seed/tem-seed.tar.gz` and `seed/sanity/data.ndjson`: 25 documents — `siteSettings`, `uiStrings` (all keys), 5 vehicle classes from the V2 design (E-Class, S-Class, V-Class, Vito, Sprinter, with the design's photos), 11 pages (home, 4 legal, 6 standard), 4 routes (one, `demo-north` → `demo-port`, has no `demo-v-class` price on purpose), 3 forms (contact with 5 topics), 11 neutral DEMO images. No submissions. Rebuild with `node --experimental-strip-types scripts/build-sanity-seed.mjs`. Import: prompt 02 (kit 1) or prompt 15 (kit 2, `--replace` adds the new documents and updates the existing ones).

## UI string keys (153)

| Area | Key | Default |
| --- | --- | --- |
| booking | `booking.search.title` | Book your ride |
| booking | `booking.toggle.transfer` | Transfer |
| booking | `booking.toggle.hourly` | By the hour |
| booking | `booking.pickup.zone` | Pick-up area |
| booking | `booking.dropoff.zone` | Drop-off area |
| booking | `booking.pickup.address` | Pick-up address |
| booking | `booking.dropoff.address` | Drop-off address |
| booking | `booking.pickup.datetime` | Pick-up date and time |
| booking | `booking.hours.label` | Number of hours |
| booking | `booking.hours.hint` | Minimum {min} hours, maximum {max} hours. |
| booking | `booking.passengers` | Passengers |
| booking | `booking.luggage` | Luggage items |
| booking | `booking.flight` | Flight number (optional) |
| booking | `booking.search.submit` | See vehicles and prices |
| booking | `booking.vehicle.title` | Choose your vehicle |
| booking | `booking.vehicle.select` | Select |
| booking | `booking.vehicle.capacity` | Up to {passengers} passengers, {luggage} bags |
| booking | `booking.details.title` | Your details |
| booking | `booking.details.name` | Full name |
| booking | `booking.details.email` | Email |
| booking | `booking.details.phone` | Phone |
| booking | `booking.details.notes` | Notes for the driver (optional) |
| booking | `booking.invoice.toggle` | I need an invoice |
| booking | `booking.invoice.company` | Company name |
| booking | `booking.invoice.vat` | VAT number |
| booking | `booking.invoice.taxOffice` | Tax office |
| booking | `booking.invoice.address` | Company address |
| booking | `booking.extras.title` | Extras |
| booking | `booking.extras.night` | Night surcharge |
| booking | `booking.extras.vip` | VIP security |
| booking | `booking.extras.vip.hint` | Add VIP security to this booking. The office confirms the details with you. |
| booking | `booking.review.title` | Review and pay |
| booking | `booking.total` | Total |
| booking | `booking.priceNote` | Final price per vehicle, VAT included. |
| booking | `booking.review.priceAnalysis` | Price analysis |
| booking | `booking.review.net` | Price before VAT |
| booking | `booking.review.vat` | VAT {rate}% |
| booking | `booking.review.totalInclVat` | Total to pay (VAT included) |
| booking | `booking.pay` | Pay securely |
| booking | `booking.hold.timer` | Your vehicle is held for {minutes} minutes. |
| booking | `booking.hold.warning` | Your hold ends in 2 minutes. |
| booking | `booking.hold.expired` | Your hold has ended. Please choose a vehicle again. |
| booking | `booking.contactUs` | We cannot price this trip online. Please call or email us and we will help you. |
| booking | `booking.handoff.title` | Taking you to Viva |
| booking | `booking.handoff.body` | You are being sent to Viva to pay securely. Do not close this page. |
| booking | `booking.confirmed.title` | Booking confirmed |
| booking | `booking.confirmed.body` | Thank you. Your booking {reference} is confirmed. We have emailed you the details. |
| booking | `booking.confirmed.waiting` | We are confirming your payment. This page updates by itself. |
| booking | `booking.notCompleted.title` | Payment not completed |
| booking | `booking.notCompleted.body` | Your payment was not completed. Your vehicle is still held for a short time: you can try again or choose another vehicle. |
| booking | `booking.cancel.title` | Cancel your booking |
| booking | `booking.cancel.confirm` | Yes, cancel booking {reference} |
| booking | `booking.cancel.done` | Your booking has been cancelled. If you are due a refund we will send it back to your card. |
| booking | `booking.cancel.tooLate` | This booking can no longer be cancelled online. Please contact us. |
| errors | `error.no_price` | There is no online price for this trip. Please contact us. |
| errors | `error.unavailable` | No vehicle is available at that time. Please try another time or vehicle. |
| errors | `error.invalid_request` | Please check the highlighted fields and try again. |
| errors | `error.payment_failed` | We could not start the payment. Please try again. |
| errors | `error.lead_time` | Please choose a pick-up time at least {hours} hours from now, or contact us. |
| errors | `error.hours_range` | Please choose between {min} and {max} hours. |
| errors | `error.turnstile` | We could not verify that you are human. Please try again. |
| emails | `email.confirmation.subject` | Your booking {reference} is confirmed |
| emails | `email.confirmation.body` | Thank you for booking with us. Your booking {reference} is confirmed for {pickupAt}. |
| emails | `email.confirmation.vip` | VIP security is included in this booking. The office will contact you with the details. |
| emails | `email.confirmation.priceAnalysis` | Price analysis |
| emails | `email.confirmation.net` | Price before VAT |
| emails | `email.confirmation.vat` | VAT {rate}% |
| emails | `email.confirmation.total` | Total paid (VAT included) |
| emails | `email.confirmation.cancelLink` | To see, manage or cancel your booking, use this secure link: {cancelUrl} |
| emails | `email.reminder.subject` | Reminder: your transfer is tomorrow ({reference}) |
| emails | `email.reminder.body` | This is a reminder of your booking {reference} on {pickupAt}. |
| emails | `email.cancelled.subject` | Your booking {reference} was cancelled |
| emails | `email.cancelled.body` | Your booking {reference} has been cancelled. |
| emails | `email.refunded.body` | A refund of {amount} has been issued to your card. |
| emails | `email.lateRefund.subject` | Your payment for {reference} was refunded |
| emails | `email.lateRefund.body` | Your payment arrived after the vehicle hold ended and the vehicle was no longer free, so we refunded it in full. |
| emails | `email.office.new.subject` | New booking {reference} |
| emails | `email.office.cancelled.subject` | Booking cancelled {reference} |
| booking | `lookup.title` | Find my booking |
| booking | `lookup.intro` | No accounts to remember. Enter your reference and email and we send you a secure link. |
| booking | `lookup.reference` | Booking reference |
| booking | `lookup.email` | Email used for the booking |
| booking | `lookup.submit` | Email me the secure link |
| booking | `lookup.sent` | If a booking matches these details, we have emailed you a secure link. Check your inbox and spam folder. |
| booking | `manage.title` | Your booking |
| booking | `manage.chauffeurNote` | Chauffeur details are emailed before the journey. |
| booking | `manage.status.pending` | Awaiting payment |
| booking | `manage.status.confirmed` | Confirmed |
| booking | `manage.status.assigned` | Chauffeur assigned |
| booking | `manage.status.completed` | Completed |
| booking | `manage.status.cancelled` | Cancelled |
| booking | `manage.timeline.booked` | Booked and paid |
| booking | `manage.timeline.confirmed` | Confirmed by the office |
| booking | `manage.timeline.assigned` | Chauffeur assigned |
| booking | `manage.timeline.completed` | Journey completed |
| booking | `manage.paid` | Paid |
| booking | `manage.requestInvoice` | Request an invoice |
| booking | `manage.callOffice` | Call the office |
| booking | `manage.addToCalendar` | Add to calendar |
| booking | `manage.cancel` | Cancel this booking |
| booking | `manage.changesByPhone` | To change the time, vehicle or addresses, please call the office. Online changes are not available yet. |
| booking | `manage.linkInvalid` | This link is no longer valid. Use Find my booking to get a new one. |
| emails | `email.manageLink.subject` | Your secure link for booking {reference} |
| emails | `email.manageLink.body` | Use this secure link to see or manage booking {reference}: {manageUrl}. It replaces any earlier link we sent you. |
| site | `nav.fleet` | Fleet |
| site | `nav.services` | Services |
| site | `nav.vipSecurity` | VIP security |
| site | `nav.about` | About |
| site | `nav.contact` | Contact |
| site | `nav.book` | Book now |
| site | `nav.menu` | Menu |
| site | `site.breadcrumb.home` | Home |
| site | `site.fromPrice` | From {price} |
| site | `site.perHour` | From {price} per hour |
| site | `site.duration` | About {minutes} minutes |
| site | `site.bookRoute` | Book this route |
| site | `site.viewVehicle` | View vehicle |
| site | `site.viewRoute` | See route |
| site | `site.pricesForRoute` | Prices for this route |
| site | `site.noOnlinePrice` | Price on request |
| site | `site.requestQuote` | Request a quote |
| site | `site.hours` | Opening hours |
| site | `site.office` | Office |
| site | `site.vehicle.about` | About this vehicle |
| site | `site.vehicle.specs` | Specifications |
| site | `site.vehicle.popularRoutes` | Popular routes in this vehicle |
| site | `site.vehicle.routeCol` | Route |
| site | `site.vehicle.fromCol` | From |
| site | `site.vehicle.routePrices` | Route prices |
| site | `site.legal.terms` | Terms |
| site | `site.legal.privacy` | Privacy |
| site | `site.legal.cookies` | Cookies |
| site | `site.legal.cancellation` | Cancellation |
| site | `site.cookieSettings` | Cookie settings |
| site | `site.nav.main` | Main |
| site | `site.nav.footer` | Footer |
| site | `site.nav.legal` | Legal |
| site | `site.nav.breadcrumb` | Breadcrumb |
| forms | `form.name` | Full name |
| forms | `form.email` | Email |
| forms | `form.phone` | Phone |
| forms | `form.message` | Message |
| forms | `form.topic` | Topic |
| forms | `form.serviceType` | Type of service or event |
| forms | `form.date` | Date |
| forms | `form.place` | Place |
| forms | `form.people` | Number of people |
| forms | `form.fromZone` | From area |
| forms | `form.toZone` | To area |
| forms | `form.otherPlace` | Other place (not in the list) |
| forms | `form.pickupAddress` | Pick-up address |
| forms | `form.dropoffAddress` | Drop-off address |
| forms | `form.datetime` | Date and time |
| forms | `form.passengers` | Passengers |
| forms | `form.luggage` | Luggage items |
| forms | `form.vehicleClass` | Vehicle |
| forms | `form.vehicleClass.any` | No preference |
| forms | `form.vipSecurity` | I would also like VIP security |
| forms | `form.invoice` | I need an invoice |
| forms | `form.consent` | I agree that you keep my details to answer this request, as described in the privacy policy. |
| forms | `form.submit` | Send |
| forms | `form.sending` | Sending… |
| forms | `form.optional` | (optional) |
| forms | `form.error.required` | This field is required. |
| forms | `form.error.email` | Enter a valid email address. |
| forms | `form.error.generic` | We could not send your message. Please try again or call us. |
| forms | `email.form.office.subject` | New {form} from {name} |
| forms | `email.form.confirm.subject` | We received your request |
| forms | `email.form.confirm.body` | Thank you, {name}. We received your request and will reply as soon as we can. A copy of what you sent is below. |
