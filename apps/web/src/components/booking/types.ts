export type Step = 'search' | 'vehicle' | 'details' | 'review' | 'handoff';

export type BookingStrings = Record<string, string>;

export type ContactInfo = { phone: string; email: string };

export type SearchState = {
  type: 'transfer' | 'hourly';
  fromZone: string;
  toZone: string;
  hours: number;
  pickupLocal: string;
  passengers: number;
  luggage: number;
};

export type DetailsState = {
  pickupAddress: string;
  dropoffAddress: string;
  flightNumber: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  extras: string[];
  needInvoice: boolean;
  invoiceCompany: string;
  invoiceVat: string;
  invoiceTaxOffice: string;
  invoiceAddress: string;
  consent: boolean;
};

export type OptionsData = Awaited<
  ReturnType<typeof import('./api').bookingApi.options>
>['data'];

export type QuoteData = Awaited<ReturnType<typeof import('./api').bookingApi.quote>>['data'];

export type HoldData = Awaited<ReturnType<typeof import('./api').bookingApi.createHold>>['data'];

export type BookingData = Awaited<
  ReturnType<typeof import('./api').bookingApi.createBooking>
>['data'];

export type BookingState = {
  step: Step;
  options: OptionsData | null;
  search: SearchState;
  quote: QuoteData | null;
  hold: HoldData | null;
  serverSkewMs: number;
  details: DetailsState;
  booking: BookingData | null;
  selectedClassKey: string | null;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  holdExpiredMessage: boolean;
};

export const initialDetails = (): DetailsState => ({
  pickupAddress: '',
  dropoffAddress: '',
  flightNumber: '',
  name: '',
  email: '',
  phone: '',
  notes: '',
  extras: [],
  needInvoice: false,
  invoiceCompany: '',
  invoiceVat: '',
  invoiceTaxOffice: '',
  invoiceAddress: '',
  consent: false,
});

export const initialSearch = (): SearchState => ({
  type: 'transfer',
  fromZone: '',
  toZone: '',
  hours: 3,
  pickupLocal: '',
  passengers: 2,
  luggage: 2,
});
