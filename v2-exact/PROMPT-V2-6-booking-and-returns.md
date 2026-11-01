# V2-6 — Booking flow and the return pages, exact

Needs: V2-5. Produces: `/book` (four steps + Viva hand-off), confirmed, not completed, hold expired, request received, find / manage / cancel, 404 / 500, all identical to the design; the `/dev/v2/*` preview routes. ~2 days.

--- PROMPT ---

Read `docs/DESIGN-V2.md` (all of it: final prices, hourly, references, Viva hand-off), `docs/DESIGN-V2-BLOCKS.md` and `docs/BOOKING-RULES.md`. Open in `design/v2/build/`, at 1440 and 390 px:

- the booking flow: `08-book.html`, `08-book-1-open.html`, `08-book-2.html`, `08-book-3.html`, `08-book-3-options.html`, `08-book-4.html`, `08-book-4-viva.html`;
- the return pages: `09-thank-you.html`, `10-payment-failed.html`, `11-hold-expired.html`, `13-request-received.html`, `14-find-my-booking.html`, `15-manage-booking.html`, `16-cancel-booking.html`;
- `design/v2/extra/08b-book-hourly.jpg`.

Click through `design/v2/pages/08-book.html`. **Keep all booking behaviour, API calls, the hold, Viva, polling, string keys and tests from kit 1 and the front-end kit.** Only the markup, CSS classes and text sources change. Port the markup exactly (see "The rule").

1. `BookingHero.astro` (`appHero` of `08-book*`):
   - The title per step: `booking.search.title`, `booking.vehicle.title`, `booking.details.title` and `booking.review.title`.
   - The "{vehicle} held for" badge with the hold timer (`booking.hold.badge`, mm:ss, `aria-live="polite"` once a minute, not every second).
   - The step indicator. It shows "1." to "4." with `booking.step.*`, and "✓ " before the done steps. Done steps are buttons that go back. `aria-current="step"` marks the current step.
2. Steps, each ported from its `appBody`:
   - **Journey** (`08-book`, open dropdown `08-book-1-open`). Put `data-v2-extra` on the hourly switch's wrapper so the fidelity test compares the rest:
     - The Transfer / By the hour switch from `extra/08b-book-hourly`, built from the design's own classes.
     - Zones with the brand dropdown and the swap button; addresses, date, time and flight.
     - Passenger and luggage steppers, or the hours stepper (class min and max).
     - "See vehicles & prices", and the quote link `booking.quoteLink`.
   - **Vehicle** (`08-book-2`):
     - The intro `booking.vehicle.intro`, with the route in bold as in the design.
     - One row per class: photo, kind, name, `booking.vehicle.seatsBags`, and available or not (`booking.vehicle.available` / `unavailable`; unavailable rows are disabled with the design's opacity).
     - The final price with `booking.vehicle.priceNote` ("VAT included") where the design says "excl. 24% VAT".
     - Back, and `booking.vehicle.continue`.
   - **Details** (`08-book-3`, and `08-book-3-options` with VIP on and the invoice block open):
     - Fields and the VIP add-on card with its switch (`role="switch"`, `aria-checked`).
     - The invoice toggle (`aria-expanded`) and the invoice fields.
     - The terms checkbox (`booking.terms` with the two links to `/legal#terms` and `/legal#privacy`), Back, and `booking.review.submit`.
   - **Review** (`08-book-4`):
     - The four review rows with "Edit" buttons that go to their step.
     - The secure payment box (`booking.payBox.*`), the pay button `booking.pay`, Back, and the "Secured by Viva" line.
     - The price analysis from prompt 27 (`booking.review.priceAnalysis`, net, VAT, total) goes inside the summary's price lines, using the classes of the design's price lines.
   - **Viva hand-off** (`08-book-4-viva`) is a modal over the page while the order is created, then the browser goes to Viva.
     - Drop the "Prototype: choose the Viva outcome" part and its two buttons; keep "Back to review" until the redirect starts.
     - Focus moves into the modal, which has `role="dialog"` and `aria-modal`.
3. `BookingSummary` (the sticky card on the right; under the steps at 390 px, as in the phone screenshot):
   - The photo, `booking.summary.suggested` on step 1 ("Mercedes-Benz" after), the route with ↓, date and time, passengers and luggage.
   - The lines: `booking.summary.line`, the escort line with `booking.summary.escortNote` while the escort price is unset.
   - **Steps 1–3:** total only, with `booking.priceNote`.
   - **Step 4:** the price analysis.
   - "Need help?" and the phone.
4. Return pages: `StatusHero.astro` (the `appHero` of `09`/`10`/`11`/`13`/`14`/`15`/`16`, with the eyebrow, the heading using `tAccent`, the lead and the badge where the design has one), plus one body component per page:
   - **Confirmed** (`09`):
     - Reference and sent-to; the journey; "What happens next" with four steps; the buttons.
     - The paid box with the price analysis, the invoice link and "Questions? 24/7".
     - Keep the status polling. While waiting, show `booking.confirmed.waiting` in the lead.
   - **Not completed** (`10`): the booking card with "Held for" and the timer, Try again, Choose another vehicle, and the help line.
   - **Hold expired** (`11`): the booking card, Start again, Call us, and the late-payment note.
   - **Request received** (`13`, used by `/thank-you/[form]`): Meanwhile / Also links, Back to home, and the urgent line.
   - **Find my booking** (`14`): the form with kit 1's lookup behaviour, plus the two side notes.
   - **Manage** (`15`):
     - Route, vehicle, passengers, luggage and lead passenger.
     - The status timeline, from the booking status, with the `manage.timeline.*` titles and texts.
     - The paid box, the Manage links, and `manage.changesByPhone`.
     - The status badge uses `manage.status.*`.
   - **Cancel** (`16`): the booking card, the refund box (the amount from the cancellation policy), "Yes, cancel booking" and "Keep my booking".
   - **404/500**: `StatusHero` + the `10` body layout with the error strings.
5. `/dev/v2/[state].astro` (only when `import.meta.env.DEV` or `PUBLIC_V2_PREVIEW=1`, otherwise 404, and never in the sitemap). It renders the components above with the design's sample data, so the fidelity test can compare them. The states are `book-1`, `book-2`, `book-3` (VIP on, invoice open), `book-4`, `confirmed`, `not-completed`, `hold-expired`, `request-received`, `find-booking`, `manage` and `cancel`.
   - Use the design's sample values: Athens International Airport (AIA) → Athens, Tue 17 Nov 2026, 14:30, 2 passengers, 2 bags, V-Class, reference `EP-2026-0417`, timer 18:42 (book) and 09:12 (not completed), and the design's prices.
   - Freeze the timers in this route.
   - Remove the `test.fixme` marks in `v2-fidelity.spec.ts` and run the preview with `PUBLIC_V2_PREVIEW=1`.

Tests:
- The existing booking tests (AC-01 … AC-17, the kit 2 and prompt 25/27 tests) pass unchanged in behaviour. Update only selectors and texts that changed with the new markup, and list them for me.
- Vitest: the step indicator's back navigation and `aria-current`; the summary shows the price analysis only on step 4; the hold badge's `aria-live` updates once a minute; the hand-off modal traps focus.
- Playwright: complete a transfer and an hourly booking in Viva demo mode through the new pages; `grep` the built HTML for "excl." and "exclusive of": nothing.

Check (run and report pass/fail):
- `v2-fidelity.spec.ts` passes for all eleven `/dev/v2/*` cases at 1440 and 390 px. Paste the per-block table.
- axe (serious, critical) is clean on `/book` (each step), `/booking/confirmed`, `/booking/not-completed`, `/booking/find` and `/legal`.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): booking flow and return pages in the exact V2 design`
