import type { APIRoute } from 'astro';
import { BookingError } from '../../../../lib/booking/types';
import {
  companyStatementCsv,
  corporateOff,
  failMember,
  requireMember,
} from '../../../../lib/server/corporate';

export const prerender = false;

/** The browser fetches this with the Bearer token and saves the blob (a plain link cannot send it). */
export const GET: APIRoute = async ({ request, params }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    const id = String(params.id ?? '');
    const file = /^[0-9a-f-]{36}$/i.test(id) ? await companyStatementCsv(member, id) : null;
    if (!file) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'unknown_statement',
      });
    }
    return new Response(file.csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${file.name}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return failMember(e);
  }
};
