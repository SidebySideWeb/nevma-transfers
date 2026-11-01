# V2-3 — Home, exact

Needs: V2-2. Produces: `/` identical to `design/v2/build/01-home.html`, with the content from Sanity and prices from the API. ~1 day.

--- PROMPT ---

Read `docs/DESIGN-V2.md` ("The rule" and "Where the site differs"), `docs/DESIGN-V2-BLOCKS.md` and `docs/BOOKING-RULES.md` §2. Open `design/v2/build/01-home.html` at 1440 and 390 px, the eight files in `design/v2/build/blocks/01-home/`, `design/v2/pages/01-home.html` (to try the interactions) and `design/v2/extra/08b-book-hourly.jpg`.

Finish these components in `src/components/v2/blocks/` by porting their block file line by line. Keep every element and class; replace only the content.

1. `PageHero.astro` (layout `home`): eyebrow, heading, lead, two buttons, background photo (`--bg-image`).
   - Quick-booking widget, exactly as the `<form aria-label="Quick booking">` in the block file. Labels from `site.quick.*`.
   - From/To are the brand dropdown: the button + listbox pattern in `08-book-1-open.html` (`aria-haspopup="listbox"`, `aria-expanded`, `aria-activedescendant`, arrows, Home/End, type-ahead, Enter/Space, Escape), with a hidden native `<select>` for no-JS. The zones come from `/api/booking-options`.
   - Swap button, date, time, passengers. "See prices" goes to `/book` with the query string.
   - Add the Transfer / By the hour switch from `extra/08b-book-hourly` above the zones. Build it from the classes the widget already uses: copy the closest existing element (the dropdown button) and adjust only the content. With "By the hour" the To field becomes Hours (stepper, min and max per class). Put `data-v2-extra` on the switch's wrapper: the fidelity test hides it and compares the rest with the design.
   - `widgetNote` under the widget.
2. `PromiseStrip.astro`: the four items (mark, title, text).
3. `DivisionCards.astro` (layout `home`): heading block + two cards with photo, label, title, text and link.
4. `FleetShowcase.astro`:
   - Class tabs from the published `vehicleClass` documents, in order. Only classes that are online in the admin, the same filter as `getPublishableClasses()`.
   - The card for the selected class: photo, "Mercedes-Benz", name, kind, blurb, seats, luggage, airport price and hourly price + minimum. Final prices come from the API (`priceLabel()`).
   - "Book the {name}" goes to `/book?class=<key>`; "Vehicle details" goes to `/fleet/<key>`. Then the footnote.
   - Tabs: `role="tablist"`, arrow keys, and the same visual states as the design. The panel changes without a page reload.
5. `HowItWorks.astro`: numerals `i.`–`iv.` generated from the index.
6. `OnBoard.astro` (layout `feature`): badge, photo, four items numbered `01`–`04`.
7. `QuoteBlock.astro`: the quote, wrapped in curly quotes by the component, then the caption.
8. `CtaPanel.astro` (layout `large`): the phone button label `{phone}` becomes the formatted office number, with a `tel:` link.

Prices: wherever the design shows "€180" you show the final price from the API in the same element. Wherever it shows "excl. 24% VAT", the Sanity or `uiStrings` text now says "VAT included". Do not add or remove elements for this.

Tests:
- Vitest: the dropdown keyboard behaviour (open, arrows, Home/End, type-ahead, Enter, Escape, focus return), the hidden select keeps the value, the swap button, the switch changing To ↔ Hours and the query string.
- Vitest: the fleet tabs show only publishable classes, in order.

Check (run and report pass/fail):
- `v2-fidelity.spec.ts` passes for `/` at 1440 and 390 px. Every block is within its pixel limit and the text matches. Paste the per-block table. If a block fails, open `test-results/v2-diff/*-design.png` and `*-site.png`, fix the markup, and run it again. Don't loosen the limits.
- axe (serious, critical) is clean on `/` at 390 and 1440 px, and there is no horizontal scroll at 390 px.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): home page in the exact V2 design`
