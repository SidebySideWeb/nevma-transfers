import { defineAction, ActionError } from 'astro:actions';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { searchCustomerRows } from '../lib/customer-search';
import { callInternalBooking, callInternalCancel, callInternalPayment, callInternalRefund } from '../lib/internal';
import {
  classAvailabilityForTrip as tripClassAvailability,
  freeVehiclesForClass as tripFreeVehicles,
  TripError,
} from '../lib/office-trip';
import { eurosToCents, optionalEurosToCents } from '../lib/money';
import { createSupabaseServerClient } from '../lib/supabase';
import { athensLocalToInstant } from '../lib/time';

function requireStaff(locals: App.Locals) {
  if (!locals.staff) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  return locals.staff;
}

const pickupLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const tripInput = z.object({
  pickupLocal,
  type: z.enum(['transfer', 'hourly']),
  fromZone: z.string().min(1),
  toZone: z.string().optional(),
  hours: z.number().int().positive().optional(),
  passengers: z.number().int().positive(),
  luggage: z.number().int().nonnegative(),
});

export const server = {
  assignVehicle: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      vehicleId: z.string().uuid().optional().or(z.literal('')),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const vehicleId = input.vehicleId || null;

      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select('id, class_id, blocked_range, status')
        .eq('reference', input.reference)
        .single();
      if (bErr || !booking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found' });
      }

      if (vehicleId) {
        const { data: vehicle } = await supabase
          .from('vehicles')
          .select('id, class_id, status')
          .eq('id', vehicleId)
          .single();
        if (!vehicle || vehicle.class_id !== booking.class_id || vehicle.status !== 'active') {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Vehicle not available for this class' });
        }
      }

      const nextStatus =
        vehicleId && (booking.status === 'confirmed' || booking.status === 'assigned')
          ? ('assigned' as const)
          : booking.status === 'assigned' && !vehicleId
            ? ('confirmed' as const)
            : undefined;

      const { error } = await supabase
        .from('bookings')
        .update(
          nextStatus
            ? { vehicle_id: vehicleId, status: nextStatus }
            : { vehicle_id: vehicleId },
        )
        .eq('id', booking.id);
      if (error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: error.message.includes('exclusion') || error.code === '23P01'
            ? 'That vehicle overlaps another booking or block for this time.'
            : error.message,
        });
      }
      return { ok: true };
    },
  }),

  markCompleted: defineAction({
    accept: 'form',
    input: z.object({ reference: z.string().min(1) }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('reference', input.reference)
        .eq('status', 'assigned');
      if (error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
      return { ok: true };
    },
  }),

  saveNotesInvoice: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      securityNotes: z.string().optional(),
      invoiceStatus: z.enum(['not_required', 'requested', 'issued']).optional(),
      invoiceNumber: z.string().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('bookings')
        .update({
          ...(input.securityNotes !== undefined
            ? { security_notes: input.securityNotes || null }
            : {}),
          ...(input.invoiceStatus ? { invoice_status: input.invoiceStatus } : {}),
          ...(input.invoiceNumber !== undefined
            ? { invoice_number: input.invoiceNumber || null }
            : {}),
        })
        .eq('reference', input.reference);
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      return { ok: true };
    },
  }),

  refundBooking: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      amountEuros: z.string().min(1),
      reason: z.string().min(1),
      idempotencyKey: z.string().uuid(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      let amountCents: number;
      try {
        amountCents = eurosToCents(input.amountEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid amount' });
      }
      if (amountCents <= 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Amount must be positive' });
      }
      const result = await callInternalRefund(
        {
          reference: input.reference,
          amountCents,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
        staff.userId,
      );
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      return result.data;
    },
  }),

  cancelBooking: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      reason: z.string().min(1),
      refund: z.enum(['full', 'none']),
      idempotencyKey: z.string().uuid(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const result = await callInternalCancel(
        {
          reference: input.reference,
          refund: input.refund,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
        staff.userId,
      );
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      return result.data;
    },
  }),

  createBlockedSlot: defineAction({
    accept: 'form',
    input: z.object({
      vehicleId: z.string().uuid(),
      fromLocal: z.string().min(1),
      toLocal: z.string().min(1),
      reason: z.string().optional(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      let from: Date;
      let to: Date;
      try {
        from = athensLocalToInstant(input.fromLocal);
        to = athensLocalToInstant(input.toLocal);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid Athens date/time' });
      }
      if (to.getTime() <= from.getTime()) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'End must be after start' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const range = `[${from.toISOString()},${to.toISOString()})`;
      const { error } = await supabase.from('blocked_slots').insert({
        vehicle_id: input.vehicleId,
        range,
        reason: input.reason || null,
        created_by: staff.userId,
      });
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      return { ok: true };
    },
  }),

  deleteBlockedSlot: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('blocked_slots').delete().eq('id', input.id);
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      return { ok: true };
    },
  }),

  saveZonePrices: defineAction({
    accept: 'form',
    input: z.object({
      classId: z.string().uuid(),
      /** JSON map "fromId:toId" → euro string (empty = delete) */
      cellsJson: z.string().min(2),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      let cells: Record<string, string>;
      try {
        cells = JSON.parse(input.cellsJson) as Record<string, string>;
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid price payload' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      for (const [key, euro] of Object.entries(cells)) {
        const [fromId, toId] = key.split(':');
        if (!fromId || !toId || fromId === toId) continue;
        let cents: number | null;
        try {
          cents = optionalEurosToCents(euro);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: `Invalid price for ${key}` });
        }
        if (cents === null) {
          await supabase
            .from('zone_prices')
            .delete()
            .eq('class_id', input.classId)
            .eq('from_zone_id', fromId)
            .eq('to_zone_id', toId);
        } else {
          const { error } = await supabase.from('zone_prices').upsert(
            {
              class_id: input.classId,
              from_zone_id: fromId,
              to_zone_id: toId,
              price_cents: cents,
            },
            { onConflict: 'class_id,from_zone_id,to_zone_id' },
          );
          if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
        }
      }
      return { ok: true };
    },
  }),

  saveHourlyRates: defineAction({
    accept: 'form',
    input: z.object({
      rowsJson: z.string().min(2),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      type Row = { classId: string; rateEuros: string; minHours: string; maxHours: string };
      let rows: Row[];
      try {
        rows = JSON.parse(input.rowsJson) as Row[];
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid rates payload' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      for (const row of rows) {
        let rateCents: number;
        try {
          rateCents = eurosToCents(row.rateEuros);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid hourly rate' });
        }
        const minHours = Number(row.minHours);
        const maxHours = Number(row.maxHours);
        if (!Number.isInteger(minHours) || !Number.isInteger(maxHours) || minHours < 1 || maxHours < minHours) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid hour limits' });
        }
        const { error } = await supabase.from('hourly_rates').upsert(
          {
            class_id: row.classId,
            price_per_hour_cents: rateCents,
            min_hours: minHours,
            max_hours: maxHours,
          },
          { onConflict: 'class_id' },
        );
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
      return { ok: true };
    },
  }),

  saveExtras: defineAction({
    accept: 'form',
    input: z.object({ rowsJson: z.string().min(2) }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      type Row = { id: string; name: string; priceEuros: string; active: string };
      let rows: Row[];
      try {
        rows = JSON.parse(input.rowsJson) as Row[];
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid extras payload' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      for (const row of rows) {
        let priceCents: number;
        try {
          priceCents = eurosToCents(row.priceEuros);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid extra price' });
        }
        const { error } = await supabase
          .from('extras')
          .update({
            name: row.name,
            price_cents: priceCents,
            active: row.active === 'true' || row.active === 'on',
          })
          .eq('id', row.id);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
      return { ok: true };
    },
  }),

  saveFleet: defineAction({
    accept: 'form',
    input: z.object({
      kind: z.enum(['class', 'vehicle']),
      payloadJson: z.string().min(2),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const payload = JSON.parse(input.payloadJson) as Record<string, string>;
      const id = payload.id;
      if (!id) throw new ActionError({ code: 'BAD_REQUEST', message: 'Missing id' });
      if (input.kind === 'class') {
        const { error } = await supabase
          .from('vehicle_classes')
          .update({
            max_passengers: Number(payload.maxPassengers),
            max_luggage: Number(payload.maxLuggage),
            buffer_minutes: Number(payload.bufferMinutes),
            active: payload.active === 'true',
            sort_order: Number(payload.sortOrder ?? 0),
          })
          .eq('id', id);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      } else {
        const { error } = await supabase
          .from('vehicles')
          .update({
            label: payload.label ?? '',
            status: (payload.status as 'active' | 'inactive') || 'inactive',
          })
          .eq('id', id);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
      return { ok: true };
    },
  }),

  saveZone: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      sortOrder: z.coerce.number().int(),
      active: z.string().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('zones')
        .update({
          name: input.name,
          sort_order: input.sortOrder,
          active: input.active === 'true' || input.active === 'on',
        })
        .eq('id', input.id);
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      return { ok: true };
    },
  }),

  saveSetting: defineAction({
    accept: 'form',
    input: z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      let value: unknown;
      try {
        value = JSON.parse(input.value);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Value must be JSON' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('settings')
        .update({ value: value as never, is_demo: false })
        .eq('key', input.key);
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      return { ok: true };
    },
  }),

  searchCustomers: defineAction({
    accept: 'json',
    input: z.object({ query: z.string().max(100) }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      try {
        return await searchCustomerRows(supabase, staff, input.query);
      } catch (e) {
        throw new ActionError({ code: 'BAD_REQUEST', message: (e as Error).message });
      }
    },
  }),

  classAvailabilityForTrip: defineAction({
    accept: 'json',
    input: tripInput,
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      try {
        return await tripClassAvailability(supabase, input);
      } catch (e) {
        if (e instanceof TripError) throw new ActionError({ code: 'BAD_REQUEST', message: e.message });
        throw e;
      }
    },
  }),

  freeVehiclesForClass: defineAction({
    accept: 'json',
    input: z.object({
      classKey: z.string().min(1),
      pickupLocal,
      durationMinutes: z.number().int().positive(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      try {
        return await tripFreeVehicles(supabase, input);
      } catch (e) {
        if (e instanceof TripError) throw new ActionError({ code: 'BAD_REQUEST', message: e.message });
        throw e;
      }
    },
  }),

  createOfficeBooking: defineAction({
    accept: 'json',
    input: z.object({
      idempotencyKey: z.uuid().optional(),
      customer: z.object({
        name: z.string().trim().min(1),
        email: z.email(),
        phone: z.string().trim().min(1),
      }),
      bookingType: z.enum(['transfer', 'hourly']),
      classKey: z.string().min(1),
      fromZone: z.string().min(1),
      toZone: z.string().optional(),
      hours: z.number().int().positive().optional(),
      pickupLocal,
      pickupAddress: z.string().trim().min(1),
      dropoffAddress: z.string().trim().optional(),
      flightNumber: z.string().trim().optional(),
      passengers: z.number().int().positive(),
      luggage: z.number().int().nonnegative(),
      extras: z.array(z.string().min(1)).default([]),
      vehicleId: z.uuid().optional(),
      invoice: z
        .object({
          company: z.string().trim().min(1),
          vat: z.string().trim().min(1),
          taxOffice: z.string().trim().min(1),
          address: z.string().trim().min(1),
        })
        .optional(),
      notes: z.string().trim().optional(),
      /** Euros typed by staff; converted here. The web app still prices the booking itself. */
      priceOverrideEuros: z.string().trim().optional(),
      priceOverrideReason: z.string().trim().optional(),
      payment: z.enum(['link', 'offline_paid', 'offline_collect']),
      offlineMethod: z.enum(['cash', 'bank_transfer', 'on_account']).optional(),
      emailCustomer: z.boolean(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const { priceOverrideEuros, idempotencyKey, ...rest } = input;
      let priceOverrideCents: number | undefined;
      if (priceOverrideEuros) {
        try {
          priceOverrideCents = eurosToCents(priceOverrideEuros);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid price' });
        }
        if (priceOverrideCents < 0) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid price' });
        }
        if (!input.priceOverrideReason) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Give a reason for the different price' });
        }
      }
      const result = await callInternalBooking(
        {
          ...rest,
          priceOverrideCents,
          priceOverrideReason: priceOverrideCents == null ? undefined : input.priceOverrideReason,
          idempotencyKey: idempotencyKey ?? randomUUID(),
          staffUserId: staff.userId,
        },
        staff.userId,
      );
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code ?? 'invalid_request',
          message: result.message,
          fields: result.fields ?? {},
        };
      }
      const data = result.data as { reference: string; checkoutUrl?: string; vivaTimeoutCapped?: boolean };
      return { ok: true as const, reference: data.reference, vivaTimeoutCapped: data.vivaTimeoutCapped };
    },
  }),

  recordOfflinePayment: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      method: z.enum(['cash', 'bank_transfer', 'on_account']),
      amountEuros: z.string().optional(),
      note: z.string().optional(),
      idempotencyKey: z.uuid(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      let amountCents: number | undefined;
      if (input.amountEuros?.trim()) {
        try {
          amountCents = eurosToCents(input.amountEuros);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid amount' });
        }
        if (amountCents <= 0) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Amount must be positive' });
        }
      }
      const result = await callInternalPayment(
        {
          reference: input.reference,
          method: input.method,
          note: input.note || undefined,
          amountCents,
          idempotencyKey: input.idempotencyKey,
        },
        staff.userId,
      );
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      return result.data;
    },
  }),

  /** AC-10: deliberately reject attempts to patch price_cents from the admin. */
  forgePriceCents: defineAction({
    accept: 'json',
    input: z.object({
      reference: z.string().min(1),
      priceCents: z.number().int(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('bookings')
        .update({ price_cents: input.priceCents } as never)
        .eq('reference', input.reference);
      // Column grants / RLS must reject; always report failure for AC-10.
      throw new ActionError({
        code: 'FORBIDDEN',
        message: error?.message || 'price_cents cannot be changed by staff',
      });
    },
  }),
};
