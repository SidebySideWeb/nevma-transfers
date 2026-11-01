# Website design: Elite Protection V2

The website's design is the Elite Protection V2 design, chosen by the user on 1 Nov 2026. It lives in `design/v2/`:

| Folder | What |
| --- | --- |
| `design/v2/index.html` | Overview of the 17 templates with thumbnails |
| `design/v2/pages/` | Every template as a working web page (open in a browser; links, dropdowns, booking flow, gallery, FAQ and mobile menu respond to clicks). `pages/images/` has the 30 photos and the logo, `pages/assets/fonts/` the Jost and Playfair Display woff2 files |
| `design/v2/screenshots/` | Full-page images: desktop (1440 px) and `phone-*` (390 px) |
| `design/v2/extra/` | Boards added after the design for decisions taken later: `08b-book-hourly` (hourly hire and final prices) |
| `design/v2/source/` | The original canvas files (`.dc.html`), for reference only |

The pages are a **visual target, not code**: build them as Astro components with tokens from `design/tokens.css` (the V2 values), text from Sanity (`uiStrings`, pages, vehicle classes) and data from the API. Do not copy the preview's inline styles or `runtime.js`.

## Route → design

| Route | Design page | Notes |
| --- | --- | --- |
| `/` | `01-home` | Quick-booking widget: add the Transfer / By the hour switch as on `extra/08b-book-hourly` |
| `/fleet` | `02-fleet` | Filters (All, Saloons, Vans) from the class `tagline`/type; cards from `vehicleClass` + "From" prices |
| `/fleet/[key]` | `03-vehicle` | Gallery from `vehicleClass.photos`, vehicle switcher across classes |
| `/services` | `04-services` | Booking options, featured route with per-class prices, FAQ |
| `/routes/[slug]` | `04-services` (featured route block) | No own board: hero with the route photo + the featured-route price block + FAQ + CTA, same components |
| `/vip-security` | `05-vip-security` | Enquiry form = kit 2 VIP security form |
| `/about` | `06-about` | "[year]" comes from Sanity (DEMO until supplied) |
| `/contact` | `07-contact` | Contact form with topics (kit 2) |
| `/book` | `08-book` (+ `extra/08b-book-hourly`) | Four steps: journey, vehicle (20-minute hold, "HELD FOR" timer), details (VIP security switch, invoice block), review and pay |
| hold expired (in `/book`) | `11-hold-expired` | |
| `/booking/confirmed` | `09-thank-you` | Shown after the Viva success return; confirmation comes from the webhook (page polls status) |
| `/booking/not-completed` | `10-payment-failed` | |
| `/request-a-transfer` | `12-request-transfer` | Kit 2 transfer request form |
| `/thank-you/[form]` | `13-request-received` | One template for the three forms |
| `/booking/find` | `14-find-my-booking` | |
| `/booking/manage/[token]` | `15-manage-booking` | |
| `/booking/cancel/[token]` | `16-cancel-booking` | |
| `/privacy`, `/cookies`, `/terms`, `/cancellation` | `17-legal` | |
| `/404`, `/500` | (none) | Use the `10-payment-failed` layout with the error strings |

## Where the site differs from the design (decisions taken after it)

1. **Final prices (1 Nov).** Every price is shown VAT included. Remove "excl. 24% VAT", "Prices exclusive of 24% VAT" and the VAT line in the sticky summary; the summary says `booking.priceNote` ("Final price per vehicle, VAT included"); the footer says "All prices include VAT". The VAT share appears only as the price analysis on the review step and in the confirmation email (`docs/BOOKING-RULES.md` §2). See `extra/08b-book-hourly`.
2. **Hourly hire.** A Transfer / By the hour switch above the zones on the journey step and in the home widget. By the hour: pick-up zone + hours stepper (min and max per class, from the admin), drop-off address becomes "Itinerary (optional)", the summary line reads "V-Class · 4 hours × €90". See `extra/08b-book-hourly`.
3. **Booking references** look like `EP-7K3QX2`, not `EP-2026-0417`.
4. **Viva hand-off.** The "Taking you to Viva" screen is a short interstitial while the order is created, then the browser goes to Viva; there is no outcome chooser.
5. **Prices in the design** (airport €150–€180, hourly €60–€90) are before VAT and only indicative. They are seeded as DEMO; whether €180 is the final price or €180 + VAT is a client question (O19).
6. **Placeholders** in the design ("[price]" for VIP security, "[year]", refund amounts, office address) come from Sanity or the admin and stay DEMO until supplied.
7. **Contact numbers:** `siteSettings.phone` (+30 210 970 6967) and `siteSettings.mobilePhone` (+30 698 181 0410), `siteSettings.email` (info@eliteprotection.gr).
8. **Photos:** the 30 images are in the Sanity seed (vehicle galleries, page heroes, routes). Several are third-party or brand-book mock-ups: replace any that the client does not own or license before launch. The logo is a PNG (`pages/images/logo-white.png`); ask the client for an SVG.

## Building blocks to make once (apps/web/src/components)

Header (logo, nav, phone, Book button; mobile menu), footer (three columns, both phones, email), `Button` (gold, line), eyebrow and display headings (Playfair, italic accent in gold), `ZoneSelect` (brand dropdown, select-only combobox as in the admin `Select`, with the swap button), underline `Field`, `Stepper` (passengers, luggage, hours), `TripTypeSwitch`, `VehicleCard`, `Gallery` (with keyboard and swipe), `PriceTable` (per class), `FeatureList` (i., ii., iii.), `Faq` (accordion, `button` + `aria-expanded`), `StepIndicator` (1. Journey … 4. Payment), `HoldTimer`, `SummaryCard` (sticky; photo, route, date, people, lines, total), `VipSwitch`, `InvoiceBlock`, `StatusBadge`, `Timeline` (manage page), `Notice` (success, failure, expired). Motion: buttons lift 2 px with a gold shadow; photos zoom slowly on hover (900 ms); reduced motion removes both.

## Accessibility and quality bar

WCAG 2.2 AA (the token pairs are checked by `scripts/contrast.test.mjs`); every interactive part of the preview must also work by keyboard and screen reader; no horizontal scroll at 390 px; images with real alt text from Sanity; Lighthouse performance ≥ 90 on mobile for `/`, `/fleet`, `/book` with `astro:assets` image sizes and `loading="lazy"` below the fold.
