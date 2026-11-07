# Feature switches (`@tem/features`)

Shared by `apps/web`, `apps/admin` and `apps/studio` (read-only). Spec: `docs/BOOKING-V2-PLAN.md` §2. Implementation: `packages/features`.

A switch is **on** only for the exact string `"true"`. Missing or any other value (`false`, `TRUE`, `1`, `yes`) means **off**.

Call `features()` on the server. Expose `publicFeatures(features())` to the browser (booleans, `pricingMode`, `whatsappNumber` only — never keys). Gate Astro routes with `notFoundUnless(features().someFlag)`.

## Switches

| Switch / env | Default | Depends on | Shows / hides |
| --- | --- | --- | --- |
| `PRICING_MODE` | `zones` | `distance` / `hybrid` need `FEATURE_DISTANCE_PRICING` (+ its keys); else falls back to `zones` | How a trip is priced: fixed zones only, distance rules, or hybrid (zone route when present, else distance) |
| `FEATURE_DISTANCE_PRICING` | off | `GOOGLE_MAPS_SERVER_KEY`, `QUOTE_SIGNING_SECRET` | Distance pricing: Attica (`@tem/geo`), Places restriction, Routes + `route_cache`, `/api/geo/check`, `@tem/pricing` + signed `/api/quote` + quote checkout (B3), Admin → Pricing v2. Without keys the switch stays off and an error is logged |
| `FEATURE_DEMAND_PRICING` | off | distance pricing | Demand factor on quotes (cap in pricing settings). Off if distance pricing is off |
| `SERVICE_AREA` | `attica` | `packages/geo/areas/<name>.geojson` | Which service-area polygon rejects out-of-area addresses (`inServiceArea`) |
| `FEATURE_PLACES` | off | Places API key (existing) | Formal autocomplete switch for booking/request forms |
| `FEATURE_RETURN_TRIP` | off | — (works in every pricing mode) | “Add return” in the booking widget; linked bookings; return discount |
| `FEATURE_FLIGHT_TRACKING` | off | `FLIGHT_PROVIDER`; `FLIGHT_PROVIDER_KEY` unless provider is `manual` | Flight number checks, ETA shifts, admin flight card, office alerts |
| `FEATURE_CORPORATE` | off | — | `/business` login, companies, company prices, pay on account, statements |
| `FEATURE_DRIVERS` | off | — | Admin Drivers / Reports, `/api/driver/v1`, trip status, statements, driver emails |
| `FEATURE_WHATSAPP` | off | `WHATSAPP_NUMBER` matching `^[1-9]\d{7,14}$` | WhatsApp first in contact UI, floating button, email block, manage-booking card |

## Keys (never `PUBLIC_`)

| Variable | Used when |
| --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | Distance pricing / Routes |
| `QUOTE_SIGNING_SECRET` | Signed fixed quotes |
| `FLIGHT_PROVIDER` | `aerodatabox` \| `flightaware` \| `manual` |
| `FLIGHT_PROVIDER_KEY` | Non-`manual` flight providers |
| `WHATSAPP_NUMBER` | WhatsApp click-to-chat links |

## Admin nav

`ADMIN_NAV` in `@tem/features` is declarative. Each item or group may set `feature`. `filterAdminNav(features())` drops those whose switch is off (and empty groups). With every switch off there is no Drivers group and no Pricing v2 items (Rates, Quote simulator); Zone prices / Hourly rates / Extras stay.
