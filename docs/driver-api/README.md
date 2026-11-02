# Driver API v1

Contract: [`openapi.yaml`](./openapi.yaml). Served by `apps/admin` at `/api/driver/v1`. Auth: `Authorization: Bearer <Supabase access token>` of an active driver. Never uses the service role. Rules: `docs/DRIVERS.md` §8.

## Env

| Variable | Meaning |
| --- | --- |
| `FEATURE_DRIVERS=true` | Module on; otherwise every path is 404 |
| `DRIVER_APP_ORIGIN` | Exact origin allowed for CORS (e.g. `http://localhost:5173`) |
| `DRIVER_EARNINGS_VISIBLE=true` | Allow `GET /earnings` |
| `DRIVER_APP_URL` | Public drivers’ app URL (links later) |

## curl examples

Replace `TOKEN` with a driver access token and `ADMIN` with `http://localhost:4322` (or your admin URL).

```bash
# Me
curl -sS -H "Authorization: Bearer $TOKEN" "$ADMIN/api/driver/v1/me"

# Vehicles available to start the day
curl -sS -H "Authorization: Bearer $TOKEN" "$ADMIN/api/driver/v1/vehicles"

# Start shift
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"vehicleId":"VEHICLE_UUID","odometer":120000}' \
  "$ADMIN/api/driver/v1/shift/start"

# End shift
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"odometer":120210}' \
  "$ADMIN/api/driver/v1/shift/end"

# Jobs today (Athens)
curl -sS -H "Authorization: Bearer $TOKEN" "$ADMIN/api/driver/v1/jobs"

# Jobs for a range (at most 31 days)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ADMIN/api/driver/v1/jobs?from=2026-11-01&to=2026-11-07"

# One job
curl -sS -H "Authorization: Bearer $TOKEN" "$ADMIN/api/driver/v1/jobs/ELP-ABC123"

# Update trip status
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"on_way"}' \
  "$ADMIN/api/driver/v1/jobs/ELP-ABC123/status"

# Earnings (only when DRIVER_EARNINGS_VISIBLE=true)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ADMIN/api/driver/v1/earnings?from=2026-11-01&to=2026-11-30"

# Preflight
curl -sS -X OPTIONS -H "Origin: $DRIVER_APP_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -D - -o /dev/null "$ADMIN/api/driver/v1/me"
```
