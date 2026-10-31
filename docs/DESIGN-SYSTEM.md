# Design system — neutral baseline

Decided 31 Oct 2026: the kit ships a neutral, premium baseline. When the client sends the TEM Protection brand (logo, colours, fonts; due Fri 6 Nov), only `tokens.css` changes. Reference: `design/index.html` (12 wireframe screens, checked at 390 px and 1440 px with no overflow and zero serious axe issues).

## Files

| File | Use |
| --- | --- |
| `design/tokens.css` | the only place values live; copy to `apps/web/src/styles/tokens.css` and `apps/admin/src/styles/tokens.css` (prompt 03) |
| `design/screens/screens.css` | wireframe components; port them as Astro components / CSS modules, keeping class names where helpful |
| `design/screens/*.html` | the visual target per route (`docs/PAGES.md` maps routes to screens) |

## Tokens

| Group | Tokens |
| --- | --- |
| Colour | `--color-bg` ink, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent` brass (buttons, focus), `--color-accent-strong` (hover), `--color-accent-text` (text on accent), `--color-success`, `--color-warning`, `--color-danger`, `--color-overlay` |
| Type | `--font-display` (Inter Tight), `--font-text` (Inter), `--font-mono`; sizes `--text-xs` 13 to `--text-2xl` 32, `--text-3xl` fluid 36–56; `--leading-tight` 1.15, `--leading-normal` 1.55; `--tracking-caps` |
| Space | `--space-1` 4 px … `--space-8` 72 px |
| Shape | `--radius-sm` 6, `--radius-md` 10, `--radius-lg` 16, `--radius-pill`; `--shadow-1`, `--shadow-2` |
| Layout | `--container` 1200 px, `--container-narrow` 720 px (booking flow), `--tap` 44 px |
| Motion | `--ease`, `--dur-fast` 150 ms, `--dur` 240 ms |

Contrast: every text/background pair in use passes WCAG AA 4.5:1 (`scripts/contrast.test.mjs`); keep that test passing when the brand arrives. Fonts: self-host Inter and Inter Tight (woff2, `font-display: swap`) or fall back to the system stack; the brand may replace them.

## Components (from the wireframes)

| Component | Notes |
| --- | --- |
| Header, footer | company name or logo, phone, Book now; footer contact and four legal links, Cookie settings |
| Button | primary (accent, pill, min 44 px), ghost, danger, block; one primary per view |
| Steps | 4 steps, `aria-current="step"` on the active one |
| Segmented toggle | Transfer / By the hour; radio inputs inside labels, wraps on narrow screens |
| Field | visible label, hint, error tied with `aria-describedby`, `aria-invalid` |
| Check row | checkbox + label + right-aligned price; used for extras, VIP security, invoice, consent |
| Vehicle card | photo (16:10), name, tagline, capacity, price, Select; disabled state for unavailable |
| Hold timer | `role="status"`, polite; warning colour for the time |
| Notice | neutral, success, danger variants |
| Summary list | `dl` rows label / value; total row in display type |
| Badge | status colours: success confirmed, warning pending, danger cancelled, accent VIP security |
| Admin shell | side nav (top nav under 1024 px), toolbar of filters, scrollable table in a focusable labelled region, warning banner |

## Rules

- No hex values or raw pixel sizes in components: tokens only.
- Text wraps rather than overflowing: `overflow-wrap: break-word` on text, `anywhere` on headings; flex children get `min-width: 0`.
- Focus is always visible (3 px accent outline). Motion respects `prefers-reduced-motion`.
- Prices display as "€ 70.00"; dates as "Tue 1 Dec 2026, 10:00 (Athens)".
- Wireframe text shows `uiStrings` keys next to defaults; the built site shows only the value.
