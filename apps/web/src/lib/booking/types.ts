import type { UiStringKey } from '../strings';

export type BookingType = 'transfer' | 'hourly';

export type ErrorCode =
  | 'invalid_request'
  | 'no_price'
  | 'unavailable'
  | 'payment_failed'
  | 'quote_expired'
  // FIX-2 distance-first quotes (docs/API.md)
  | 'return_before_outbound'
  | 'pickup_too_soon'
  | 'outside_area'
  | 'no_route'
  | 'quote_only_distance'
  | 'not_priced'
  | 'service_unavailable';


export class BookingError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly stringKey: UiStringKey;
  readonly vars?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      field?: string;
      stringKey: UiStringKey;
      vars?: Record<string, string | number>;
    },
  ) {
    super(options.message ?? code);
    this.name = 'BookingError';
    this.code = code;
    this.field = options.field;
    this.stringKey = options.stringKey;
    this.vars = options.vars;
  }
}
