import { defineAction, ActionError } from 'astro:actions';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { searchCustomerRows } from '../lib/customer-search';
import {
  callInternalBooking,
  callInternalCancel,
  callInternalCompanyInvite,
  callInternalCompanyStatementPaid,
  callInternalCompanyStatementSend,
  callInternalDriverInvite,
  callInternalDriverNotify,
  callInternalFlightCheck,
  callInternalFlightDelay,
  callInternalPayment,
  callInternalRefund,
} from '../lib/internal';
import { features } from '@tem/features';
import {
  classAvailabilityForTrip as tripClassAvailability,
  freeVehiclesForClass as tripFreeVehicles,
  TripError,
} from '../lib/office-trip';
import { callWebsiteDeployHook } from '../lib/deploy-hook';
import { mapDbError } from '../lib/db-errors';
import { eurosToCents, optionalEurosToCents } from '../lib/money';
import {
  adjustmentAmountCents,
  endPreviousPlanOn,
  eurosOrZero,
  percentToBp,
} from '../lib/pay-convert';
import {
  clearPricesChanged,
  markPricesChanged,
  rebuildCooldownRemainingMs,
  setRebuildRequestedAt,
} from '../lib/price-update-cookies';
import { parseTstzRange, rangesOverlap } from '../lib/range';
import { resolveStatementPeriod, type PeriodKind } from '../lib/report-period';
import { logAdminActivity } from '../lib/admin-activity';
import { corporateDb } from '../lib/corporate';
import type { Json } from '../lib/database.types';
import { createSupabaseServerClient } from '../lib/supabase';
import { athensLocalToInstant } from '../lib/time';
import { signWithEnv } from '../lib/signing';

function requireStaff(locals: App.Locals) {
  if (!locals.staff) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  return locals.staff;
}

/** B9: every Companies action 404s when FEATURE_CORPORATE is off. */
function requireCorporate() {
  if (!features().corporate) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
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
  companyId: z.uuid().optional(),
});

export const server = {
  assignVehicle: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      vehicleId: z.string().uuid().optional().or(z.literal('')),
      driverId: z.string().uuid().optional().or(z.literal('')),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const vehicleId = input.vehicleId || null;
      const driverId = input.driverId === undefined ? undefined : input.driverId || null;
      if (driverId !== undefined && !features().drivers) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      }

      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select('id, class_id, blocked_range, status, driver_id, pickup_at, reference')
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
            ? { vehicle_id: vehicleId, status: nextStatus, ...(driverId !== undefined ? { driver_id: driverId } : {}) }
            : { vehicle_id: vehicleId, ...(driverId !== undefined ? { driver_id: driverId } : {}) },
        )
        .eq('id', booking.id);
      if (error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: error.message.includes('exclusion') || error.code === '23P01'
            ? driverId !== undefined
              ? 'That vehicle or driver overlaps another booking or block for this time.'
              : 'That vehicle overlaps another booking or block for this time.'
            : error.message,
        });
      }
      if (driverId !== undefined && driverId !== booking.driver_id) {
        const pickupMs = new Date(booking.pickup_at).getTime();
        const within48h = pickupMs - Date.now() <= 48 * 3600_000;
        const kind = driverId
          ? booking.driver_id
            ? 'changed'
            : 'assigned'
          : 'removed';
        if (kind === 'assigned' || within48h) {
          await callInternalDriverNotify({ reference: booking.reference, kind }, requireStaff(ctx.locals).userId);
        }
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
      const staff = requireStaff(ctx.locals);
      type Row = {
        classId: string;
        classKey?: string;
        rateEuros: string;
        minHours: string;
        maxHours: string;
        kmPerHour?: string;
        extraKmRate?: string;
      };
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

        if (row.classKey && (row.kmPerHour != null || row.extraKmRate != null) && features().distancePricing) {
          const { data: cur } = await supabase
            .from('current_class_rates')
            .select('*')
            .eq('class_key', row.classKey)
            .maybeSingle();
          const km_per_hour = Math.max(1, Number(row.kmPerHour || cur?.km_per_hour || 40) || 40);
          let extra_km_rate = cur?.extra_km_rate ?? 0;
          try {
            if (row.extraKmRate != null && row.extraKmRate !== '') {
              extra_km_rate = eurosOrZero(row.extraKmRate);
            }
          } catch {
            throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid extra km rate' });
          }
          const { error: rateErr } = await supabase.rpc('staff_save_class_rate', {
            p_class_key: row.classKey,
            p_base_fare: cur?.base_fare ?? 0,
            p_per_km: cur?.per_km ?? 0,
            p_per_min: cur?.per_min ?? 0,
            p_minimum_fare: cur?.minimum_fare ?? 0,
            p_km_per_hour: km_per_hour,
            p_extra_km_rate: extra_km_rate,
          });
          if (rateErr) throwDb(rateErr);
        }
      }
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: 'save',
        entity: 'hourly_rates',
      });
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
    // Single field so Mark confirmed can sit inside another form (formaction + name/value).
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

  clearDemoAll: defineAction({
    accept: 'form',
    input: z.object({
      scope: z.enum(['fleet', 'zone_prices', 'hourly_rates', 'extras']),
      classId: z.string().uuid().optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      if (input.scope === 'fleet') {
        const classes = await supabase
          .from('vehicle_classes')
          .update({ is_demo: false })
          .eq('is_demo', true);
        if (classes.error) throwDb(classes.error);
        const vehicles = await supabase
          .from('vehicles')
          .update({ is_demo: false })
          .eq('is_demo', true);
        if (vehicles.error) throwDb(vehicles.error);
        return { ok: true };
      }
      if (input.scope === 'zone_prices') {
        let q = supabase.from('zone_prices').update({ is_demo: false }).eq('is_demo', true);
        if (input.classId) q = q.eq('class_id', input.classId);
        const { error } = await q;
        if (error) throwDb(error);
        return { ok: true };
      }
      const { error } = await supabase
        .from(input.scope)
        .update({ is_demo: false })
        .eq('is_demo', true);
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
      displayAddress: z.string().optional(),
      displayPlaceId: z.string().optional(),
      displayLat: z.string().optional(),
      displayLng: z.string().optional(),
      displayKind: z.enum(['airport', 'port', 'station', 'hotel', 'area', '']).optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const addr = (input.displayAddress ?? '').trim();
      const placeId = (input.displayPlaceId ?? '').trim();
      const latRaw = (input.displayLat ?? '').trim();
      const lngRaw = (input.displayLng ?? '').trim();
      const displayKind = input.displayKind || null;
      let display_address: string | null = null;
      let display_place_id: string | null = null;
      let display_lat: number | null = null;
      let display_lng: number | null = null;
      if (placeId || latRaw || lngRaw || addr) {
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        if (!placeId || !addr || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Widget address needs address, place id, lat and lng together (or clear all).',
          });
        }
        display_address = addr;
        display_place_id = placeId;
        display_lat = lat;
        display_lng = lng;
      }
      const { error } = await supabase
        .from('zones')
        .update({
          name: input.name,
          sort_order: input.sortOrder,
          active: input.active === 'true' || input.active === 'on',
          display_address,
          display_place_id,
          display_lat,
          display_lng,
          display_kind: displayKind || null,
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.code ? { code: input.code } : {}),
        })
        .eq('id', input.id);
      if (error) throwDb(error, 'Lower-case letters, numbers and hyphens.');
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  saveFeaturedRoutes: defineAction({
    accept: 'form',
    input: z.object({
      rowsJson: z.string().min(2),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      type Row = { fromId: string; toId: string; featured: boolean; order: number };
      let rows: Row[];
      try {
        rows = JSON.parse(input.rowsJson) as Row[];
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid featured routes payload' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      for (const row of rows) {
        if (!row.fromId || !row.toId) continue;
        const { error } = await supabase
          .from('zone_routes')
          .update({
            featured: Boolean(row.featured),
            featured_order: Number.isFinite(row.order) ? Math.floor(row.order) : 100,
          })
          .eq('from_zone_id', row.fromId)
          .eq('to_zone_id', row.toId);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
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

  // ---------------------------------------------------------------------------
  // B9 corporate accounts (FEATURE_CORPORATE). Tables come from migration 0030.
  // ---------------------------------------------------------------------------
  saveCompany: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid().optional().or(z.literal('')),
      name: z.string().trim().min(1).max(200),
      kind: z.enum(['hotel', 'agency', 'company']),
      vatNumber: z.string().trim().max(40).optional(),
      taxOffice: z.string().trim().max(100).optional(),
      billingAddress: z.string().trim().max(400).optional(),
      billingEmail: z.union([z.literal(''), z.email()]).optional(),
      discountPct: z.string().optional(),
      payOnAccount: z.string().optional(),
      creditLimitEuros: z.string().optional(),
      paymentTermsDays: z.coerce.number().int().min(1).max(365),
      active: z.string().optional(),
      notes: z.string().trim().max(2000).optional(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      requireCorporate();
      const pct = Number((input.discountPct ?? '').trim().replace(',', '.') || '0');
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Discount must be between 0 and 100 %.' });
      }
      let creditLimitCents: number | null;
      try {
        creditLimitCents = optionalEurosToCents(input.creditLimitEuros ?? '');
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid credit limit' });
      }
      if (creditLimitCents != null && creditLimitCents < 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid credit limit' });
      }
      const row = {
        name: input.name,
        kind: input.kind,
        vat_number: input.vatNumber || null,
        tax_office: input.taxOffice || null,
        billing_address: input.billingAddress || null,
        billing_email: input.billingEmail?.toLowerCase() || null,
        discount_pct: Math.round(pct * 100) / 100,
        pay_on_account: input.payOnAccount === 'true' || input.payOnAccount === 'on',
        credit_limit_cents: creditLimitCents,
        payment_terms_days: input.paymentTermsDays,
        active: input.active === 'true' || input.active === 'on',
        notes: input.notes || null,
      };
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      if (input.id) {
        const { error } = await db
          .from('companies')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', input.id);
        if (error) throwDb(error);
        return { ok: true as const, id: input.id, created: false };
      }
      const { data, error } = await db.from('companies').insert(row).select('id').single();
      if (error) throwDb(error);
      return { ok: true as const, id: data!.id as string, created: true };
    },
  }),

  saveCompanyPrice: defineAction({
    accept: 'form',
    input: z.object({
      companyId: z.string().uuid(),
      classId: z.string().uuid(),
      bookingType: z.enum(['transfer', 'hourly']),
      fromZoneId: z.string().optional(),
      toZoneId: z.string().optional(),
      priceEuros: z.string().min(1),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      requireCorporate();
      let cents: number;
      try {
        cents = eurosToCents(input.priceEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid price' });
      }
      if (cents < 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid price' });
      const transfer = input.bookingType === 'transfer';
      const from = input.fromZoneId || null;
      const to = input.toZoneId || null;
      if (transfer) {
        if (!from || !to || from === to) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Pick two different zones for a transfer price.' });
        }
      }
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      // Unique indexes are partial, so replace the same key instead of upserting.
      let del = db
        .from('company_prices')
        .delete()
        .eq('company_id', input.companyId)
        .eq('class_id', input.classId)
        .eq('booking_type', input.bookingType);
      if (transfer) del = del.eq('from_zone_id', from!).eq('to_zone_id', to!);
      const { error: delErr } = await del;
      if (delErr) throwDb(delErr);
      const { error } = await db.from('company_prices').insert({
        company_id: input.companyId,
        class_id: input.classId,
        booking_type: input.bookingType,
        from_zone_id: transfer ? from : null,
        to_zone_id: transfer ? to : null,
        price_cents: cents,
      });
      if (error) throwDb(error);
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  deleteCompanyPrice: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid(), companyId: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      requireCorporate();
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      const { error } = await db
        .from('company_prices')
        .delete()
        .eq('id', input.id)
        .eq('company_id', input.companyId);
      if (error) throwDb(error);
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  inviteCompanyUser: defineAction({
    accept: 'form',
    input: z.object({
      companyId: z.string().uuid(),
      email: z.email(),
      role: z.enum(['admin', 'booker']),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      requireCorporate();
      const result = await callInternalCompanyInvite(
        { companyId: input.companyId, email: input.email.trim().toLowerCase(), role: input.role },
        staff.userId,
      );
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  deactivateCompanyUser: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().uuid(), companyId: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      requireCorporate();
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      const { error } = await db
        .from('company_users')
        .update({ active: false })
        .eq('id', input.id)
        .eq('company_id', input.companyId);
      if (error) throwDb(error);
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  createCompanyStatement: defineAction({
    accept: 'form',
    input: z.object({
      companyId: z.string().uuid(),
      periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      requireCorporate();
      if (input.periodTo < input.periodFrom) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The period must end on or after it starts.' });
      }
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      const { data: total, error: totalErr } = await db.rpc('company_statement_total_cents', {
        p_company_id: input.companyId,
        p_from: input.periodFrom,
        p_to: input.periodTo,
      });
      if (totalErr) throwDb(totalErr);
      const { data, error } = await db
        .from('company_statements')
        .insert({
          company_id: input.companyId,
          period_from: input.periodFrom,
          period_to: input.periodTo,
          total_cents: Number(total ?? 0),
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throwDb(error);
      return { ok: true as const, id: data!.id as string, companyId: input.companyId };
    },
  }),

  sendCompanyStatement: defineAction({
    accept: 'form',
    input: z.object({ statementId: z.string().uuid(), companyId: z.string().uuid() }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      requireCorporate();
      const db = corporateDb(createSupabaseServerClient(ctx.cookies));
      const { data: st, error: sErr } = await db
        .from('company_statements')
        .select('id, status, period_from, period_to')
        .eq('id', input.statementId)
        .eq('company_id', input.companyId)
        .maybeSingle();
      if (sErr) throwDb(sErr);
      if (!st) throw new ActionError({ code: 'NOT_FOUND', message: 'Statement not found' });
      if (st.status === 'draft') {
        // A draft total follows the bookings until it is sent.
        const { data: total, error: tErr } = await db.rpc('company_statement_total_cents', {
          p_company_id: input.companyId,
          p_from: st.period_from,
          p_to: st.period_to,
        });
        if (tErr) throwDb(tErr);
        const { error: uErr } = await db
          .from('company_statements')
          .update({ total_cents: Number(total ?? 0) })
          .eq('id', st.id);
        if (uErr) throwDb(uErr);
      }
      const result = await callInternalCompanyStatementSend({ statementId: input.statementId }, staff.userId);
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  markCompanyStatementPaid: defineAction({
    accept: 'form',
    input: z.object({
      statementId: z.string().uuid(),
      companyId: z.string().uuid(),
      paidRef: z.string().trim().min(1).max(120),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      requireCorporate();
      const result = await callInternalCompanyStatementPaid(
        { statementId: input.statementId, paidRef: input.paidRef },
        staff.userId,
      );
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      return { ok: true as const, companyId: input.companyId };
    },
  }),

  classAvailabilityForTrip: defineAction({
    accept: 'json',
    input: tripInput,
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (input.companyId) requireCorporate();
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
      pickupPlace: z
        .object({ placeId: z.string().min(10), lat: z.number(), lng: z.number() })
        .strict()
        .optional(),
      dropoffPlace: z
        .object({ placeId: z.string().min(10), lat: z.number(), lng: z.number() })
        .strict()
        .optional(),
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
      companyId: z.uuid().optional(),
      emailCustomer: z.boolean(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (input.companyId) requireCorporate();
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
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data, error } = await supabase
        .from('drivers')
        .insert({
          full_name: input.fullName,
          phone: input.phone,
          email: input.email.trim().toLowerCase(),
          employment: input.employment,
          active: true,
        })
        .select('id')
        .single();
      if (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            code: 'add_driver_failed',
            pg: error.code ?? null,
            detail: String(error.message ?? '').slice(0, 160),
          }),
        );
        throwDb(error);
      }
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
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
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
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
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
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
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
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
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

  setTripStatus: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      status: z.enum(['scheduled', 'on_way', 'arrived', 'on_board', 'completed', 'no_show']),
      note: z.string().optional().nullable(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const note = input.note?.trim();
      const { error } = await supabase.rpc('set_trip_status', {
        p_reference: input.reference,
        p_status: input.status,
        ...(note ? { p_note: note } : {}),
      });
      if (error) throwDb(error);
      return { ok: true, status: input.status };
    },
  }),

  changeDriverPayPlan: defineAction({
    accept: 'form',
    input: z.object({
      driverId: z.string().uuid(),
      validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      monthlySalaryEuros: z.string().optional().nullable(),
      dailyRateEuros: z.string().optional().nullable(),
      hourlyRateEuros: z.string().optional().nullable(),
      hourlyBasis: z.enum(['shift', 'hourly_bookings']),
      percent: z.string().optional().nullable(),
      percentBase: z.enum(['final', 'net']),
      perTransferEuros: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      let monthly: number;
      let daily: number;
      let hourly: number;
      let percentBp: number;
      let perTransfer: number;
      try {
        monthly = eurosOrZero(input.monthlySalaryEuros ?? '');
        daily = eurosOrZero(input.dailyRateEuros ?? '');
        hourly = eurosOrZero(input.hourlyRateEuros ?? '');
        percentBp = percentToBp(input.percent ?? '');
        perTransfer = eurosOrZero(input.perTransferEuros ?? '');
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Check the amounts and percentage.' });
      }
      const endOn = endPreviousPlanOn(input.validFrom);
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data: openPlans, error: listErr } = await supabase
        .from('driver_pay_plans')
        .select('id, valid_from, valid_to')
        .eq('driver_id', input.driverId)
        .or(`valid_to.is.null,valid_to.gte.${input.validFrom}`);
      if (listErr) throwDb(listErr);
      for (const p of openPlans ?? []) {
        if (p.valid_from >= input.validFrom) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'This pay plan overlaps another plan for the same driver.',
          });
        }
        if (p.valid_to == null || p.valid_to >= input.validFrom) {
          const { error } = await supabase
            .from('driver_pay_plans')
            .update({ valid_to: endOn })
            .eq('id', p.id);
          if (error) throwDb(error);
        }
      }
      const { data, error } = await supabase
        .from('driver_pay_plans')
        .insert({
          driver_id: input.driverId,
          valid_from: input.validFrom,
          monthly_salary_cents: monthly,
          daily_rate_cents: daily,
          hourly_rate_cents: hourly,
          hourly_basis: input.hourlyBasis,
          percent_bp: percentBp,
          percent_base: input.percentBase,
          per_transfer_cents: perTransfer,
          note: input.note?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throwDb(error);
      return { ok: true, id: data!.id };
    },
  }),

  saveDriverPayRate: defineAction({
    accept: 'form',
    input: z.object({
      planId: z.string().uuid(),
      driverId: z.string().uuid(),
      classId: z
        .union([z.string().uuid(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : undefined)),
      fromZoneId: z
        .union([z.string().uuid(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : undefined)),
      toZoneId: z
        .union([z.string().uuid(), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : undefined)),
      amountEuros: z.string().min(1),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      let amount: number;
      try {
        amount = eurosToCents(input.amountEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Check the override amount.' });
      }
      if (amount < 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Check the override amount.' });
      const classId = input.classId ?? null;
      const fromZoneId = input.fromZoneId ?? null;
      const toZoneId = input.toZoneId ?? null;
      if (!classId && !(fromZoneId && toZoneId)) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Pick a vehicle class and/or a route.',
        });
      }
      if ((fromZoneId == null) !== (toZoneId == null)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Pick both zones for a route override.' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('driver_pay_rates').insert({
        plan_id: input.planId,
        class_id: classId,
        from_zone_id: fromZoneId,
        to_zone_id: toZoneId,
        amount_cents: amount,
      });
      if (error) throwDb(error);
      return { ok: true, driverId: input.driverId };
    },
  }),

  deleteDriverPayRate: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      driverId: z.string().uuid(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('driver_pay_rates').delete().eq('id', input.id);
      if (error) throwDb(error);
      return { ok: true, driverId: input.driverId };
    },
  }),

  addDriverAdjustment: defineAction({
    accept: 'form',
    input: z.object({
      driverId: z.string().uuid(),
      kind: z.enum(['tip', 'waiting', 'expense', 'bonus', 'deduction', 'advance']),
      onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountEuros: z.string().min(1),
      bookingReference: z.string().optional().nullable(),
      note: z.string().trim().min(1),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      let amountCents: number;
      try {
        amountCents = adjustmentAmountCents(input.kind, input.amountEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Check the amount.' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      let bookingId: string | null = null;
      const ref = input.bookingReference?.trim();
      if (ref) {
        const { data: b } = await supabase.from('bookings').select('id').eq('reference', ref).maybeSingle();
        if (!b) throw new ActionError({ code: 'BAD_REQUEST', message: 'That booking reference was not found.' });
        bookingId = b.id;
      }
      const { error } = await supabase.from('driver_pay_adjustments').insert({
        driver_id: input.driverId,
        on_date: input.onDate,
        kind: input.kind,
        amount_cents: amountCents,
        booking_id: bookingId,
        note: input.note,
        created_by: staff.userId,
      });
      if (error) throwDb(error);
      return { ok: true };
    },
  }),

  buildDriverStatement: defineAction({
    accept: 'form',
    input: z.object({
      driverId: z.string().uuid(),
      periodKind: z.enum(['week', 'month', 'quarter', 'custom']),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      let period: { from: string; to: string };
      try {
        period = resolveStatementPeriod(
          input.periodKind as PeriodKind,
          input.from ?? null,
          input.to ?? null,
        );
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Check the statement period.' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data, error } = await supabase.rpc('driver_statement_build', {
        p_driver_id: input.driverId,
        p_from: period.from,
        p_to: period.to,
      });
      if (error) throwDb(error);
      return { id: data as string, driverId: input.driverId };
    },
  }),

  recalculateDriverStatement: defineAction({
    accept: 'form',
    input: z.object({
      statementId: z.string().uuid(),
      driverId: z.string().uuid(),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data: st, error: sErr } = await supabase
        .from('driver_statements')
        .select('period_from, period_to, status')
        .eq('id', input.statementId)
        .single();
      if (sErr || !st) throw new ActionError({ code: 'NOT_FOUND', message: 'Statement not found' });
      if (st.status !== 'draft') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This statement is approved and cannot be recalculated',
        });
      }
      const { error } = await supabase.rpc('driver_statement_build', {
        p_driver_id: input.driverId,
        p_from: st.period_from,
        p_to: st.period_to,
      });
      if (error) throwDb(error);
      return { ok: true, id: input.statementId };
    },
  }),

  approveDriverStatement: defineAction({
    accept: 'form',
    input: z.object({ statementId: z.string().uuid() }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.rpc('driver_statement_approve', { p_id: input.statementId });
      if (error) throwDb(error);
      return { ok: true };
    },
  }),

  markDriverStatementPaid: defineAction({
    accept: 'form',
    input: z.object({
      statementId: z.string().uuid(),
      paymentReference: z.string().trim().min(1),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().drivers) throw new ActionError({ code: 'NOT_FOUND', message: 'Not found' });
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.rpc('driver_statement_mark_paid', {
        p_id: input.statementId,
        p_reference: input.paymentReference,
      });
      if (error) throwDb(error);
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

  saveClassRates: defineAction({
    accept: 'form',
    input: z.object({ rowsJson: z.string().min(2) }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      type Row = {
        classKey: string;
        baseFare: string;
        perKm: string;
        perMin: string;
        minimumFare: string;
        kmPerHour?: string;
        extraKmRate?: string;
      };
      let rows: Row[];
      try {
        rows = JSON.parse(input.rowsJson) as Row[];
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid rates payload' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      for (const row of rows) {
        let base_fare: number;
        let per_km: number;
        let per_min: number;
        let minimum_fare: number;
        let km_per_hour: number;
        let extra_km_rate: number;
        const { data: cur } = await supabase
          .from('current_class_rates')
          .select('km_per_hour, extra_km_rate')
          .eq('class_key', row.classKey)
          .maybeSingle();
        try {
          base_fare = eurosOrZero(row.baseFare);
          per_km = eurosOrZero(row.perKm);
          per_min = eurosOrZero(row.perMin);
          minimum_fare = eurosOrZero(row.minimumFare);
          km_per_hour = Math.max(
            1,
            Number(row.kmPerHour ?? cur?.km_per_hour ?? 40) || 40,
          );
          extra_km_rate =
            row.extraKmRate != null && row.extraKmRate !== ''
              ? eurosOrZero(row.extraKmRate)
              : (cur?.extra_km_rate ?? 0);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: `Invalid euros for ${row.classKey}` });
        }
        const { error } = await supabase.rpc('staff_save_class_rate', {
          p_class_key: row.classKey,
          p_base_fare: base_fare,
          p_per_km: per_km,
          p_per_min: per_min,
          p_minimum_fare: minimum_fare,
          p_km_per_hour: km_per_hour,
          p_extra_km_rate: extra_km_rate,
        });
        if (error) {
          console.error(
            JSON.stringify({
              level: 'error',
              code: 'save_class_rates',
              classKey: row.classKey,
              pg: error.code,
              detail: String(error.message ?? '').slice(0, 180),
            }),
          );
          throwDb(error);
        }
      }
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: 'save',
        entity: 'class_rates',
        detail: { classes: rows.map((r) => r.classKey) },
      });
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  savePricingSettings: defineAction({
    accept: 'form',
    input: z.object({ docJson: z.string().min(2) }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(input.docJson) as Record<string, unknown>;
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid settings JSON' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('pricing_settings').insert({
        doc: doc as Json,
        created_by: staff.userId,
      });
      if (error) throwDb(error);
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: 'save',
        entity: 'pricing_settings',
        detail: { keys: Object.keys(doc) },
      });
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  savePricingPeriod: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid().optional().or(z.literal('')),
      label: z.string().min(1),
      startsOn: z.string().min(1),
      endsOn: z.string().min(1),
      plusPercent: z.string(),
      active: z.enum(['true', 'false']).optional(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const pct = Number(input.plusPercent);
      if (!Number.isFinite(pct)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid +%' });
      }
      const factor = 1 + pct / 100;
      if (factor < 1) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Factor must be ≥ 1' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const row = {
        label: input.label,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        factor,
        active: input.active !== 'false',
      };
      const { error } = input.id
        ? await supabase.from('pricing_periods').update(row).eq('id', input.id)
        : await supabase.from('pricing_periods').insert(row);
      if (error) throwDb(error);
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: input.id ? 'update' : 'create',
        entity: 'pricing_periods',
        entityId: input.id || undefined,
        detail: { label: input.label, factor },
      });
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  savePricingAreaFee: defineAction({
    accept: 'form',
    input: z.object({
      id: z.string().uuid(),
      feeEuros: z.string(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      let fee: number;
      try {
        fee = eurosOrZero(input.feeEuros);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid fee' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { error } = await supabase.from('pricing_areas').update({ fee }).eq('id', input.id);
      if (error) throwDb(error);
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: 'save',
        entity: 'pricing_areas',
        entityId: input.id,
        detail: { fee },
      });
      markPricesChanged(ctx.cookies);
      return { ok: true };
    },
  }),

  simulateQuote: defineAction({
    accept: 'json',
    input: z.object({
      type: z.enum(['transfer', 'hourly']),
      fromZone: z.string().min(1),
      toZone: z.string().optional(),
      hours: z.number().int().positive().optional(),
      pickupLocal: pickupLocal,
      passengers: z.number().int().positive().default(2),
      luggage: z.number().int().nonnegative().default(2),
      pickupPlace: z
        .object({ placeId: z.string(), lat: z.number(), lng: z.number() })
        .optional(),
      dropoffPlace: z
        .object({ placeId: z.string(), lat: z.number(), lng: z.number() })
        .optional(),
      stops: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
      overrides: z.record(z.string(), z.unknown()).optional(),
      compareUnsaved: z.boolean().optional(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const site = (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(
        /\/$/,
        '',
      );
      const body = {
        ...input,
        simulate: true,
        overrides: input.compareUnsaved ? input.overrides : undefined,
      };
      const rawBody = JSON.stringify(body);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWithEnv(rawBody, timestamp);
      const res = await fetch(`${site}/api/quote/simulate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tem-timestamp': String(timestamp),
          'x-tem-signature': signature,
          'x-tem-staff': staff.userId,
        },
        body: rawBody,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ActionError({
          code: res.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
          message: (data as { message?: string }).message || `HTTP ${res.status}`,
        });
      }
      return data;
    },
  }),

  addWaitingOrKm: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      kind: z.enum(['waiting', 'extra_km']),
      quantity: z.string(),
      emailLink: z.enum(['true', 'false']).optional(),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      const qty = Number(input.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Enter a positive amount' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select('id, reference, price_cents, class_id, vehicle_classes(key), price_breakdown')
        .eq('reference', input.reference)
        .maybeSingle();
      if (bErr || !booking) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Booking not found' });
      }
      const classKey =
        (booking.vehicle_classes as { key?: string } | null)?.key ||
        (Array.isArray(booking.vehicle_classes)
          ? (booking.vehicle_classes[0] as { key?: string })?.key
          : null);
      const { data: rate } = await supabase
        .from('current_class_rates')
        .select('per_km, per_min, extra_km_rate')
        .eq('class_key', classKey ?? '')
        .maybeSingle();
      const { data: settingsRow } = await supabase
        .from('current_pricing_settings')
        .select('doc')
        .maybeSingle();
      const waiting = (settingsRow?.doc as { waiting?: { airport_free_min?: number; other_free_min?: number; per_min?: number } })
        ?.waiting;
      let addCents = 0;
      let label = '';
      if (input.kind === 'waiting') {
        const free = waiting?.other_free_min ?? 15;
        const billable = Math.max(0, Math.ceil(qty) - free);
        const perMin = waiting?.per_min ?? rate?.per_min ?? 0;
        addCents = billable * perMin;
        label = `Waiting ${Math.ceil(qty)} min (−${free} free)`;
      } else {
        const perKm = rate?.extra_km_rate || rate?.per_km || 0;
        addCents = Math.round(qty * perKm);
        label = `Extra ${qty} km`;
      }
      if (addCents <= 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Nothing to charge after free minutes / zero rate',
        });
      }
      const prev = Array.isArray(booking.price_breakdown) ? booking.price_breakdown : [];
      const breakdown = [...prev, { code: input.kind, label, amount: addCents }];
      const newTotal = booking.price_cents + addCents;
      const site = (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(
        /\/$/,
        '',
      );
      const rawBody = JSON.stringify({
        reference: input.reference,
        addCents,
        breakdown,
        reason: label,
        emailLink: input.emailLink === 'true',
        idempotencyKey: randomUUID(),
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWithEnv(rawBody, timestamp);
      const res = await fetch(`${site}/api/internal/price-adjust`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tem-timestamp': String(timestamp),
          'x-tem-signature': signature,
          'x-tem-staff': staff.userId,
        },
        body: rawBody,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: (data as { message?: string }).message || `Could not adjust (${newTotal})`,
        });
      }
      await logAdminActivity(supabase, {
        actorId: staff.userId,
        actorEmail: staff.email,
        action: 'price_adjust',
        entity: 'bookings',
        entityId: input.reference,
        detail: { kind: input.kind, addCents, label },
      });
      return { ok: true, addCents };
    },
  }),

  checkFlightNow: defineAction({
    accept: 'form',
    input: z.object({ reference: z.string().min(1) }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (!features().flightTracking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Flight tracking is off' });
      }
      const result = await callInternalFlightCheck({ reference: input.reference }, staff.userId);
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      return result.data;
    },
  }),

  setFlightDelay: defineAction({
    accept: 'form',
    input: z.object({
      reference: z.string().min(1),
      arrivalLocal: z.string().min(1),
    }),
    async handler(input, ctx) {
      const staff = requireStaff(ctx.locals);
      if (!features().flightTracking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Flight tracking is off' });
      }
      const provider = (process.env.FLIGHT_PROVIDER || '').toLowerCase();
      if (provider !== 'manual') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Set delay is only available with FLIGHT_PROVIDER=manual',
        });
      }
      let arrivalAt: string;
      try {
        arrivalAt = athensLocalToInstant(input.arrivalLocal.trim()).toISOString();
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Use YYYY-MM-DDTHH:mm for arrival' });
      }
      const result = await callInternalFlightDelay(
        { reference: input.reference, arrivalAt },
        staff.userId,
      );
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      return result.data;
    },
  }),

  saveFlightSettings: defineAction({
    accept: 'form',
    input: z.object({
      bufferDomestic: z.coerce.number().int().min(0).max(180),
      bufferInternational: z.coerce.number().int().min(0).max(180),
      dailyCallCap: z.coerce.number().int().min(1).max(10_000),
      emailCustomer: z.enum(['true', 'false']),
    }),
    async handler(input, ctx) {
      requireStaff(ctx.locals);
      if (!features().flightTracking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Flight tracking is off' });
      }
      const supabase = createSupabaseServerClient(ctx.cookies);
      const rows: { key: string; value: unknown }[] = [
        { key: 'flight_buffer_domestic_min', value: input.bufferDomestic },
        { key: 'flight_buffer_international_min', value: input.bufferInternational },
        { key: 'flight_daily_call_cap', value: input.dailyCallCap },
        { key: 'email_customer_on_flight_change', value: input.emailCustomer === 'true' },
      ];
      for (const r of rows) {
        const { error } = await supabase
          .from('settings')
          .update({ value: r.value as never, is_demo: false })
          .eq('key', r.key);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
      }
      return { ok: true };
    },
  }),
};
