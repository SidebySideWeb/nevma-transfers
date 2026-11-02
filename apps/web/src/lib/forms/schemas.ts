import { z } from 'zod';
import { localToInstant } from '../booking/time';
import { BookingError } from '../booking/types';

export const FORM_KEYS = ['transfer-request', 'vip-security', 'contact'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export function isFormKey(value: string): value is FormKey {
  return (FORM_KEYS as readonly string[]).includes(value);
}

const name = z.string().trim().min(1, 'form.error.required').max(120);
const email = z
  .string()
  .trim()
  .min(1, 'form.error.required')
  .email('form.error.email')
  .max(254);
const phone = z.string().trim().min(1, 'form.error.required').max(40);
const phoneOptional = z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || undefined);
const shortText = z.string().trim().max(200);
const message = z.string().trim().max(4000);
const messageRequired = z.string().trim().min(1).max(4000);

/** Form posts send "on"; JSON may send boolean. */
const checkbox = z.preprocess(
  (v) => v === true || v === 'on' || v === 'true' || v === '1',
  z.boolean(),
);

const consent = z.preprocess(
  (v) => v === true || v === 'on' || v === 'true' || v === '1',
  z.literal(true, { message: 'form.error.required' }),
);

function intField(min: number, max: number) {
  return z.coerce.number().int().min(min).max(max);
}

export type SchemaCtx = {
  zoneCodes?: string[];
  classKeys?: string[];
  topicKeys?: string[];
  /** Clock for "in the future" / "today or later". */
  now?: Date;
  timeZone?: string;
};

function futureLocalIssue(local: string, now: Date, timeZone: string): string | null {
  try {
    const instant = localToInstant(local, timeZone);
    if (instant.getTime() <= now.getTime()) return 'form.error.required';
    return null;
  } catch (e) {
    if (e instanceof BookingError) return 'form.error.required';
    return 'form.error.required';
  }
}

export function transferRequestSchema(ctx: SchemaCtx) {
  const zones = new Set([...(ctx.zoneCodes ?? []), 'other']);
  const classes = new Set(['any', ...(ctx.classKeys ?? [])]);
  const now = ctx.now ?? new Date();
  const timeZone = ctx.timeZone ?? 'Europe/Athens';

  return z
    .object({
      name,
      email,
      phone,
      fromZone: z.string().trim().min(1),
      fromOther: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      toZone: z.string().trim().min(1),
      toOther: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      pickupAddress: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      dropoffAddress: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      datetime: z.string().trim().min(1),
      passengers: intField(1, 60),
      luggage: z.preprocess(
        (v) => (v === '' || v == null ? 0 : v),
        intField(0, 100),
      ),
      // V2 request form fields (design/v2 EnquiryForm).
      flight: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      kind: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      vehicleClass: z
        .string()
        .trim()
        .optional()
        .or(z.literal(''))
        .transform((v) => v || 'any'),
      vipSecurity: checkbox.optional().default(false),
      invoice: checkbox.optional().default(false),
      invoiceCompany: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      invoiceVat: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      invoiceTaxOffice: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      invoiceAddress: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      message: message.optional().or(z.literal('')).transform((v) => v || undefined),
      consent,
      website: z.string().optional(),
      'cf-turnstile-response': z.string().optional(),
      turnstileToken: z.string().optional(),
    })
    .strict()
    .superRefine((data, refineCtx) => {
      if (!zones.has(data.fromZone)) {
        refineCtx.addIssue({ code: 'custom', path: ['fromZone'], message: 'form.error.required' });
      }
      if (!zones.has(data.toZone)) {
        refineCtx.addIssue({ code: 'custom', path: ['toZone'], message: 'form.error.required' });
      }
      if (data.fromZone === 'other' && !data.fromOther) {
        refineCtx.addIssue({ code: 'custom', path: ['fromOther'], message: 'form.error.required' });
      }
      if (data.toZone === 'other' && !data.toOther) {
        refineCtx.addIssue({ code: 'custom', path: ['toOther'], message: 'form.error.required' });
      }
      if (
        data.fromZone === data.toZone &&
        data.fromZone !== 'other' &&
        data.toZone !== 'other'
      ) {
        refineCtx.addIssue({ code: 'custom', path: ['toZone'], message: 'form.error.required' });
      }
      if (!classes.has(data.vehicleClass)) {
        refineCtx.addIssue({ code: 'custom', path: ['vehicleClass'], message: 'form.error.required' });
      }
      if (data.invoice) {
        for (const key of ['invoiceCompany', 'invoiceVat', 'invoiceTaxOffice', 'invoiceAddress'] as const) {
          if (!data[key]) {
            refineCtx.addIssue({ code: 'custom', path: [key], message: 'form.error.required' });
          }
        }
      }
      const dtIssue = futureLocalIssue(data.datetime, now, timeZone);
      if (dtIssue) {
        refineCtx.addIssue({ code: 'custom', path: ['datetime'], message: dtIssue });
      }
    });
}

export function vipSecuritySchema(ctx: SchemaCtx = {}) {
  const now = ctx.now ?? new Date();
  const timeZone = ctx.timeZone ?? 'Europe/Athens';

  return z
    .object({
      name,
      email,
      phone,
      serviceType: z.string().trim().min(1).max(200),
      date: z
        .string()
        .trim()
        .optional()
        .or(z.literal(''))
        .transform((v) => v || undefined),
      place: shortText.optional().or(z.literal('')).transform((v) => v || undefined),
      people: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        intField(1, 1000).optional(),
      ),
      message: message.optional().or(z.literal('')).transform((v) => v || undefined),
      consent,
      website: z.string().optional(),
      'cf-turnstile-response': z.string().optional(),
      turnstileToken: z.string().optional(),
    })
    .strict()
    .superRefine((data, refineCtx) => {
      if (!data.date) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        refineCtx.addIssue({ code: 'custom', path: ['date'], message: 'form.error.required' });
        return;
      }
      // Compare Athens calendar dates: date at 00:00 Athens must be >= today Athens.
      try {
        const start = localToInstant(`${data.date}T00:00`, timeZone);
        const todayLocal = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now);
        const todayStart = localToInstant(`${todayLocal}T00:00`, timeZone);
        if (start.getTime() < todayStart.getTime()) {
          refineCtx.addIssue({ code: 'custom', path: ['date'], message: 'form.error.required' });
        }
      } catch {
        refineCtx.addIssue({ code: 'custom', path: ['date'], message: 'form.error.required' });
      }
    });
}

export function contactSchema(ctx: SchemaCtx) {
  const topics = new Set(ctx.topicKeys ?? []);
  return z
    .object({
      name,
      email,
      phone: phoneOptional,
      topic: z.string().trim().min(1),
      message: messageRequired,
      consent,
      website: z.string().optional(),
      'cf-turnstile-response': z.string().optional(),
      turnstileToken: z.string().optional(),
    })
    .strict()
    .superRefine((data, refineCtx) => {
      if (topics.size && !topics.has(data.topic)) {
        refineCtx.addIssue({ code: 'custom', path: ['topic'], message: 'form.error.required' });
      }
    });
}

export type TransferRequestData = z.infer<ReturnType<typeof transferRequestSchema>>;
export type VipSecurityData = z.infer<ReturnType<typeof vipSecuritySchema>>;
export type ContactData = z.infer<ReturnType<typeof contactSchema>>;

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fields[key]) {
      fields[key] = issue.message === 'form.error.email' ? 'form.error.email' : 'form.error.required';
    }
  }
  return fields;
}
