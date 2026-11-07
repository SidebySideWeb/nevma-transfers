# Service-area polygons

| File | Area | Notes |
| --- | --- | --- |
| `attica.geojson` | Mainland Attica | Includes Athens airport (LGAV), Piraeus, Rafina and Lavrio. Islands (Aegina, Salamina, …) are **outside**. |

## Source and simplification

- Drawn from the **Hellenic Cadastre / open Attica administrative outline**, simplified by hand for booking (not a legal cadastral boundary).
- Simplified to **under 300** ring vertices (Douglas–Peucker-style manual reduction) so point-in-polygon stays cheap on every quote.
- Coordinates are WGS84 `[longitude, latitude]` (GeoJSON order).

When you replace the file, keep the Feature `properties.id` = `attica` and re-run `packages/geo` tests (Syntagma, airport, Piraeus, Kifisia, Sounio inside; Corinth, Chalkida, Aegina, Thessaloniki outside).
