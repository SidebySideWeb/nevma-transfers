import 'server-only';
import { ZodError } from 'zod';
import { BookingError } from '../booking/types';
import { toAnswers, type Answer } from '../forms/answers';
import {
  contactSchema,
  isFormKey,
  transferRequestSchema,
  vipSecuritySchema,
  zodFields,
  type FormKey,
  type SchemaCtx,
} from '../forms/schemas';
import { createSanityClient } from '../sanity/client';
import { getSiteSettings } from '../sanity/content';
import { FORM_BY_KEY_QUERY, VEHICLE_CLASSES_QUERY } from '../sanity/queries';
import { t } from '../strings';
import { bookingDb } from './db';
import { sendEmailResult } from './email';
import { formConfirm, formOffice } from './email-templates';
import { assertRateLimit } from './rate-limit';
import {
  createSubmission,
  newSubmissionId,
  patchSubmissionEmailStatus,
  type SubmissionDoc,
} from './sanity-write';
import { verifyTurnstile } from './turnstile';

export type FormDoc = {
  _id: string;
  key: FormKey;
  title: string;
  recipientEmail: string;
  topics?: { key: string; label: string; recipientEmail?: string | null }[] | null;
  retentionMonths?: number | null;
};

type ParsedBody = Record<string, unknown>;

export type FormSubmitResult = {
  ok: boolean;
  status?: number;
  redirect?: string;
  submissionId?: string;
  error?: string;
  message?: string;
  fields?: Record<string, string>;
  flashValues?: Record<string, string>;
};

type CompanyInfo = { companyName: string; companyPhone: string; companyEmail: string };

type FormCatalog = {
  forms: Partial<Record<FormKey, FormDoc>>;
  zones: { code: string; name: string }[];
  classes: { key: string; name: string }[];
  company: CompanyInfo;
};

const formCache = new Map<string, { value: FormDoc; expiresAt: number }>();
const CACHE_MS = 5 * 60 * 1000;

let catalogOverride: FormCatalog | null = null;
let rateLimitFn: typeof assertRateLimit | null = null;

export function setFormCatalog(catalog: FormCatalog | null): void {
  catalogOverride = catalog;
  formCache.clear();
}

export function setFormRateLimit(fn: typeof assertRateLimit | null): void {
  rateLimitFn = fn;
}

export function clearFormCache(): void {
  formCache.clear();
}

export async function loadForm(key: FormKey): Promise<FormDoc> {
  if (catalogOverride?.forms[key]) return catalogOverride.forms[key]!;
  const hit = formCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value;
  const client = createSanityClient();
  const doc = await client.fetch(FORM_BY_KEY_QUERY, { key });
  if (!doc?.key || !doc.recipientEmail) {
    throw new BookingError('invalid_request', {
      stringKey: 'form.error.generic',
      message: 'form_missing',
    });
  }
  const id =
    (await client.fetch<string | null>(`*[_type == "form" && key == $key][0]._id`, { key })) ||
    `form-${doc.key}`;
  const value: FormDoc = {
    _id: id,
    key: doc.key as FormKey,
    title: doc.title ?? doc.key,
    recipientEmail: doc.recipientEmail,
    topics: (doc.topics ?? [])
      .filter((t): t is { key: string; label: string; recipientEmail: string | null; _key: string } =>
        Boolean(t?.key && t?.label),
      )
      .map((t) => ({
        key: t.key,
        label: t.label,
        recipientEmail: t.recipientEmail,
      })),
    retentionMonths: doc.retentionMonths,
  };
  formCache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

async function loadZones(): Promise<{ code: string; name: string }[]> {
  if (catalogOverride) return catalogOverride.zones;
  const { rows } = await bookingDb().query<{ code: string; name: string }>(
    `select code, name from public.zones where active order by sort_order, code`,
  );
  return rows;
}

async function loadClasses(): Promise<{ key: string; name: string }[]> {
  if (catalogOverride) return catalogOverride.classes;
  try {
    const client = createSanityClient();
    const rows = await client.fetch<{ key: string | null; name: string | null }[]>(
      VEHICLE_CLASSES_QUERY,
    );
    return (rows ?? [])
      .filter((r): r is { key: string; name: string } => Boolean(r.key && r.name))
      .map((r) => ({ key: r.key, name: r.name }));
  } catch {
    return [];
  }
}

async function loadCompany(): Promise<CompanyInfo> {
  if (catalogOverride) return catalogOverride.company;
  const settings = await getSiteSettings();
  return {
    companyName: settings.companyName,
    companyPhone: settings.phone,
    companyEmail: settings.email,
  };
}

function turnstileFrom(body: ParsedBody): string {
  const v = body['cf-turnstile-response'] ?? body.turnstileToken;
  return typeof v === 'string' ? v : '';
}

function studioLink(formKey: FormKey, submissionId: string): string {
  const base = (
    import.meta.env.PUBLIC_STUDIO_URL ||
    process.env.PUBLIC_STUDIO_URL ||
    'https://tem-protection.sanity.studio'
  ).replace(/\/$/, '');
  return `${base}/structure/forms;submissions-${formKey}-new;${submissionId}`;
}

export function valuesForFlash(body: ParsedBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'website' || k === 'cf-turnstile-response' || k === 'turnstileToken') continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

export async function submitForm(
  formParam: string,
  body: ParsedBody,
  opts: { ip?: string },
): Promise<FormSubmitResult> {
  if (!isFormKey(formParam)) {
    return { ok: false, status: 404, error: 'invalid_request', message: t('error.invalid_request') };
  }
  const formKey = formParam;

  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { ok: true, redirect: `/thank-you/${formKey}` };
  }

  const zones = await loadZones();
  const classes = await loadClasses();
  const formDoc = await loadForm(formKey);
  const schemaCtx: SchemaCtx = {
    zoneCodes: zones.map((z) => z.code),
    classKeys: classes.map((c) => c.key),
    topicKeys: (formDoc.topics ?? []).map((tpc) => tpc.key),
    timeZone: 'Europe/Athens',
  };

  const pickupPlaceRaw = body.pickupPlace;
  const dropoffPlaceRaw = body.dropoffPlace;
  const bodyForSchema = { ...body };
  delete bodyForSchema.pickupPlace;
  delete bodyForSchema.dropoffPlace;
  delete bodyForSchema.pickupPlaceId;
  delete bodyForSchema.pickupLat;
  delete bodyForSchema.pickupLng;
  delete bodyForSchema.dropoffPlaceId;
  delete bodyForSchema.dropoffLat;
  delete bodyForSchema.dropoffLng;

  let parsed:
    | ReturnType<ReturnType<typeof transferRequestSchema>['parse']>
    | ReturnType<ReturnType<typeof vipSecuritySchema>['parse']>
    | ReturnType<ReturnType<typeof contactSchema>['parse']>;
  try {
    if (formKey === 'transfer-request') parsed = transferRequestSchema(schemaCtx).parse(bodyForSchema);
    else if (formKey === 'vip-security') parsed = vipSecuritySchema(schemaCtx).parse(bodyForSchema);
    else parsed = contactSchema(schemaCtx).parse(bodyForSchema);
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldsRaw = zodFields(e);
      const fields: Record<string, string> = {};
      for (const [k, code] of Object.entries(fieldsRaw)) {
        fields[k] = code === 'form.error.email' ? t('form.error.email') : t('form.error.required');
      }
      return {
        ok: false,
        status: 400,
        error: 'invalid_request',
        message: t('error.invalid_request'),
        fields,
        flashValues: valuesForFlash(body),
      };
    }
    throw e;
  }

  if (!(await verifyTurnstile(turnstileFrom(body), opts.ip))) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_request',
      message: t('error.invalid_request'),
      fields: { turnstile: t('error.invalid_request') },
      flashValues: valuesForFlash(body),
    };
  }

  // Playwright sets FORM_E2E_MOCK; never honour it under Vitest (unit tests need real write path).
  const e2eMock =
    !process.env.VITEST &&
    (import.meta.env.FORM_E2E_MOCK === '1' || process.env.FORM_E2E_MOCK === '1');
  if (!e2eMock) {
    try {
      const limit = rateLimitFn ?? assertRateLimit;
      await limit(`form:${formKey}:${opts.ip || 'unknown'}`, 3600, 5);
    } catch (e) {
      if (e instanceof BookingError && e.message === 'rate_limit') {
        return { ok: false, status: 429, error: 'invalid_request', message: t('error.invalid_request') };
      }
      throw e;
    }
  }

  const topic =
    formKey === 'contact' && 'topic' in parsed ? (parsed as { topic: string }).topic : undefined;
  const topicRow = topic ? formDoc.topics?.find((x) => x.key === topic) : undefined;
  const recipient =
    (topicRow?.recipientEmail && topicRow.recipientEmail.trim()) || formDoc.recipientEmail;

  const answersPayload =
    formKey === 'transfer-request'
      ? ({ ...parsed, pickupPlace: pickupPlaceRaw, dropoffPlace: dropoffPlaceRaw } as unknown as typeof parsed)
      : parsed;
  const answers: Answer[] = toAnswers(formKey, answersPayload, {
    zoneNames: Object.fromEntries(zones.map((z) => [z.code, z.name])),
    classNames: Object.fromEntries(classes.map((c) => [c.key, c.name])),
    topicLabels: Object.fromEntries((formDoc.topics ?? []).map((x) => [x.key, x.label])),
    timeZone: 'Europe/Athens',
  });

  const name = String((parsed as { name: string }).name);
  const emailAddr = String((parsed as { email: string }).email);
  const phone =
    'phone' in parsed && (parsed as { phone?: string }).phone
      ? String((parsed as { phone?: string }).phone)
      : undefined;

  const submissionId = newSubmissionId();
  const doc: SubmissionDoc = {
    _id: submissionId,
    _type: 'formSubmission',
    status: 'new',
    form: { _type: 'reference', _ref: formDoc._id },
    formKey,
    topic,
    submittedAt: new Date().toISOString(),
    name,
    email: emailAddr,
    phone,
    answers,
    consent: true,
  };

  const company = await loadCompany();

  // Playwright / local: skip Sanity write + Resend after validation (AC-27).
  if (e2eMock) {
    return {
      ok: true,
      redirect: `/thank-you/${formKey}`,
      submissionId: submissionId,
    };
  }

  let writeOk = false;
  try {
    await createSubmission(doc);
    writeOk = true;
  } catch {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'sanity_write_failed',
        formKey,
        id: crypto.randomUUID().slice(0, 8),
      }),
    );
  }

  const office = formOffice({
    formTitle: formDoc.title,
    name,
    answers,
    studioUrl: studioLink(formKey, submissionId),
    ...company,
  });
  const confirm = formConfirm({
    formTitle: formDoc.title,
    name,
    answers,
    ...company,
  });

  const officeResult = await sendEmailResult({
    to: recipient,
    subject: office.subject,
    html: office.html,
    text: office.text,
    tag: 'form_office',
    reference: formKey,
    replyTo: emailAddr,
  });
  await sendEmailResult({
    to: emailAddr,
    subject: confirm.subject,
    html: confirm.html,
    text: confirm.text,
    tag: 'form_confirm',
    reference: formKey,
  });

  if (writeOk) {
    try {
      await patchSubmissionEmailStatus(submissionId, officeResult.ok ? 'sent' : 'failed');
    } catch {
      /* ignore */
    }
  }

  if (!writeOk && !officeResult.ok) {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'form_submit_failed',
        formKey,
        id: crypto.randomUUID().slice(0, 8),
      }),
    );
    return { ok: false, status: 500, error: 'invalid_request', message: t('form.error.generic') };
  }

  return {
    ok: true,
    redirect: `/thank-you/${formKey}`,
    submissionId: writeOk ? submissionId : undefined,
  };
}
