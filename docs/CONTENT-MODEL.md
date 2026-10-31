# Content model — Sanity

One Sanity project for TEM Protection (kit 1 and kit 2). Dataset `production`, private. The Studio in `apps/studio` is provided and validated with Sanity 6.21 (0 errors, 0 warnings; `sanity build` passes; 14 schema and seed tests). **Do not redesign it.** Kit 2 adds document and section types; it does not change these.

Sanity holds content only. Zones, prices, hourly rates, extras, vehicles, availability and bookings are in Postgres (`docs/DATA-MODEL.md`) and are managed in the admin app.

## Documents

| Type | Id | Fields | Used by |
| --- | --- | --- | --- |
| `siteSettings` | `siteSettings` (singleton) | `companyName`*, `tagline`, `phone`*, `email`*, `bookingNotificationEmail`* (office mailbox for booking emails), `address`, `openingHours`, `timezone` (read-only, Europe/Athens), `defaultSeo`, `logo` (image + alt), `internalNote` | header, footer, contact-us fallback, emails, SEO defaults |
| `uiStrings` | `uiStrings` (singleton) | `strings[]` of `{ area: booking \| errors \| emails, key, value }`; keys must be in the table below and unique | every user-facing string in the booking flow, errors and emails |
| `vehicleClass` | `vehicleClass-<key>` | `key`* (equals Postgres `vehicle_classes.key`; read-only after first publish), `name`*, `tagline`, `photos[]` (1–8, each with alt*), `copy` (Portable Text), `specs[] {label, value}`, `sortOrder`, `seo`, `internalNote` | vehicle cards in the booking flow; kit 2 fleet pages |
| `page` | `page-<slug>` | `kind`* (`home` \| `legal`), `title`*, `slug`*, `sections[]` (`hero`, `richText`, `ctaBand`, `faq`), `seo`, `internalNote` | `/` (slug `home`) and `/privacy`, `/cookies`, `/terms`, `/cancellation` |

`*` required. Every image requires alt text. `internalNote` is never shown on the site; the DEMO seed sets it to a DEMO marker so the launch check (AC-21) can find leftovers.

## Objects

| Type | Fields |
| --- | --- |
| `seo` | `title` (≤ 60 advised), `description` (≤ 160 advised), `image` (+ alt), `noindex` |
| `hero` | `heading`*, `subheading`, `image` (+ alt), `ctaLabel`, `ctaTarget` (`book` \| `url`), `ctaUrl` |
| `richText` | `heading`, `body`* (Portable Text: normal, h2, h3, bullet and numbered lists, strong, em, link with http/https/mailto/tel) |
| `ctaBand` | `heading`*, `text`, `ctaLabel`*, `ctaTarget`, `ctaUrl` |
| `faq` | `heading`, `items[] { question*, answer* }` (at least one) |

## Desk structure

Site settings (singleton) · UI strings (singleton) · Pages · Vehicle classes. Singletons cannot be created twice, deleted or duplicated.

## Reading content in apps/web

- Queries live in `apps/web/src/lib/sanity/queries.ts` with `defineQuery`; run `pnpm --filter @tem/studio typegen` to regenerate `apps/web/src/sanity/sanity.types.ts`.
- Perspective `published`; the private dataset is read with `SANITY_READ_TOKEN` (server and build only, never in the browser).
- Strings: `t(key, vars)` in `apps/web/src/lib/strings.ts` returns the Sanity value if set, otherwise the code default from `apps/studio/schemaTypes/lib/uiStringDefaults.ts` (import it; do not copy it). Placeholders such as `{reference}` are filled by `t`. A missing key logs a build warning.
- Emails read `uiStrings` at send time (cached 5 minutes).

## Seed (DEMO)

`seed/tem-seed.tar.gz` (import format) and `seed/sanity/data.ndjson` (readable): `siteSettings`, `uiStrings` (all 69 keys), three vehicle classes (`demo-sedan`, `demo-suv`, `demo-van`, matching the SQL seed), the home page and four legal pages, 7 neutral DEMO images. Rebuild with `node --experimental-strip-types scripts/build-sanity-seed.mjs`. Import: prompt 02.

## UI string keys (69)

Placeholders in `{braces}` are filled by the app.

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
| emails | `email.confirmation.cancelLink` | To cancel, use this link: {cancelUrl} |
| emails | `email.reminder.subject` | Reminder: your transfer is tomorrow ({reference}) |
| emails | `email.reminder.body` | This is a reminder of your booking {reference} on {pickupAt}. |
| emails | `email.cancelled.subject` | Your booking {reference} was cancelled |
| emails | `email.cancelled.body` | Your booking {reference} has been cancelled. |
| emails | `email.refunded.body` | A refund of {amount} has been issued to your card. |
| emails | `email.lateRefund.subject` | Your payment for {reference} was refunded |
| emails | `email.lateRefund.body` | Your payment arrived after the vehicle hold ended and the vehicle was no longer free, so we refunded it in full. |
| emails | `email.office.new.subject` | New booking {reference} |
| emails | `email.office.cancelled.subject` | Booking cancelled {reference} |
