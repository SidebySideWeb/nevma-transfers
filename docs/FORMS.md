# Forms — kit 2

Three forms. The **field sets are fixed in code** (below); labels come from `uiStrings` (area `forms`); title, intro, recipient, topics, thank-you text and retention come from the Sanity `form` document with the same key. Every submission is stored in Sanity as a `formSubmission` and emailed.

## Pipeline (`POST /api/forms/[form]`)

1. Parse `application/x-www-form-urlencoded` or JSON. Unknown `form` key → 404.
2. Honeypot: a visually hidden text field `website`; if filled → respond exactly as success (303 to the thank-you page) but store nothing and send nothing (AC-28).
3. Validate with the zod schema for the form (strict; trims strings; limits below). Errors → re-render the form page with values and errors (no-JS) or `400` JSON `{ error: 'invalid_request', fields }` (JS).
4. Turnstile (`cf-turnstile-response`) → failure is `invalid_request`.
5. Rate limit: 5 submissions per hour per IP and per form (reuses `hit_rate_limit` from prompt 06).
6. Load the `form` document (cached 5 min). Recipient = topic recipient (contact) or `recipientEmail`.
7. Create the `formSubmission` with the **write token** (`SANITY_WRITE_TOKEN`, Editor robot, server only): `_id = submission-<uuid>`, `status = new`, `formKey`, `form` reference, `topic`, `submittedAt`, `name`, `email`, `phone`, `answers[] {key, label, value}` (label = the uiStrings label at submit time; values as displayed, for example zone names, local date "Tue 1 Dec 2026, 10:00 (Athens)", "Yes"/"No"), `consent`.
8. Email the recipient (`email.form.office.subject`, all answers, link to the submission in the Studio `https://<studio-host>/structure/forms;submissions-<form>-new;<id>`), reply-to = the sender. Then the confirmation to the sender (`email.form.confirm.*` + a copy of the answers). Record `emailStatus` (`sent` / `failed`) on the submission.
9. If the Sanity write failed but the office email succeeded → still success (log the failure by form and error id). If both failed → `form.error.generic`, nothing lost silently (error logged with id).
10. 303 to `/thank-you/<form>` (no-JS) or `200 { ok: true, redirect }` (JS).

Logs never contain names, emails, phones or message text.

## Field sets

`*` required. Limits: names 120, email 254, phone 40, short text 200, message 4000 characters; numbers are integers.

### `transfer-request` — Request a transfer (`/request-a-transfer`)

| Field | Type | Label key | Rule |
| --- | --- | --- | --- |
| `name`* | text | `form.name` | |
| `email`* | email | `form.email` | |
| `phone`* | tel | `form.phone` | |
| `fromZone`* | select: active zones from Postgres (build time) + `other` | `form.fromZone` | |
| `fromOther` | text | `form.otherPlace` | required when `fromZone = other` |
| `toZone`* | select, same list | `form.toZone` | may equal `fromZone` only if one is `other` |
| `toOther` | text | `form.otherPlace` | required when `toZone = other` |
| `pickupAddress` | text | `form.pickupAddress` | |
| `dropoffAddress` | text | `form.dropoffAddress` | |
| `datetime`* | datetime-local (Athens time) | `form.datetime` | in the future; converted with the kit 1 rules (non-existent time rejected) |
| `passengers`* | number 1–60 | `form.passengers` | |
| `luggage` | number 0–100 | `form.luggage` | |
| `vehicleClass` | select: `any` + class keys with Sanity names | `form.vehicleClass` | |
| `vipSecurity` | checkbox | `form.vipSecurity` | |
| `invoice` | checkbox | `form.invoice` | reveals the four invoice fields (`booking.invoice.*` labels) |
| `message` | textarea | `form.message` | |
| `consent`* | checkbox | `form.consent` | must be checked |

Query parameters prefill it: `/request-a-transfer?from=demo-north&to=demo-port&class=demo-v-class` (used by "Request a quote" links on route pages and by the booking flow's no-price block).

### `vip-security` — VIP security enquiry (`/vip-security`)

| Field | Type | Label key | Rule |
| --- | --- | --- | --- |
| `name`*, `email`*, `phone`* | | `form.name`, `form.email`, `form.phone` | |
| `serviceType`* | text | `form.serviceType` | |
| `date` | date | `form.date` | today or later |
| `place` | text | `form.place` | |
| `people` | number 1–1000 | `form.people` | |
| `message` | textarea | `form.message` | |
| `consent`* | checkbox | `form.consent` | |

### `contact` — Contact (`/contact`)

| Field | Type | Label key | Rule |
| --- | --- | --- | --- |
| `name`*, `email`* | | | |
| `phone` | tel | `form.phone` | |
| `topic`* | select from `form.topics` | `form.topic` | key must exist in the form document |
| `message`* | textarea | `form.message` | |
| `consent`* | checkbox | `form.consent` | |

## Retention (AC-30)

`GET /api/cron/form-retention` (Vercel Cron, weekly, `CRON_SECRET`): for each form, delete `formSubmission` documents with `submittedAt` older than `retentionMonths` (DEMO 24). Deletes in batches of 100 with the write token; logs counts only.

## Privacy

The dataset is private; the site's read token is a Viewer token and never reaches the browser, the write token exists only in `apps/web` server code. Submissions are personal data: the privacy policy (client text due Fri 4 Dec) must mention them, their retention, and how to ask for deletion (staff delete the document in the Studio).
