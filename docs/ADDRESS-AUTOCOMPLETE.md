# Address autocomplete (Google Places)

Decided by the user on 2 Nov 2026 for Elite Protection; built once in the shared code and switched on per deployment. Pick-up and drop-off address fields suggest Google places as the customer types. Free text always stays valid.

## Where

| Form | Fields |
| --- | --- |
| `/book`, journey step | Pick-up address or hotel; drop-off address or hotel (transfers only) |
| `/request-a-transfer` | Pick-up address or hotel; drop-off address or hotel |
| Admin, new office booking | Pick-up address; drop-off address |

Not on the home quick-booking widget (it has zones only).

## Behaviour

1. After 3 letters and 300 ms without typing, the field asks `/api/places/autocomplete` and shows up to 5 suggestions in the brand dropdown list (the zone dropdown's look: `08-book-1-open`). The main line is bold, then the secondary line.
2. Keyboard: Down and Up move, Enter picks, Escape closes and keeps the typed text, Tab leaves. ARIA: `input role="combobox" aria-autocomplete="list" aria-expanded aria-controls aria-activedescendant`, list `role="listbox"`, items `role="option"`. A polite live region says "5 suggestions" once per result set.
3. Picking a suggestion calls `/api/places/details` once. The field shows the suggestion text (for example "Hilton Athens, Vasilissis Sofias 46, Athens, Greece": the hotel name helps the driver), and the form keeps `{ placeId, lat, lng }` in hidden fields.
4. Editing the text after a pick clears the place: the address becomes typed text again.
5. If Google does not answer, is switched off, or the visitor has no JavaScript, the field is the plain text input it was. The booking never depends on Google.
6. Under the list: the Google attribution required by the Places API policies (official "Google Maps" logo asset from Google's attribution guidelines, in the light-on-dark variant), because the results are shown without a Google map.
7. One session token (`crypto.randomUUID()`) per field: created on focus, sent with every autocomplete call and the one details call, renewed after a pick. That is how Google bills one search as one session.

## Server routes (apps/web; apps/admin has the same two behind the staff session)

Both use `@tem/places` (`packages/places`), `Cache-Control: no-store`, same-origin only (check `Origin` against `PUBLIC_SITE_URL` / `PUBLIC_ADMIN_URL`), the existing rate limiter, and return 404 when `PUBLIC_ADDRESS_AUTOCOMPLETE` is not `true` or `GOOGLE_PLACES_API_KEY` is empty.

| Route | Body | 200 | Errors |
| --- | --- | --- | --- |
| `POST /api/places/autocomplete` | `{ input, sessionToken }` | `{ suggestions: [{ placeId, label, main, secondary }] }` | 400 `invalid_request`, 429 `rate_limited` (30 per minute and 300 per day per visitor key), 503 `places_unavailable` |
| `POST /api/places/details` | `{ placeId, sessionToken }` | `{ placeId, address, lat, lng }` | 400 `invalid_request` / `outside_area`, 429 (20 per minute), 503 |

Never log the typed text or the returned address (personal data); log only the error code.

## Booking and form data

- `POST /api/bookings` and the office booking route accept optional `pickupPlace` and `dropoffPlace` (`{ placeId, lat, lng }`), checked with `parsePlace()` and stored with `placeColumns()` in the 0021 columns (kit source called this 0017; this repo already used 0017 for the ELP reference). A drop-off place on an hourly booking is refused (`invalid_request`). The address text is always the text the customer sees and confirms.
- `/request-a-transfer`: the submission's address answers use `addressAnswer()`, so the office sees a Google Maps link in Sanity and in the office email.
- Admin booking page, Today and the drivers' app: "Open in Google Maps" uses `mapsDirectionsUrl()`: the exact place when there is one, the typed text otherwise. Maps URLs are free and need no key.
- Office notification email: each address gets the same Maps link.

## Database (migration 0021)

`bookings.pickup_place_id`, `pickup_lat`, `pickup_lng`, `dropoff_place_id`, `dropoff_lat`, `dropoff_lng`: all three or none per address; place IDs `[A-Za-z0-9_-]`, 10 to 300 characters; coordinates inside a loose Greece box (lat 34 to 42, lng 19 to 30.5); a drop-off place needs a drop-off address. No new staff grants: bookings are written by the server. Tests: `packages/db/tests/places.test.mjs`.

## Google Cloud setup (once per deployment, by the account owner)

1. Google Cloud console: create a project (for example `elite-protection-web`) and link a billing account in the client's name.
2. APIs and services: enable **Places API (New)** only.
3. Credentials: create an API key. API restrictions: Places API (New) only. Application restrictions: none (server calls from Vercel have no fixed IP); the key lives only in the server environment. One key for production, another for preview and development.
4. Quotas (IAM and admin, Quotas, filter "Places API (New)"): cap Autocomplete requests per day (start at 2,000) and Place Details requests per day (start at 500). When a cap is reached, the fields fall back to free text until the next day.
5. Billing, Budgets and alerts: a monthly budget (for example €10) with email alerts at 50%, 90% and 100%.
6. Vercel (web and admin projects): `GOOGLE_PLACES_API_KEY`, `PUBLIC_ADDRESS_AUTOCOMPLETE=true`, optional `PLACES_BIAS_*`. Redeploy.

## Cost

Billed by Google to the client's account, per use above a monthly free allowance per product. Each address search is one session ending in one Place Details Essentials call (fields `id`, `formattedAddress`, `location` only). At the volume of a transfer company this is expected to stay inside the free allowance; the daily caps and the budget alert are the guard. Check the current prices on Google's Maps Platform pricing page before launch.

## Privacy

The privacy policy (Sanity, `privacy` legal document) gets: "When you type an address, the text is sent to Google (Google Maps Platform) to suggest places. We store the address you confirm and, if you pick a suggestion, its Google place reference and map coordinates with your booking."

## Not included

Checking that the address lies inside the chosen zone (needs zone boundaries), maps shown in the site or the admin, distance-based prices, address autocomplete in Greek (the site is English only).
