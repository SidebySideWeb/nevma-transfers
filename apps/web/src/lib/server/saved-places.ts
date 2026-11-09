import 'server-only';
import { bookingDb } from './db';

export type SavedPlaceHit = {
  id: string;
  label: string;
  address: string;
  placeId: string | null;
  lat: number;
  lng: number;
  kind: string;
};

/** PUBLIC places matching a typed query (widget suggestions). */
export async function searchPublicPlaces(q: string, limit = 8): Promise<SavedPlaceHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  try {
    const { rows } = await bookingDb().query<{
      id: string;
      label: string;
      address: string;
      place_id: string | null;
      lat: number;
      lng: number;
      kind: string;
    }>(`select * from public.search_saved_places($1, $2)`, [trimmed, limit]);
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      address: r.address,
      placeId: r.place_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
      kind: r.kind,
    }));
  } catch {
    return [];
  }
}

/**
 * Pinned PUBLIC places for an empty pick-up/drop-off field.
 * Prefer airport → Piraeus → Acropolis → Sounio → Syntagma, then other pins.
 */
export async function pinnedPublicPlaces(limit = 8): Promise<SavedPlaceHit[]> {
  try {
    const { rows } = await bookingDb().query<{
      id: string;
      label: string;
      address: string;
      place_id: string | null;
      lat: number;
      lng: number;
      kind: string;
    }>(
      `select id, label, address, place_id, lat, lng, kind
         from public.saved_places
        where is_public and not hidden and pinned
        order by
          case
            when kind = 'airport' then 0
            when kind = 'port' and label ilike '%piraeus%' then 1
            when kind = 'landmark' and label ilike '%acropolis%' and label not ilike '%museum%' then 2
            when kind = 'landmark' and label ilike '%sounio%' then 3
            when kind = 'square' and label ilike '%syntagma%' then 4
            else 10
          end,
          use_count desc,
          label
        limit $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      address: r.address,
      placeId: r.place_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
      kind: r.kind,
    }));
  } catch {
    return [];
  }
}
