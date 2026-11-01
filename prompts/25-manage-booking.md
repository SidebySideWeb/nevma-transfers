# 25 — Find my booking and manage booking (secure links)

Needs: kit 1 prompts 06, 07, 08 and 10 (it changes the confirmation email link and the cancel page entry). Can run before or after kit 2. Produces: `/booking/find`, `/booking/manage/[token]`, the `.ics` download, and the lookup API. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/BOOKING-RULES.md` §7, `docs/API.md` (`/api/bookings/lookup`, manage page, calendar), `docs/PAGES.md` (`/booking/find`, `/booking/manage/[token]`), `docs/ACCEPTANCE.md` (AC-35, AC-36) and the V2 pages `design/v2/pages/14-find-my-booking.html`, `15-manage-booking.html`, `16-cancel-booking.html` (screenshots in `design/v2/screenshots/`) first; use the components from prompt 30. Match the design; tokens only; strings via `t()` (`lookup.*`, `manage.*`, `email.manageLink.*`). Tests first.

1. Manage token: rename nothing in the database. Change the confirmation flow (prompt 07/08) so the email link is `/booking/manage/<token>` (the same token as before, hash in `cancel_token_hash`). `/booking/cancel/[token]` keeps working and is linked from the manage page.
2. `POST /api/bookings/lookup` exactly as `docs/API.md`: zod (reference format `^(EP|TEM)-[A-HJ-NP-Z2-9]{6}$`, email), Turnstile, `hit_rate_limit('lookup-ip:<ip>', 3600, 5)` and `hit_rate_limit('lookup-ref:<reference>', 3600, 3)`, case-insensitive email match on `confirmed`/`assigned` bookings, new token (old link stops working), `email.manageLink.*` email, constant response `{ ok: true }`, equal work when nothing matches.
3. `src/pages/booking/find.astro` (`noindex`): the V2Lookup layout; the form posts with JS (`/api/bookings/lookup`) and without JS (form post → 303 back with `?sent=1`); after submit always show `lookup.sent`.
4. `src/pages/booking/manage/[token].astro` (on demand, `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`): load by token hash on the server; render the V2Manage layout: reference, local pick-up time, status badge (`manage.status.*`), `manage.chauffeurNote`, route or hours, addresses, flight, facts (class, passengers, luggage, type), extras, amounts and paid total, timeline (`manage.timeline.*`: booked → confirmed → assigned → completed, current step highlighted), actions: `manage.requestInvoice` (mailto `siteSettings.email`, subject "Invoice <reference>"), `manage.callOffice` (`tel:`), `manage.addToCalendar` (`./calendar.ics`), `manage.cancel` (→ `/booking/cancel/<token>`, hidden when cancellation is no longer possible), `manage.changesByPhone`. Unknown or cleared token → `manage.linkInvalid` + link to `/booking/find`.
5. `src/pages/booking/manage/[token]/calendar.ics.ts`: iCalendar per `docs/API.md` (CRLF line endings, escaped text, `DTSTAMP`, `UID:<reference>@<site host>`).
6. Footer: add "Find my booking" (`lookup.title`) under Transfers, as in the design.

Tests (names start with the AC id):
- AC-35: matching and non-matching lookups return the same body and status; a match rotates the token (old manage URL → invalid, new one works) and sends one email; the 6th lookup from one IP in an hour → 429; bad Turnstile → 400; logs contain no email or reference.
- AC-36: Playwright on the manage page for a confirmed DEMO booking: all facts present, each action link correct, `.ics` parses (use a small parser) with the right start time across a DST date; after cancelling via the linked page, the manage URL shows `manage.linkInvalid`; axe clean on find and manage pages at 390 and 1440 px.

Check (run and report pass/fail):
- Tests pass; kit 1 booking and cancel tests still pass; the confirmation email now links to the manage page.

Commit: `feat(booking): find my booking and manage booking`
