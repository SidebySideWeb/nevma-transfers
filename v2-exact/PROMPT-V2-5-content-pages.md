# V2-5 — Services, routes, VIP Security, About, Contact, Request a transfer, legal

Needs: V2-4 and kit 2 forms (prompts 21, 22). Produces: these pages identical to `04`, `05`, `06`, `07`, `12`, `17`. ~1.5 days.

--- PROMPT ---

Read `docs/DESIGN-V2.md`, `docs/DESIGN-V2-BLOCKS.md` and `docs/FORMS.md`. Open in `design/v2/build/`: `04-services.html`, `05-vip-security.html`, `06-about.html`, `07-contact.html`, `12-request-transfer.html` and `17-legal.html`, at 1440 and 390 px. Also open their block files in `blocks/`, and try the interactive versions in `design/v2/pages/` (FAQ, dropdowns, request form, legal side navigation). Port the markup exactly (see "The rule").

1. Services (`04-services`):
   - `BookingOptions`: fill `{fromTransfer}` and `{fromHourly}` with the lowest final prices from the API.
   - `FeaturedRoute`: one price per class for the referenced route, from the API. Show only classes that have a price. "Book this route" goes to `/book?from=<zone>&to=<zone>`. The note uses an inline link ("request a quote").
   - `Occasions`.
   - `FaqList`: first item open, `button` + `aria-expanded` + `aria-controls`, and the + / − sign as in the design. The office phone goes after the intro when `showPhone` is on.
   - `CtaPanel` (layout `compact`, with its background photo).
2. `/routes/[slug]`: `PageHero` with the route photo and title, then `FeaturedRoute` for this route, the route's FAQ in `FaqList` and a `CtaPanel`. There is no design board for this page: use these blocks unchanged, so the fidelity test does not cover it.
3. VIP Security (`05-vip-security`): `PageHero` (the "Make a confidential enquiry" button goes to `#enquiry`), `FeatureTrio` (band), `ServiceColumns`, `EscortFeature` and `EnquiryForm` (layout `security`).
4. About (`06-about`): `StatsBar`, `DivisionCards` (layout `about`), `FeatureTrio` (section) and `ClientsBlock`.
5. Contact (`07-contact`): `ContactCards` (values from `siteSettings`), then `EnquiryForm` (layout `contact`), with the map placeholder and the "Already booked?" panel.
6. `EnquiryForm.astro`: one component, three layouts, ported from `05-vip-security/05-enquiryForm.html`, `07-contact/03-enquiryForm.html` and `12-request-transfer/02-enquiryForm.html`.
   - The fields, their order and their types come from the kit 2 form. Labels come from `uiStrings` `form.*`, consent from `form.consent.enquiry|message|request` with the privacy link, and submit from `form.submit.security|contact|request`.
   - The topic and service dropdowns are the brand dropdown from V2-3. The request form's passenger and luggage steppers, vehicle choice, VIP switch and invoice toggle use the design's markup.
   - Turnstile goes where the design leaves room above the submit button, and must not change the layout around it.
   - Keep kit 2's validation, error messages, `aria-describedby`, the honeypot and the submission API unchanged.
7. Legal: `/legal` (`17-legal`) renders the `legal` page's `PageHero`, then one `LegalHub` block.
   - The side navigation i.–iv. lists terms, cancellation, privacy and cookies, as anchor links with `aria-current` while scrolling.
   - Then each legal page's `legalDocument` (heading, portable text with `h3`, bold and links).
   - `/terms`, `/cancellation`, `/privacy` and `/cookies` redirect 301 to `/legal#<slug>`. Update the sitemap and the links in the booking flow (`booking.terms.link`, `booking.privacy.link`) and in the forms.

Tests:
- Vitest: FAQ toggle and ARIA; `{fromTransfer}`/`{fromHourly}` filled; featured route hides classes without a price; the legal redirects.
- The existing kit 2 form tests pass unchanged: submissions, Turnstile, honeypot, rate limit.

Check (run and report pass/fail):
- `v2-fidelity.spec.ts` passes for `/services`, `/vip-security`, `/about`, `/contact`, `/request-a-transfer` and `/legal` at 1440 and 390 px. Paste the per-block table.
- Submit each of the three forms on the preview with Turnstile test keys; the submission arrives in Sanity and the office email is sent (Resend test mode).
- axe is clean; no horizontal scroll at 390 px.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): content pages and forms in the exact V2 design`
