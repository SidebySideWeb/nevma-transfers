# Website design: Elite Protection V2

The website's design is the Elite Protection V2 design, chosen by the user on 1 Nov 2026. It lives in `design/v2/`:

| Folder | What |
| --- | --- |
| `design/v2/build/` | **The code to port.** Every page and state of the design as clean static HTML with one stylesheet, `v2.css`. Pixel-identical to the design at 1440 and 390 px (checked). No scripts, no inline styles. Each block carries `data-block="<name>"` |
| `design/v2/build/blocks/<page>/NN-<block>.html` | The same pages cut into one file per block: the markup for one Astro component |
| `design/v2/build/web/v2.css` | `v2.css` with production paths (`/images/v2/…`) and every photo overridable with `--bg-image` |
| `design/v2/build/text.json` | Every line of text, per page and block (used by the content tests) |
| `design/v2/web-tests/v2-fidelity.spec.ts` | The Playwright check that compares the site with the build, block by block |
| `design/v2/pages/` | The original interactive export (open in a browser to try dropdowns, steps, gallery, FAQ, mobile menu). `pages/images/` has the 30 photos and the logo, `pages/assets/fonts/` the woff2 files |
| `design/v2/screenshots/` | Full-page images: desktop (1440 px) and `phone-*` (390 px) |
| `design/v2/extra/` | Boards for decisions taken after the design: `08b-book-hourly` (hourly hire and final prices) |
| `design/v2/tools/` | The scripts that produced `build/` from `pages/` (maintainers only) |

## The rule: port the markup, do not redraw it

The site is built by **porting `design/v2/build`**, not by drawing the screenshots again:

1. `design/v2/build/web/v2.css` is copied unchanged to `apps/web/src/styles/v2.css` and loaded on every public page. Its class names (`s17762`, `bgx1`, `display xl`, `btn btn-gold`, …) are generated and must be kept exactly: **never rename, merge, "clean up" or replace them with tokens or Tailwind**. Tokens stay for the admin and for new parts the design does not have.
2. Each block file in `design/v2/build/blocks/` becomes one Astro component with **the same elements, the same nesting, the same classes and the same `data-block` attribute**. Only the text, links, images and repeated items change: they come from Sanity (`page.sections`, `vehicleClass`, `siteSettings`, `uiStrings`) and the booking API.
3. Pages set `<body class="pg-<design file>">` (for example `pg-01-home`), because some rules in `v2.css` are scoped per design page.
4. A photo from Sanity goes on the element that has the design photo, as `style="--bg-image:url(<sanity url>)"` (background photos) or as the `src` of the same `<img>`.
5. Behaviour (dropdowns, steppers, gallery, FAQ, mobile menu, booking steps) is added with small scripts or Astro islands that toggle the same classes and ARIA attributes the static states show (`08-book-1-open` shows an open dropdown, `01-home-navopen` the open mobile menu, `08-book-3-options` the VIP switch on and the invoice block open, `08-book-4-viva` the hand-off modal).
6. A page or block is done only when `v2-fidelity.spec.ts` passes for it at 1440 and 390 px: same blocks in the same order, height within 2%, pixels within 0.1% per block with photos blanked on both sides (0.6% only in blocks where final prices replace the design's prices), same text after the allowed changes below. A 1 px change in a heading size or a button's padding fails it.

The full block list, with the Sanity type and the component name for each, is in `docs/DESIGN-V2-BLOCKS.md`.

## Route → design

| Route | Design page (`design/v2/build/…`) | Notes |
| --- | --- | --- |
| `/` | `01-home` (+ `01-home-navopen`) | Quick-booking widget: add the Transfer / By the hour switch as on `extra/08b-book-hourly` |
| `/fleet` | `02-fleet` | Cards and price table from `vehicleClass` + prices from the API |
| `/fleet/[key]` | `03-vehicle` | Gallery from `vehicleClass.photos`; tabs across classes; sections below from the `vehicle` template page |
| `/services` | `04-services` | |
| `/routes/[slug]` | `04-services` blocks `pageHero` + `featuredRoute` + `faqList` + `ctaPanel` | No own board |
| `/vip-security` | `05-vip-security` | Enquiry form = kit 2 VIP security form |
| `/about` | `06-about` | |
| `/contact` | `07-contact` | Contact form with topics (kit 2) |
| `/book` | `08-book`, `08-book-2`, `08-book-3`, `08-book-3-options`, `08-book-4`, `08-book-4-viva` (+ `extra/08b-book-hourly`) | Four steps |
| hold expired (in `/book`) | `11-hold-expired` | |
| `/booking/confirmed` | `09-thank-you` | Page polls the status |
| `/booking/not-completed` | `10-payment-failed` | |
| `/request-a-transfer` | `12-request-transfer` | Kit 2 transfer request form |
| `/thank-you/[form]` | `13-request-received` | One template for the three forms |
| `/booking/find` | `14-find-my-booking` | |
| `/booking/manage/[token]` | `15-manage-booking` | |
| `/booking/cancel/[token]` | `16-cancel-booking` | |
| `/legal` | `17-legal` | The four legal pages on one page, as designed. `/terms`, `/cancellation`, `/privacy`, `/cookies` redirect (301) to `/legal#terms` etc. |
| `/404`, `/500` | `10-payment-failed` layout | With the error strings |

Links in the build point to the design files (`02-fleet.html`); in the site they are the routes above.

## Where the site differs from the design (decisions taken after it)

These are the only allowed differences; the fidelity test knows them.

1. **Final prices (1 Nov).** Every price is shown VAT included. "excl. 24% VAT" / "Prices exclusive of 24% VAT" become "VAT included" / "Prices include 24% VAT" (the seed and `uiStrings` already say so). The sticky summary on steps 1–3 shows only the lines and the total with `booking.priceNote`; the VAT share appears only on the review step (price analysis) and in the confirmation email (`docs/BOOKING-RULES.md` §2). Prices come from the booking database.
2. **Hourly hire.** A Transfer / By the hour switch above the zones on the journey step and in the home widget, drawn as `extra/08b-book-hourly` and built from the same classes as the zone fields.
3. **Booking references** look like `EP-7K3QX2`, not `EP-2026-0417`.
4. **Viva hand-off.** `08-book-4-viva` without the "Prototype: choose the Viva outcome" part: a short interstitial while the order is created, then the browser goes to Viva.
5. **Placeholders** ("[price]" for VIP security, "[year]", refund amounts, office address, legal wording) come from Sanity or the admin and stay as written until the client supplies them.
6. **Contact numbers** from `siteSettings.phone`, `siteSettings.mobilePhone`, `siteSettings.email`.
7. **Photos:** the design photos are in the seed and in `public/images/v2/` as fallbacks. Several are third-party or brand-book mock-ups: replace any that the client does not own or license before launch. Logo: `pages/images/logo-white.png`; ask the client for an SVG.

## Accessibility and quality bar

WCAG 2.2 AA; every interactive part must also work by keyboard and screen reader (the static states show the ARIA attributes to toggle); no horizontal scroll at 390 px; real alt text from Sanity; Lighthouse performance ≥ 90 on mobile for `/`, `/fleet`, `/book` (`astro:assets` or the Sanity image URL with width parameters for `<img>`; `loading="lazy"` below the fold). The CSP needs `style-src 'self' 'unsafe-inline'` for the `--bg-image` photo variables.
