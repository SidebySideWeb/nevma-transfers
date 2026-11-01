import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { FORM_KEYS } from '../../../lib/forms/schemas';
import { loadForm } from '../../../lib/server/form-service';
import { fail, json } from '../../../lib/server/http';
import { deleteSubmissionsOlderThan } from '../../../lib/server/sanity-write';

export const prerender = false;

function cutoffIso(retentionMonths: number, now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - retentionMonths);
  return d.toISOString();
}

export async function runFormRetention(now = new Date()): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const key of FORM_KEYS) {
    const form = await loadForm(key);
    const months = form.retentionMonths ?? 24;
    const iso = cutoffIso(months, now);
    let deleted = 0;
    let batch = 0;
    do {
      batch = await deleteSubmissionsOlderThan(key, iso, 100);
      deleted += batch;
    } while (batch === 100);
    counts[key] = deleted;
    console.info(
      JSON.stringify({
        level: 'info',
        code: 'form_retention',
        formKey: key,
        deleted,
      }),
    );
  }
  return counts;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const expected = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!expected || auth !== `Bearer ${expected}`) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'unauthorized',
      });
    }
    const counts = await runFormRetention();
    return json({ ok: true, counts });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'unauthorized') {
      return fail(e, 401);
    }
    return fail(e);
  }
};
