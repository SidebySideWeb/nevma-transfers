# Service-area polygons

One GeoJSON Feature per named area. `SERVICE_AREA` (default `attica`) picks which file `inServiceArea` uses.

| File | Covers | Notes |
| --- | --- | --- |
| `attica.geojson` | Central Greece, Attica, Peloponnese, Cyclades | Includes Athens airport (LGAV), Piraeus, Corinth, Nafplio, Lamia, Chalkida, Aegina, and Cyclades (Mykonos, Santorini, Naxos, …). Excludes Crete, Rhodes, Sporades, Ionian islands, Thessaloniki. The Feature `id` stays `attica` so existing `SERVICE_AREA=attica` keeps working. |

Coordinates are `[lng, lat]`, ring closed (first point repeated as last).

When you replace the file, keep `properties.id` = `attica`, copy the ring into `src/areas-data.mjs`, and re-run `packages/geo` tests.
