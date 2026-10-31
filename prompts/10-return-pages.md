# 10 — Return pages: confirmed, not completed, cancel

Needs: 06, 07 (Fake provider is enough to build). Produces: `/booking/confirmed`, `/booking/not-completed`, `/booking/cancel/[token]`. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/PAGES.md`, `docs/API.md` (`booking-status`, `bookings/pay`, `bookings/cancel`), `docs/BOOKING-RULES.md` §6–§7 and open `design/screens/confirmed.html`, `not-completed.html`, `cancel.html` first. All three routes render on demand (`prerender = false`), are `noindex`, send `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (the URLs carry codes and tokens).

1. `/booking/confirmed`: reads `s` (order code) from the query. Server-render the "confirming" state; a small vanilla script polls `GET /api/booking-status?s=` every 3 s for up to 2 minutes, then switches to the confirmed state (`booking.confirmed.title`, `booking.confirmed.body` with the reference) and moves focus to the heading. After 2 minutes without confirmation: a calm message that the email will follow and the phone number. Never show personal data. The page itself changes nothing in the database (AC-06).
2. `/booking/not-completed`: reads the order code if present; if the visitor's booking is still `pending` with a live hold, show the remaining time and "Try again" (`POST /api/bookings/pay`, then the hand-off screen) and "Choose another vehicle" (`/book#vehicle`, releasing the hold); otherwise `booking.hold.expired` and "Start again".
3. `/booking/cancel/[token]`: server-side, hash the token and load the booking (reference, local pick-up time, route or hours, refundable amount under the DEMO policy). Unknown or used token → a neutral "This link is no longer valid" with contact details. Outside the window → `booking.cancel.tooLate` and contact details. Inside → summary and a danger button `booking.cancel.confirm` posting to `POST /api/bookings/cancel` with Turnstile; on success show `booking.cancel.done` and focus it.

Tests:
- Playwright: AC-06 visiting `/booking/confirmed?s=<code>` for a pending booking keeps it pending and shows "confirming"; after a simulated webhook the page flips to confirmed by itself.
- AC-12: cancel page inside the window cancels once; reloading the link shows "no longer valid"; outside the window shows the too-late message.
- AC-19: axe clean on all three pages; focus lands on the heading after state changes.

Check (run and report pass/fail):
- Tests pass; headers `Cache-Control: no-store` and `Referrer-Policy: no-referrer` present on all three routes.
- Pages match the wireframes at 390 px and 1440 px.

Commit: `feat(book): confirmation, not-completed and cancel pages`
