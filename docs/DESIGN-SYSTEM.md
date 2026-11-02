# Design system — Elite Protection V2

Decided 1 Nov 2026: the site uses the Elite Protection V2 design (near-black, gold, ivory; Playfair Display + Jost; square corners; photo-led). The public website is an exact port of `design/v2/build` with its own stylesheet `v2.css` (`docs/DESIGN-V2.md`, `docs/DESIGN-V2-BLOCKS.md`); tokens do not restyle it. Tokens live only in `design/tokens.css` and are used by the admin and by parts the design does not have. The admin uses the same tokens at work density (`docs/DESIGN-ADMIN.md`).

## Files

| File | Use |
| --- | --- |
| `design/tokens.css` | the only place values live; copy to `apps/web/src/styles/tokens.css` and `apps/admin/src/styles/tokens.css` |
| `design/v2/` | website look and markup (exact port into `apps/web`); preview pages, screenshots, photos, fonts — route mapping in `docs/DESIGN-V2.md` |
| `design/admin/` | admin design kit: `admin.css`, boards for every admin route, components, states |

## Tokens (`design/tokens.css`)

| Group | Tokens |
| --- | --- |
| Colour | `--color-bg` #0A0A0B obsidian, `--color-bg-deep`, `--color-surface` / `--color-surface-2` graphite, `--color-border` gold hairline, `--color-text` ivory, `--color-text-soft`, `--color-muted`, `--color-label` champagne, `--color-faint`, `--color-accent` light gold (buttons, links, focus, prices), `--color-accent-strong` (hover), `--color-accent-deep` gold (dots, rules), `--color-accent-text` (text on gold), `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-overlay`, `--hero-scrim`, `--panel-gradient` |
| Type | `--font-display` Playfair Display (500, 600, italic 500: headings, prices), `--font-text` Jost (300–600: body, tracked caps labels); sizes `--text-xs` 11 … `--text-2xl` 34, `--text-3xl` fluid 40–68; `--tracking-caps`, `--tracking-ui`, `--tracking-eyebrow` |
| Space | `--space-1` 4 px … `--space-8` 112 px |
| Shape | all radii 0 (square corners); `--radius-round` only for dots, radios and the swap button; `--shadow-1` gold glow on button hover, `--shadow-2` dropdowns |
| Layout | `--container` 1320 px, `--container-narrow` 820 px, `--tap` 46 px, `--button-height` 54 px |
| Motion | `--ease`, `--dur-fast` 200 ms, `--dur` 250 ms, `--dur-slow` 900 ms (photo zoom) |

Contrast: every text/background pair in use passes WCAG AA 4.5:1 (`scripts/contrast.test.mjs`). Fonts: self-host the woff2 files from `design/v2/pages/assets/fonts/` (`font-display: swap`; preload Jost 400 and Playfair 500).

## Components

The list of building blocks is in `docs/DESIGN-V2.md` ("Building blocks to make once"). Behaviour notes:

| Component | Notes |
| --- | --- |
| Steps | 4 steps, `aria-current="step"` on the active one |
| Trip type switch | Transfer / By the hour; radio inputs, keyboard operable |
| Field | visible label, hint, error tied with `aria-describedby`, `aria-invalid` |
| Zone and other dropdowns | brand dropdown (select-only combobox) with the native select kept for no-JS |
| Vehicle card | photo, name, type, capacity, price (final, VAT included), Select; disabled state for unavailable |
| Hold timer | `role="status"`, polite; warning colour near the end |
| Summary | `dl` rows label / value; total in display type; "Final price, VAT included" |
| Badge | status colours: success confirmed, warning pending, danger cancelled, accent VIP security |

## Rules

- No hex values or raw pixel sizes in components: tokens only.
- Text wraps rather than overflowing: `overflow-wrap: break-word` on text, `anywhere` on headings; flex children get `min-width: 0`.
- Focus is always visible (2 px gold outline). Motion respects `prefers-reduced-motion`.
- Prices display as "€180.00" (final, VAT included); dates as "Tue 17 Nov 2026, 14:30".
- All text comes from Sanity (`uiStrings`, pages, vehicle classes); the preview's copy is already in the seed where it exists.
