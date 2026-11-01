import { z } from 'zod';
import { BookingError } from './types';

const pickupLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const zoneCode = z.string().min(1);
const classKey = z.string().min(1);
const turnstileToken = z.string().min(1);
const uuid = z.uuid();

const quoteTransfer = z
  .object({
    type: z.literal('transfer'),
    fromZone: zoneCode,
    toZone: zoneCode,
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
  })
  .strict();

const quoteHourly = z
  .object({
    type: z.literal('hourly'),
    fromZone: zoneCode,
    hours: z.number().int().positive(),
    pickupLocal,
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
  })
  .strict();

export const QuoteRequest = z.discriminatedUnion('type', [quoteTransfer, quoteHourly]);

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

export const BookingRequest = z
  .object({
    holdId: uuid,
    pickupAddress: z.string().min(1),
    dropoffAddress: z.string().min(1).optional(),
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    flightNumber: z.string().optional(),
    // Strings mean quantity 1; objects set an explicit quantity (expanded to repeated codes for the RPC).
    extras: z
      .array(
        z.union([
          z.string().min(1),
          z.object({
            code: z.string().min(1),
            quantity: z.number().int().min(1).max(10).optional(),
          }),
        ]),
      )
      .default([]),
    customer: z
      .object({
        name: z.string().min(1),
        email: z.email(),
        phone: z.string().min(1),
      })
      .strict(),
    notes: z.string().optional(),
    invoice: z
      .object({
        company: z.string().min(1),
        vat: z.string().min(1),
        taxOffice: z.string().min(1),
        address: z.string().min(1),
      })
      .strict()
      .optional(),
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
