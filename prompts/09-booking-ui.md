# 09 — The booking flow: `/book`, four steps

Needs: 03, 06 (07 for real payment). Produces: the React island on `/book` matching the wireframes. ~2.5 days.

--- PROMPT ---

Read `AGENTS.md`, `docs/PAGES.md` (`/book`), `docs/API.md` (public endpoints), `docs/BOOKING-RULES.md` §1–§4 and §8, `.cursor/rules/40-scripts-a11y.mdc`, and open `design/v2/pages/08-book.html` at 390 px and 1440 px first. Match them; tokens only; every string through `t()` (pass the resolved strings into the island as a prop from the Astro page so the island ships no Sanity client).

1. `src/pages/book.astro` (prerendered, `noindex`): BaseLayout + `<BookingApp client:load strings={...} turnstileSiteKey={...} />`.
2. `src/components/booking/`: `BookingApp.tsx` (one `useReducer`: `step`, `search`, `quote`, `hold`, `details`, `booking`, `errors`), `StepSearch.tsx`, `StepVehicle.tsx`, `StepDetails.tsx`, `StepReview.tsx`, `HoldTimer.tsx`, `Handoff.tsx`, `api.ts` (typed fetch wrappers for the endpoints; they never send amounts), `format.ts` (re-export `formatEuro`, `formatLocal` from `lib/booking`).
3. Step behaviour exactly as `docs/PAGES.md`:
   - Search: Transfer / By the hour toggle (radio group); zones from `/api/booking-options`; drop-off hidden for hourly, hours select limited to the union of class limits with the hint; date-time input in Athens time (label says so); passengers and luggage.
   - Vehicle: cards from the quote; unavailable greyed with the reason; `no_price` → contact block with `siteSettings` phone and email; Select → Turnstile (invisible or managed) → `POST /api/holds`.
   - Details: hold timer from `expiresAt` (re-sync with the server time from the response `Date` header); addresses; flight; contact; notes; extras including VIP security (unchecked by default, label + price + hint); invoice block; consent; Continue → `POST /api/bookings`.
   - Review: lines and total **from the booking response**; Pay securely → hand-off screen → `location.assign(checkoutUrl)` after 600 ms with a visible fallback link.
   - Back from Details → `DELETE /api/holds/:id`. Hold expiry → `booking.hold.expired`, back to Vehicle with details kept.
   - Steps in the URL hash so the browser back button moves between steps.
4. Accessibility: focus the step `h1` on each step change; error summary at the top of a form with links to fields, focused on submit; `aria-invalid` + `aria-describedby`; timer announced politely at most once a minute and at 2 minutes; everything usable by keyboard; 44 px targets.
5. Loading and errors: buttons show progress and are disabled while a request runs (no double submit); API errors show the server message; network failure shows a retry.

Tests:
- Vitest + Testing Library: reducer transitions; hourly hides drop-off; VIP unchecked by default and adds a line; no request body contains `price`, `amount`, `total` or `Cents` (spy on fetch).
- Playwright (phone 390×844 and desktop 1440×900) against the dev server with the Fake payment provider: AC-01 full transfer booking to the hand-off; hourly booking for 4 h; AC-16 no-price pair shows the contact block; AC-04 hold expiry (set `hold_minutes` to 1 in the test database) returns to Vehicle with details kept; AC-19 axe on each step has no serious or critical issues and the whole path completes with the keyboard only.

Check (run and report pass/fail):
- Tests pass on both viewports.
- Visual comparison with the wireframes at 390 and 1440: same order and hierarchy, no horizontal scroll.
- `/book` JS (gzip) under 100 KB: report the number from the build output.
- No Sanity or Supabase client code in the client bundle.

Commit: `feat(book): booking flow island`
