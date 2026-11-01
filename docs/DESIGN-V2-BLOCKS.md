# V2 blocks: design file → Sanity type → Astro component

Every block of the V2 design is one Astro component in `apps/web/src/components/v2/`, ported from its file in `design/v2/build/blocks/`. Page blocks are driven by a `page.sections[]` item of the same name; `Sections.astro` maps `_type` → component. The markup rules are in `docs/DESIGN-V2.md` ("The rule").

Headings: Sanity `displayHeading` `{ before, accent, after }` renders as the design's `before<br><em>accent</em> after` (look at the block file for where the `<br>` and the spaces go; most headings put the accent on a new line). In `uiStrings`, words between `*asterisks*` are the italic gold accent: `'Thank you. Your transfer *is confirmed.*'`.

Buttons: Sanity `ctaLink` `{ label, target, url }`. Targets: `book` → `/book`, `quote` → `/request-a-transfer`, `fleet`, `services`, `vipSecurity`, `about`, `contact`, `findBooking` → `/booking/find`, `phone` → `tel:` from `siteSettings.phone` (`{phone}` in the label is replaced by the number), `url`. Keep the classes of the design button you replace (`btn btn-gold`, `btn btn-line`, or the text-link classes).

## Shared

| Block (`data-block`) | Design file | Component | Data |
| --- | --- | --- | --- |
| `siteHeader` | `01-home/00-siteHeader.html` (inside each hero), `03-vehicle/01-siteHeader.html` (own section) | `SiteHeader.astro` | `uiStrings` `nav.*`, `siteSettings.phone`. Mobile menu open state: `01-home-navopen` |
| `siteFooter` | `01-home/09-siteFooter.html` | `SiteFooter.astro` | `uiStrings` `site.footer.*`, `siteSettings` |

## Page blocks (Sanity `page.sections`)

| Block / Sanity type | Design file(s) | Component | Notes |
| --- | --- | --- | --- |
| `pageHero` | `01-home/01`, `02-fleet/01`, `04-services/01`, `05-vip-security/01`, `06-about/01`, `07-contact/01`, `12-request-transfer/01`, `17-legal/01` | `PageHero.astro` | `layout` home / page / status. Home: the quick-booking widget (`site.quick.*`, zones from the API) + `widgetNote`. Contains `SiteHeader` like the design |
| `promiseStrip` | `01-home/02` | `PromiseStrip.astro` | |
| `divisionCards` | `01-home/03` (layout home), `06-about/03` (layout about) | `DivisionCards.astro` | |
| `fleetShowcase` | `01-home/04` | `FleetShowcase.astro` | Tabs + featured card from `vehicleClass` (order) and the API prices; `bookLabel` "Book the {name}" |
| `howItWorks` | `01-home/05` | `HowItWorks.astro` | Numerals i.–iv. generated |
| `onBoard` | `01-home/06` (feature), `03-vehicle/04` (grid) | `OnBoard.astro` | Numbers 01–04 generated |
| `quoteBlock` | `01-home/07` | `QuoteBlock.astro` | Curly quotes added by the component |
| `ctaPanel` | `01-home/08` (large), `04-services/06` (compact), `03-vehicle/05` (escort) | `CtaPanel.astro` | |
| `fleetBrowser` | `02-fleet/02` | `FleetBrowser.astro` | Filters All / Vans / Saloons from `vehicleClass.group`, counts generated; card per class |
| `galleryMosaic` | `02-fleet/03` | `GalleryMosaic.astro` | Tile `size` → the design's span classes |
| `priceTable` | `02-fleet/04` | `PriceTable.astro` | Rows from classes + API; notes are portable text with bold |
| `includedList` | `02-fleet/05` | `IncludedList.astro` | |
| `bookingOptions` | `04-services/02` | `BookingOptions.astro` | `{fromTransfer}`, `{fromHourly}` = lowest final prices from the API |
| `featuredRoute` | `04-services/03` | `FeaturedRoute.astro` | Prices per class for the referenced route from the API; "Book this route" → `/book?from=<zone>&to=<zone>` |
| `occasions` | `04-services/04` | `Occasions.astro` | |
| `faqList` | `04-services/05` | `FaqList.astro` | First item open; `button` + `aria-expanded`; phone after the intro when `showPhone` |
| `featureTrio` | `05-vip-security/02` (band), `06-about/04` (section) | `FeatureTrio.astro` | |
| `serviceColumns` | `05-vip-security/03` | `ServiceColumns.astro` | |
| `escortFeature` | `05-vip-security/04` | `EscortFeature.astro` | |
| `statsBar` | `06-about/02` | `StatsBar.astro` | |
| `clientsBlock` | `06-about/05` | `ClientsBlock.astro` | |
| `contactCards` | `07-contact/02` | `ContactCards.astro` | Values from `siteSettings` |
| `enquiryForm` | `05-vip-security/05` (security), `07-contact/03` (contact), `12-request-transfer/02` (request) | `EnquiryForm.astro` | Fields, consent and submit from the kit 2 form + `uiStrings` `form.*`; Turnstile; the side panel from the section |
| `legalDocument` | `17-legal/02` | `LegalHub.astro` | One block with the side navigation (numbered i.–iv.) and the four legal pages' `legalDocument` sections, in the order terms, cancellation, privacy, cookies |

## App blocks (not in Sanity sections; text from `uiStrings`, data from the API)

| Page | Design files | Components |
| --- | --- | --- |
| `/fleet/[key]` | `03-vehicle/02-vehicleTabs`, `03-vehicleHero` | `VehicleTabs.astro`, `VehicleHero.astro` (gallery: arrows, counter `site.vehicle.photoCount`, keyboard and swipe), then the `vehicle` template page's sections |
| `/book` | `08-book*/01-appHero` (title, step indicator, "HELD FOR" badge), `02-appBody` (step content + sticky summary) | `BookingHero.astro`, `JourneyStep`, `VehicleStep`, `DetailsStep`, `ReviewStep`, `VivaHandoff`, `BookingSummary` |
| returns and states | `09`, `10`, `11`, `13`, `14`, `15`, `16` (`appHero` + `appBody`) | `StatusHero.astro` + one body component per page |

The `/dev/v2/[state]` route (development only, 404 in production) renders each app page with the design's sample data, so the fidelity test can compare them without a live booking.
