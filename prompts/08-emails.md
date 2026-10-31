# 08 — Emails: confirmation, office notice, reminder, cancellation, late refund

Needs: 07 (or its `onConfirmed` hook); `RESEND_API_KEY` and `RESEND_FROM_EMAIL` with a verified domain; `CRON_SECRET`. Produces: every email in `docs/BOOKING-RULES.md` §10 and the reminder cron. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/BOOKING-RULES.md` §10, `docs/CONTENT-MODEL.md` (email keys) and `docs/ACCEPTANCE.md` (AC-09, AC-13) first. Tests first.

1. `src/lib/server/email.ts`: `sendEmail({ to, subject, html, text, tag })` through Resend from `RESEND_FROM_EMAIL`; one retry on a 5xx; failures are logged with the booking reference and never thrown back into the payment flow.
2. `src/lib/server/email-templates.ts`: pure functions returning `{ subject, html, text }` for `confirmation`, `officeNew`, `reminder`, `cancelled` (customer and office variants), `lateRefund`. All wording from `t()` (`email.*` keys) with the Sanity values loaded at send time (cache 5 min). Plain, accessible HTML: one column, max width 600 px, real text (no text in images), company name, contact details from `siteSettings`, inline styles using values copied from `tokens.css` (emails cannot use CSS variables; this is the one allowed exception, keep them in one `emailTheme` object).
   - Confirmation: reference, type, pick-up local time with "(Athens)", route or hours, vehicle class name, passengers, extras with amounts, total, the cancel link and the cancellation window, `email.confirmation.vip` when `vip_security` is true, invoice requested note.
   - Office notice to `siteSettings.bookingNotificationEmail`: the same facts plus customer name, email, phone, notes, flight, invoice details, and a clear "VIP SECURITY" line when flagged; link to the booking in the admin (`PUBLIC_ADMIN_URL/bookings/<reference>`).
3. Wire the hooks from prompt 07: on confirmed → confirmation + office notice; on cancelled → both cancellation emails (with refund amount when any); on late refund → late-refund emails.
4. `GET /api/cron/reminders` (Bearer `CRON_SECRET`): claim bookings in one statement — `update bookings set reminder_sent_at = now() where status in ('confirmed','assigned') and reminder_sent_at is null and pickup_at between now() + interval '23 hours' and now() + interval '25 hours' returning ...` — then send. Add `apps/web/vercel.json` cron: `{ "path": "/api/cron/reminders", "schedule": "*/15 * * * *" }`.

Tests (Resend mocked at the HTTP edge):
- AC-13: each template renders with DEMO strings and placeholders filled (snapshot of the text part); confirmation includes the cancel link; two concurrent reminder runs send exactly one email per booking; a cron call without the secret → 401.
- AC-09: confirmation and office notice contain the VIP lines only when flagged.
- A Resend failure after payment does not change the booking status.

Check (run and report pass/fail):
- Tests pass.
- A demo booking (Viva demo) sends the confirmation and the office notice to real inboxes; both read correctly on a phone; the cancel link opens the cancel page.
- Text parts exist for every email; no email contains a full card number or any token other than the cancel link.

Commit: `feat(email): booking emails and reminder cron`
