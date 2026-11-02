import { defineAction, ActionError } from 'astro:actions';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { searchCustomerRows } from '../lib/customer-search';
import {
  callInternalBooking,
  callInternalCancel,
  callInternalDriverInvite,
  callInternalDriverNotify,
  callInternalPayment,
  callInternalRefund,
} from '../lib/internal';
import { driversEnabled } from '../lib/drivers';
import {
  classAvailabilityForTrip as tripClassAvailability,
  freeVehiclesForClass as tripFreeVehicles,
  TripError,
} from '../lib/office-trip';
import { callWebsiteDeployHook } from '../lib/deploy-hook';
import { mapDbError } from '../lib/db-errors';
import { eurosToCents, optionalEurosToCents } from '../lib/money';
import {
  clearPricesChanged,
  markPricesChanged,
  rebuildCooldownRemainingMs,
  setRebuildRequestedAt,
} from '../lib/price-update-cookies';
import { parseTstzRange, rangesOverlap } from '../lib/range';
import { createSupabaseServerClient } from '../lib/supabase';
import { athensLocalToInstant } from '../lib/time';

function requireStaff(locals: App.Locals) {
  if (!locals.staff) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  return locals.staff;
}

function throwDb(error: { code?: string; message?: string; details?: string | null } | null, fieldText?: string): never {
  throw new ActionError({ code: 'BAD_REQUEST', message: mapDbError(error, fieldText) });
}

const codeKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lower-case letters, numbers and hyphens.');
const vehicleStatus = z.enum(['active', 'maintenance', 'retired']);

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
      markPricesChanged(ctx.cookies);
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
        let rateCents: number | null;
        try {
          rateCents = optionalEurosToCents(row.rateEuros);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid hourly rate' });
        }
        if (rateCents === null) continue; // leave unset classes alone
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
        if (error) throwDb(error);
      }
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  saveExtras: defineAction({
    accept: 'form',
    input: z.object({ rowsJson: z.string().min(2) }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      type Row = {
        id: string;
        name: string;
        priceEuros: string;
        active: string;
        appliesTransfer?: string;
        appliesHourly?: string;
        maxQuantity?: string;
      };
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
        const applies_to: string[] = [];
        if (row.appliesTransfer === 'true' || row.appliesTransfer === 'on') applies_to.push('transfer');
        if (row.appliesHourly === 'true' || row.appliesHourly === 'on') applies_to.push('hourly');
        if (applies_to.length === 0) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Each extra must apply to transfer and/or by the hour',
          });
        }
        const max_quantity = Math.min(10, Math.max(1, Number(row.maxQuantity ?? 1) || 1));
        const { error } = await supabase
          .from('extras')
          .update({
            name: row.name,
            price_cents: priceCents,
            active: row.active === 'true' || row.active === 'on',
            applies_to,
            max_quantity,
          })
          .eq('id', row.id);
        if (error) throwDb(error);
      }
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  addExtra: defineAction({
    accept: 'form',
    input: z.object({
      code: codeKey,
      name: z.string().trim().min(1),
      priceEuros: z.string().min(1),
      appliesTransfer: z.string().optional(),
      appliesHourly: z.string().optional(),
      maxQuantity: z.coerce.number().int().min(1).max(10).optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      let priceCents: number;
      try {
        priceCents = eurosToCents(input.priceEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid extra price' });
      }
      const applies_to: string[] = [];
      if (input.appliesTransfer === 'true' || input.appliesTransfer === 'on') applies_to.push('transfer');
      if (input.appliesHourly === 'true' || input.appliesHourly === 'on') applies_to.push('hourly');
      if (applies_to.length === 0) applies_to.push('transfer', 'hourly');
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('extras').insert({
        code: input.code,
        name: input.name,
        price_cents: priceCents,
        active: true,
        applies_to,
        max_quantity: input.maxQuantity ?? 1,
      });
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  clearDemo: defineAction({
    accept: 'form',
    // Single field so Confirmed can sit inside another form (formaction + name/value).
    input: z.object({
      clear: z
        .string()
        .regex(
          /^(vehicle_classes|vehicles|zones|zone_prices|hourly_rates|extras|settings)\|.+$/,
          'Invalid clear target',
        ),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const pipe = input.clear.indexOf('|');
      const table = input.clear.slice(0, pipe) as
        | 'vehicle_classes'
        | 'vehicles'
        | 'zones'
        | 'zone_prices'
        | 'hourly_rates'
        | 'extras'
        | 'settings';
      const id = input.clear.slice(pipe + 1);
      const supabase = createSupabaseServerClient(ctx.cookies);
      if (table === 'settings') {
        const { error } = await supabase.from('settings').update({ is_demo: false }).eq('key', id);
        if (error) throwDb(error);
        return { ok: true };
      }
      if (table === 'hourly_rates') {
        const { error } = await supabase
          .from('hourly_rates')
          .update({ is_demo: false })
          .eq('class_id', id);
        if (error) throwDb(error);
        return { ok: true };
      }
      if (table === 'zone_prices') {
        const [from_zone_id, to_zone_id, class_id] = id.split(':');
        if (!from_zone_id || !to_zone_id || !class_id) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid zone price id' });
        }
        const { error } = await supabase
          .from('zone_prices')
          .update({ is_demo: false })
          .eq('from_zone_id', from_zone_id)
          .eq('to_zone_id', to_zone_id)
          .eq('class_id', class_id);
        if (error) throwDb(error);
        return { ok: true };
      }
      const { error } = await supabase.from(table).update({ is_demo: false }).eq('id', id);
      if (error) throwDb(error);
      return { ok: true };
    },
  }),

  deleteExtra: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('extras').delete().eq('id', input.id);
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  addClass: defineAction({
    accept: 'form',
    input: z.object({
      key: codeKey,
      name: z.string().trim().min(1),
      maxPassengers: z.coerce.number().int().min(1).max(50),
      maxLuggage: z.coerce.number().int().min(0).max(100),
      bufferMinutes: z.coerce.number().int().min(0).max(240),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('vehicle_classes').insert({
        key: input.key,
        name: input.name,
        max_passengers: input.maxPassengers,
        max_luggage: input.maxLuggage,
        buffer_minutes: input.bufferMinutes,
        active: false,
        sort_order: 100,
      });
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true, key: input.key };
    },
  }),

  updateClass: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      key: codeKey.optional(),
      name: z.string().trim().min(1),
      maxPassengers: z.coerce.number().int().min(1).max(50),
      maxLuggage: z.coerce.number().int().min(0).max(100),
      bufferMinutes: z.coerce.number().int().min(0).max(240),
      sortOrder: z.coerce.number().int(),
      active: z.string().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('vehicle_classes')
        .update({
          name: input.name,
          max_passengers: input.maxPassengers,
          max_luggage: input.maxLuggage,
          buffer_minutes: input.bufferMinutes,
          sort_order: input.sortOrder,
          active: input.active === 'true' || input.active === 'on',
          ...(input.key ? { key: input.key } : {}),
        })
        .eq('id', input.id);
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  deleteClass: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('vehicle_classes').delete().eq('id', input.id);
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  addVehicle: defineAction({
    accept: 'form',
    input: z.object({
      classId: z.string().uuid(),
      label: z.string().trim().min(1).max(64),
      note: z.string().trim().max(200).optional(),
      plate: z.string().trim().max(32).optional(),
      status: vehicleStatus.default('active'),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('vehicles').insert({
        class_id: input.classId,
        label: input.label,
        note: input.note || null,
        plate: input.plate || null,
        status: input.status,
      });
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  updateVehicle: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      classId: z.string().uuid(),
      label: z.string().trim().min(1).max(64),
      note: z.string().trim().max(200).optional(),
      plate: z.string().trim().max(32).optional(),
      status: vehicleStatus,
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('vehicles')
        .update({
          class_id: input.classId,
          label: input.label,
          note: input.note || null,
          plate: input.plate || null,
          status: input.status,
        })
        .eq('id', input.id);
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  deleteVehicle: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('vehicles').delete().eq('id', input.id);
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  /** @deprecated Prefer addClass / updateClass / addVehicle / updateVehicle. */
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
        if (error) throwDb(error);
      } else {
        const status = vehicleStatus.safeParse(payload.status);
        const { error } = await supabase
          .from('vehicles')
          .update({
            label: payload.label ?? '',
            status: status.success ? status.data : 'active',
            note: payload.note || null,
          })
          .eq('id', id);
        if (error) throwDb(error);
      }
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  addZone: defineAction({
    accept: 'form',
    input: z.object({
      code: codeKey,
      name: z.string().trim().min(1),
      kind: z.enum(['airport', 'city', 'port', 'area', 'other']).default('area'),
      sortOrder: z.coerce.number().int().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('zones').insert({
        code: input.code,
        name: input.name,
        kind: input.kind,
        sort_order: input.sortOrder ?? 100,
        active: true,
      });
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  saveZone: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      code: codeKey.optional(),
      name: z.string().min(1),
      kind: z.enum(['airport', 'city', 'port', 'area', 'other']).optional(),
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
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.code ? { code: input.code } : {}),
        })
        .eq('id', input.id);
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  deleteZone: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('zones').delete().eq('id', input.id);
      if (error) throwDb(error);
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  requestWebsiteRebuild: defineAction({
    accept: 'form',
    input: z.object({}),
    async handler(_input, ctx) {
      requireStaff(ctx.locals);
      const remaining = rebuildCooldownRemainingMs(ctx.cookies);
      if (remaining > 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another rebuild.`,
        });
      }
      const result = await callWebsiteDeployHook();
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      clearPricesChanged(ctx.cookies);
      setRebuildRequestedAt(ctx.cookies);
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

  saveCustomer: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      phone: z.string().trim().max(40).optional(),
      company: z.string().trim().max(200).optional(),
      vatNumber: z.string().trim().max(40).optional(),
      taxOffice: z.string().trim().max(100).optional(),
      address: z.string().trim().max(400).optional(),
      notes: z.string().trim().max(2000).optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('customers')
        .update({
          name: input.name,
          phone: input.phone || null,
          company: input.company || null,
          vat_number: input.vatNumber || null,
          tax_office: input.taxOffice || null,
          address: input.address || null,
          notes: input.notes || null,
        })
        .eq('id', input.id);
      if (error) throwDb(error);
      return { ok: true };
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

  autoAssignBackfill: defineAction({
    accept: 'form',
    input: z.object({
      classId: z.string().uuid(),
      classKey: z.string().min(1),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data: assigned, error } = await supabase.rpc('auto_assign_backfill', {
        p_class_id: input.classId,
      });
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      const { data: active } = await supabase
        .from('vehicles')
        .select('label')
        .eq('class_id', input.classId)
        .eq('status', 'active');
      const label = active?.length === 1 ? active[0]!.label : 'the vehicle';
      const { count: left } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', input.classId)
        .eq('status', 'confirmed')
        .is('vehicle_id', null)
        .gt('pickup_at', new Date().toISOString());
      return {
        assigned: Number(assigned ?? 0),
        left: left ?? 0,
        label,
        classKey: input.classKey,
      };
    },
  }),

  addDriver: defineAction({
    accept: 'form',
    input: z.object({
      fullName: z.string().trim().min(1),
      phone: z.string().trim().min(1),
      email: z.email(),
      employment: z.enum(['employee', 'freelancer']),
      invite: z.string().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!driversEnabled()) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data, error } = await supabase
        .from('drivers')
        .insert({
          full_name: input.fullName,
          phone: input.phone,
          email: input.email.toLowerCase(),
          employment: input.employment,
          active: true,
        })
        .select('id')
        .single();
      if (error) throwDb(error);
      if (input.invite === 'true' || input.invite === 'on') {
        const staff = requireStaff(ctx.locals);
        const inv = await callInternalDriverInvite({ driverId: data!.id }, staff.userId);
        if (!inv.ok) {
          // Driver created; invitation failed — still land on the profile.
          return { id: data!.id, inviteError: inv.message };
        }
      }
      return { id: data!.id };
    },
  }),

  updateDriver: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      fullName: z.string().trim().min(1),
      phone: z.string().trim().min(1),
      email: z.email(),
      employment: z.enum(['employee', 'freelancer']),
      licenceNumber: z.string().trim().optional(),
      licenceExpiresOn: z.string().optional(),
      permitExpiresOn: z.string().optional(),
      notes: z.string().optional(),
      active: z.string().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!driversEnabled()) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase
        .from('drivers')
        .update({
          full_name: input.fullName,
          phone: input.phone,
          email: input.email.toLowerCase(),
          employment: input.employment,
          licence_number: input.licenceNumber || null,
          licence_expires_on: input.licenceExpiresOn || null,
          permit_expires_on: input.permitExpiresOn || null,
          notes: input.notes || null,
          active: input.active === 'true' || input.active === 'on',
        })
        .eq('id', input.id);
      if (error) throwDb(error);
      return { ok: true };
    },
  }),

  inviteDriver: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid() }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (!driversEnabled()) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const result = await callInternalDriverInvite({ driverId: input.id }, staff.userId);
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      return result.data;
    },
  }),

  saveDriverShift: defineAction({
    accept: 'form',
    input: z.object({
      id: z
        .union([z.string().uuid(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : undefined)),
      driverId: z.string().uuid(),
      vehicleId: z.string().uuid(),
      startLocal: pickupLocal,
      endLocal: z
        .union([
          z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          z.literal(''),
          z.null(),
        ])
        .optional()
        .transform((v) => (v ? v : undefined)),
      startOdometer: z.string().optional().nullable(),
      endOdometer: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!driversEnabled()) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      let startedAt: Date;
      try {
        startedAt = athensLocalToInstant(input.startLocal);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid start time' });
      }
      let endedAt: string | null = null;
      if (input.endLocal) {
        try {
          endedAt = athensLocalToInstant(input.endLocal).toISOString();
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid end time' });
        }
      }
      const startOdo = input.startOdometer?.trim() ? Number(input.startOdometer) : null;
      const endOdo = input.endOdometer?.trim() ? Number(input.endOdometer) : null;
      const row = {
        driver_id: input.driverId,
        vehicle_id: input.vehicleId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt,
        start_odometer: Number.isFinite(startOdo) ? startOdo : null,
        end_odometer: Number.isFinite(endOdo) ? endOdo : null,
        source: 'office' as const,
        note: input.note?.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase.from('driver_shifts').update(row).eq('id', input.id);
        if (error) throwDb(error);
      } else {
        const { error } = await supabase.from('driver_shifts').insert(row);
        if (error) throwDb(error);
      }
      return { ok: true };
    },
  }),

  assignDriver: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      driverId: z
        .union([z.string().uuid(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : undefined)),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (!driversEnabled()) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const driverId = input.driverId || null;
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select('id, driver_id, pickup_at, reference')
        .eq('reference', input.reference)
        .single();
      if (bErr || !booking) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found' });

      const prev = booking.driver_id;
      const { error } = await supabase
        .from('bookings')
        .update({ driver_id: driverId })
        .eq('id', booking.id);
      if (error) {
        let driverName: string | undefined;
        let clashReference: string | undefined;
        if (driverId) {
          const { data: d } = await supabase.from('drivers').select('full_name').eq('id', driverId).maybeSingle();
          driverName = d?.full_name;
          const { data: self } = await supabase
            .from('bookings')
            .select('blocked_range')
            .eq('id', booking.id)
            .maybeSingle();
          const own = parseTstzRange(self?.blocked_range);
          if (own) {
            const { data: others } = await supabase
              .from('bookings')
              .select('id, reference, blocked_range, status')
              .eq('driver_id', driverId)
              .neq('id', booking.id)
              .in('status', ['pending', 'confirmed', 'assigned']);
            for (const o of others ?? []) {
              const r = parseTstzRange(o.blocked_range);
              if (r && rangesOverlap(own, r)) {
                clashReference = o.reference;
                break;
              }
            }
          }
        }
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: mapDbError(error, { driverName, clashReference }),
        });
      }

      const pickupMs = new Date(booking.pickup_at).getTime();
      const within48h = pickupMs - Date.now() <= 48 * 3600_000;
      let kind: 'assigned' | 'changed' | 'removed' | null = null;
      if (driverId && !prev) kind = 'assigned';
      else if (driverId && prev && driverId !== prev) kind = 'changed';
      else if (!driverId && prev) kind = 'removed';
      if (kind && (kind === 'assigned' || within48h)) {
        await callInternalDriverNotify({ reference: booking.reference, kind }, staff.userId);
      }
      return { ok: true };
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
