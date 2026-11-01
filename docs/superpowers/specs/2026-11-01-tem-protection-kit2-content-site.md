# TEM Protection — Kit 2: content site and fuller CMS (spec)

> Brand note (1 Nov 2026): the site brand is **Elite Protection**, decided by the user. "TEM Protection" below was the working name; booking references are `EP-` (migration 0009). The kit docs outside this folder use the final names.

Date: 2026-11-01. The user asked to start building kit 2 directly; the choices below marked PROPOSED are Claude's defaults and can change. Builds on kit 1 (`2026-10-31-tem-protection-booking-core-design.md`, section 9b).

## Scope

Same repo, same Sanity Studio, same tokens. Nothing in kit 1 is rebuilt; no database migration.

| Route | Content | Source |
| --- | --- | --- |
| `/fleet` | intro + one card per vehicle class with "from" price | `page` (slug `fleet`) + `vehicleClass` + Postgres |
| `/fleet/[key]` | photos, description, specs, capacity, from prices for featured routes, Book button | `vehicleClass` + Postgres |
| `/services` | intro + service blocks (airport transfers, hourly hire, VIP security, events) + route list | `page` (slug `services`) |
| `/routes/[slug]` | route landing page: intro, duration, from price per class, FAQ, Book button pre-filled with the zone pair | `route` + Postgres |
| `/vip-security` | presentation, what is included, enquiry form, contact details | `page` (slug `vip-security`) + `form` `vip-security` |
| `/about` | company story | `page` (slug `about`) |
| `/contact` | contact details, contact form with topics | `page` (slug `contact`) + `form` `contact` |
| `/request-a-transfer` | quote request for trips with no online price or special needs | `page` (slug `request-a-transfer`) + `form` `transfer-request` |
| `/thank-you/[form]` | thank-you per form | `form.successMessage` |

Header navigation: Fleet, Services, VIP security, About, Contact, Book now. Footer gains the same links.

## Decisions (PROPOSED unless marked)

1. **"From" prices** on fleet, vehicle and route pages: the lowest current price for the route/class (transfers) or the hourly rate (hourly), read from Postgres with the service role **at build time**. A Sanity switch `siteSettings.showFromPrices` (default on) hides them all. After saving prices, rates, extras, zones or classes, the admin shows "Prices changed: update the website", a button that calls the `tem-web` Vercel deploy hook (disabled for 2 minutes after use). An automatic debounce was rejected: serverless instances share no memory. The booking flow always uses live prices.
2. **Forms in Sanity** (as decided by the user for Nevma Music on 29 Oct): three `form` documents (`transfer-request`, `vip-security`, `contact`) hold the editable wording, recipient email, success message, retention months and (contact) topics with their own recipients. Field sets per form are fixed in code (kit 2 lists them); labels come from `uiStrings` area `forms`. Every submission is a `formSubmission` document (id `submission-<uuid>`) written by the server with an **Editor robot token** (`SANITY_WRITE_TOKEN`, server only), with status `new` / `in-progress` / `done` and an internal note.
3. **Form pipeline:** `POST /api/forms/[form]` → zod validation → honeypot → Turnstile → rate limit → create `formSubmission` → email the recipient (Resend) → confirmation email to the sender → 303 to `/thank-you/<form>`. A failed email never loses the submission; a failed Sanity write still emails the office and returns success only when at least one of the two succeeded.
4. **Retention:** a weekly cron `/api/cron/form-retention` deletes submissions older than the form's `retentionMonths` (DEMO 24).
5. **Routes** are Sanity documents keyed by Postgres zone codes (`fromZone`, `toZone`). The route page shows prices only for pairs that exist in Postgres; a route whose codes do not exist is reported by the admin banner and excluded from the build with a warning.
6. **Page model:** `page.kind` gains `standard` (About, Services, Fleet intro, VIP security, Contact, Request a transfer). New section types: `featureGrid`, `imageText`, `steps`, `vehicleClassList`, `routeList`, `contactDetails`, `formBlock`.
7. **Webhook rebuild filter** extends to `route` and `form`; `formSubmission` never triggers a rebuild.
8. **SEO:** each route page targets "<from> to <to> transfer"; JSON-LD `Service` per route and per vehicle class page with `offers.lowPrice` only when prices are shown; `BreadcrumbList` on fleet and route pages.
9. **No fabricated content:** no testimonials or review stars until the client supplies real ones.

## Acceptance (AC-25 to AC-34)

AC-25 from prices match Postgres and disappear when the switch is off · AC-26 route page Book button opens `/book` with the zone pair filled · AC-27 every form stores a submission, emails the recipient and confirms to the sender · AC-28 honeypot/Turnstile/rate limit block spam without storing it · AC-29 submissions stay private: private dataset, no Sanity token in any browser bundle, the site's Viewer read token cannot write, the write token exists only in `apps/web` server code · AC-30 retention cron deletes only expired submissions · AC-31 after a price change the admin offers "update the website", which calls the deploy hook once and is disabled for 2 minutes · AC-32 route with unknown zone codes is excluded and reported · AC-33 every new page passes axe, has unique title/description/canonical, and is in the sitemap · AC-34 no hard-coded copy: all new labels from `uiStrings` area `forms`/`site`.

## Delivery

Overlay zip: updated `apps/studio`, `seed/`, `design/`, `docs/`, `prompts/15..24`, `scripts/` tests. Copied over the kit 1 repo; prompts run in order.
