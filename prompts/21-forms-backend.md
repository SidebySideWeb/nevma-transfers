# 21 — Forms back end: submissions in Sanity, emails, spam, retention

Needs: 15 (write token), kit 1 prompts 06 (rate limits, Turnstile) and 08 (email). Produces: `POST /api/forms/[form]` and the retention cron. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/FORMS.md` (all of it), `docs/ACCEPTANCE.md` (AC-27 to AC-30) and `.cursor/rules/50-api-security-payments.mdc` first. Tests first.

1. `src/lib/forms/schemas.ts`: one strict zod schema per form exactly as the field tables in `docs/FORMS.md` (types, required fields, limits, conditional rules such as `fromOther` when `fromZone = other`, `toZone` vs `fromZone`, date in the future, Athens local time converted with `localToInstant` from kit 1). Export `FormKey`.
2. `src/lib/forms/answers.ts`: `toAnswers(form, data, ctx): { key; label; value }[]` — labels from `t()`, values human-readable (zone names from the catalog, class names from Sanity, "Yes"/"No", local date "Tue 1 Dec 2026, 10:00 (Athens)"), in field order.
3. `src/lib/server/sanity-write.ts`: a Sanity client with `SANITY_WRITE_TOKEN` (server only; import guard), `createSubmission(doc)` with `_id: submission-${crypto.randomUUID()}` using `create` (not drafts), and `deleteSubmissionsOlderThan(formKey, isoDate, batch = 100)`.
4. `src/pages/api/forms/[form].ts` implementing the pipeline in `docs/FORMS.md` steps 1–10 exactly (honeypot `website`; Turnstile; `hit_rate_limit('form:<key>:<ip>', 3600, 5)`; recipient by topic; submission; office email with reply-to and the Studio link `PUBLIC_STUDIO_URL`; confirmation email; `emailStatus` patched on the submission; 303 for form posts, JSON for `Accept: application/json`). On validation failure with a form post, redirect back to the page with the errors and values in a short-lived signed cookie (no personal data in the URL) so the no-JS form can re-render them.
5. Email templates in `email-templates.ts` (kit 1): `formOffice` and `formConfirm`, wording from `email.form.*`, answers as a two-column table plus a text part.
6. `src/pages/api/cron/form-retention.ts` (Bearer `CRON_SECRET`): for each `form`, delete submissions older than `retentionMonths`; log counts only. Add to `vercel.json`: `{ "path": "/api/cron/form-retention", "schedule": "0 3 * * 1" }`.

Tests (Vitest; Sanity and Resend mocked at the HTTP edge; Turnstile mocked):
- AC-27: one valid post per form → one `create` call with the expected `formKey`, `answers` labels and values, `status: new`; office email to the form recipient (contact topic `vip-security` → `security@example.com`); confirmation to the sender; 303 to `/thank-you/<form>`; JSON variant returns `{ ok: true }`.
- AC-27: Sanity write fails → office email still sent, response success, error logged with an id; both fail → `form.error.generic`.
- AC-28: honeypot filled → 303 to the thank-you page, no Sanity call, no email; bad Turnstile → 400; 6th post in an hour → 429.
- AC-30: fixtures dated 25 and 23 months ago with retention 24 → only the first is deleted; no `CRON_SECRET` → 401.
- Validation: each required field missing → the matching field error key; `toZone = fromZone` (both not `other`) rejected; a non-existent local time rejected.
- Logs contain no names, emails, phones or message text (assert on the captured log output).

Check (run and report pass/fail):
- Tests pass; a real post per form on a preview deployment creates a submission visible in the Studio under the right form and status "New", and both emails arrive.
- AC-29: `pnpm build` then grep the client output for the write token value (do not print it): absent.

Commit: `feat(forms): submissions in Sanity, emails, spam protection, retention`
