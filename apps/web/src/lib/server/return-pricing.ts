import 'server-only';
import { applyReturnDiscount } from '@tem/pricing';
import { BookingError } from '../booking/types';

export type ReturnLegInput = {
  pickupLocal: string;
  flightNumber?: string;
};

export type LegMoney = {
  baseCents: number | null;
  available: boolean;
  reason?: string;
  breakdown?: { code: string; label: string; amount: number }[];
};

/** Merge outbound + return into widget/quote option fields. */
export function mergeReturnOption(
  outbound: LegMoney,
  ret: LegMoney,
  discountPct: number,
): LegMoney & {
  outbound: number | null;
  return: number | null;
  total: number | null;
  returnDiscountPct: number;
  returnBreakdown?: { code: string; label: string; amount: number }[];
} {
  const out = outbound.baseCents;
  let retCents = ret.baseCents;
  let returnBreakdown = ret.breakdown;
  if (retCents != null && discountPct > 0) {
    const before = retCents;
    retCents = applyReturnDiscount(retCents, discountPct);
    const saved = before - retCents;
    if (saved > 0) {
      returnBreakdown = [
        ...(returnBreakdown ?? []),
        {
          code: 'return_discount',
          label: `Return discount −${discountPct} %`,
          amount: -saved,
        },
      ];
    }
  }
  const bothPriced = out != null && retCents != null;
  const total = bothPriced ? out + retCents : null;
  return {
    baseCents: total,
    available: Boolean(bothPriced && outbound.available && ret.available),
    reason: !bothPriced
      ? outbound.reason || ret.reason || 'no_price'
      : !outbound.available || !ret.available
        ? 'unavailable'
        : undefined,
    breakdown: outbound.breakdown,
    outbound: out,
    return: retCents,
    total,
    returnDiscountPct: discountPct,
    returnBreakdown,
  };
}

export function assertReturnAfterOutbound(
  outboundPickup: Date,
  outboundDurationMin: number,
  returnPickup: Date,
): void {
  const end = outboundPickup.getTime() + outboundDurationMin * 60_000;
  if (returnPickup.getTime() < end) {
    throw new BookingError('invalid_request', {
      stringKey: 'booking.return.tooSoon',
      message: 'return_too_soon',
      field: 'return',
    });
  }
}
