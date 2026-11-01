# 22 — Forms on the pages, quote prefill, thank-you pages

> **Superseded for the look (1 Nov 2026).** The website must be an exact port of `design/v2/build`. If you have not run this prompt yet, run `v2-exact/` V2-5 instead for every visual part, and take only the behaviour, data and test steps from here. If you already ran it, `v2-exact/` replaces its markup and styles.

Needs: 20, 21. Produces: the three forms rendered in `FormBlock`, working with and without JavaScript, the request form prefill, and `/thank-you/[form]`. ~1 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; the older `design/screens/` wireframes only show structure and string keys.

Read `AGENTS.md`, `docs/FORMS.md`, `docs/PAGES.md` (kit 2), `.cursor/rules/40-scripts-a11y.mdc` and open `design/screens/vip-security.html`, `contact.html`, `request-a-transfer.html`, `thank-you.html` at 390 px and 1440 px first. Tokens only; all labels via `t()`.

1. `FormBlock.astro` renders the form by `form.key` with a per-form field component: `TransferRequestFields.astro`, `VipSecurityFields.astro`, `ContactFields.astro` — exactly the fields in `docs/FORMS.md` with visible labels, `(optional)` marks (`form.optional`), `autocomplete` attributes, the honeypot (`.hp`, `tabindex="-1"`, `aria-hidden`), consent checkbox linking `/privacy`, the Turnstile widget, and the submit button (`form.submitLabel` or `form.submit`).
   - Zones and classes for the request form come from the build-time catalog and `getPublishableClasses()`; contact topics from `form.topics`.
   - `<form method="post" action="/api/forms/<key>">` works without JavaScript; server-side re-render of values and errors from the signed cookie (prompt 21).
2. Progressive enhancement (`src/scripts/forms.ts`, vanilla, loaded only on pages with a form): inline validation on blur and submit using the same rules as the server where simple (required, email, number ranges); on submit: disable the button and show `form.sending`, POST with `Accept: application/json`, on success go to the returned redirect, on 400 show field errors and an error summary at the top (focused, links to fields), on other errors show `form.error.generic`.
   - Request form: show the "other place" inputs only when `other` is chosen; show the invoice fields only when the invoice box is ticked; prefill from `?from=&to=&class=` (ignore unknown values).
3. `src/pages/thank-you/[form].astro` (`getStaticPaths` for the three keys, `noindex`): `form.successTitle` (focused heading), `form.successMessage`, links home and to `/book`.
4. Kit 1's `/booking/not-completed` and the no-price block already link to the request form (prompt 19); check the prefill works from both.

Tests:
- Playwright, JS on and off (`javaScriptEnabled: false`): AC-27 each form submits and lands on its thank-you page (Sanity and Resend mocked in the test server); errors re-render with values kept and focus on the summary.
- AC-26: `/request-a-transfer?from=demo-north&to=demo-port&class=demo-v-class` shows those values selected.
- AC-33/AC-19: axe clean on the three form pages and the thank-you pages; the whole form completes by keyboard.
- AC-34: lint passes.

Check (run and report pass/fail):
- Tests pass; forms match the wireframes at 390 px and 1440 px; no client bundle contains a Sanity token.

Commit: `feat(forms): form blocks, prefill and thank-you pages`
