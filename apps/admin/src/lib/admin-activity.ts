import type { SupabaseClient } from '@supabase/supabase-js';

/** Best-effort audit row. Never throws to the caller. */
export async function logAdminActivity(
  supabase: SupabaseClient,
  input: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from('admin_activity').insert({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      detail: input.detail ?? {},
    });
  } catch {
    /* table may be missing before 0027 */
  }
}
