import { z } from 'zod';
import { BookingError } from './types';

const pickupLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const zoneCode = z.string().min(1);
const classKey = z.string().min(1);
const turnstileToken = z.string().min(1);
const uuid = z.uuid();

const returnLeg = z
  .object({
    pickupLocal,
    flightNumber: z.string().optional(),
  })
  .strict();

const placePayload = z
  .object({
    placeId: z.string().min(10),
    lat: z.number(),
    lng: z.number(),
  })
  .strict()
  .optional();

/** Quote place (FIX-2): coordinates decide everything; placeId and address are optional. */
const quotePlace = z.object({
  placeId: z.string().min(10).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
});
const quoteStops = z
  .array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
  .max(5)
  .optional();

// fromZone/toZone stay optional: zones/hybrid pricing still reads them, distance pricing ignores them.
const quoteTransfer = z
  .object({
    type: z.literal('transfer'),
    fromZone: zoneCode.optional(),
    toZone: zoneCode.optional(),
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    return: returnLeg.optional(),
    pickupPlace: quotePlace.optional(),
    dropoffPlace: quotePlace.optional(),
    stops: quoteStops,
  })
  .strict();

const quoteHourly = z
  .object({
    type: z.literal('hourly'),
    fromZone: zoneCode.optional(),
    hours: z.number().int().positive(),
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    pickupPlace: quotePlace.optional(),
  })
  .strict();

export const QuoteRequest = z.discriminatedUnion('type', [quoteTransfer, quoteHourly]);

/** PRICING_MODE=distance: the places are the whole request (transfer: both, hourly: pick-up). */
export const QuoteRequestDistance = QuoteRequest.superRefine((b, ctx) => {
  if (!b.pickupPlace) ctx.addIssue({ code: 'custom', path: ['pickupPlace'], message: 'pickupPlace required' });
  if (b.type === 'transfer' && !b.dropoffPlace) {
    ctx.addIssue({ code: 'custom', path: ['dropoffPlace'], message: 'dropoffPlace required' });
  }
});

const holdTransfer = z
  .object({
    type: z.literal('transfer'),
    fromZone: zoneCode,
    toZone: zoneCode,
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    classKey,
    turnstileToken,
  })
  .strict();

const holdHourly = z
  .object({
    type: z.literal('hourly'),
    fromZone: zoneCode,
    hours: z.number().int().positive(),
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    classKey,
    turnstileToken,
  })
  .strict();

export const HoldRequest = z.discriminatedUnion('type', [holdTransfer, holdHourly]);

const extrasField = z
  .array(
    z.union([
      z.string().min(1),
      z.object({
        code: z.string().min(1),
        quantity: z.number().int().min(1).max(10).optional(),
      }),
    ]),
  )
  .default([]);

const customerField = z
  .object({
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1),
  })
  .strict();

const invoiceField = z
  .object({
    company: z.string().min(1),
    vat: z.string().min(1),
    taxOffice: z.string().min(1),
    address: z.string().min(1),
  })
  .strict()
  .optional();

export const BookingRequest = z
  .object({
    holdId: uuid,
    pickupAddress: z.string().min(1),
    dropoffAddress: z.string().min(1).optional(),
    pickupPlace: placePayload,
    dropoffPlace: placePayload,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    flightNumber: z.string().optional(),
    // Strings mean quantity 1; objects set an explicit quantity (expanded to repeated codes for the RPC).
    extras: extrasField,
    customer: customerField,
    notes: z.string().optional(),
    invoice: invoiceField,
    consent: z.literal(true),
    turnstileToken,
  })
  .strict();

/** Checkout from a signed quote (B3). Browser-sent price/amount is rejected by rejectMoneyFields. */
export const QuoteCheckoutRequest = z
  .object({
    quoteId: uuid,
    signature: z.string().min(16),
    classKey,
    pickupAddress: z.string().min(1),
    dropoffAddress: z.string().min(1).optional(),
    pickupPlace: placePayload,
    dropoffPlace: placePayload,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    flightNumber: z.string().optional(),
    extras: extrasField,
    customer: customerField,
    notes: z.string().optional(),
    invoice: invoiceField,
    consent: z.literal(true),
    turnstileToken,
  })
  .strict();

export const CancelRequest = z
  .object({
    token: z.string().min(1),
    turnstileToken,
  })
  .strict();

const MONEY_KEYS = new Set(['price', 'amount', 'total']);

/** Reject any body that tries to send money fields to the server. */
export function rejectMoneyFields(body: unknown, allowKeys: readonly string[] = []): void {
  walk(body, new Set(allowKeys));
}

function walk(value: unknown, allow: Set<string>): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, allow);
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!allow.has(key) && (MONEY_KEYS.has(key) || key.endsWith('Cents'))) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: `money field not allowed: ${key}`,
        field: key,
      });
    }
    walk(child, allow);
  }
}
