import type { BookingState, DetailsState, SearchState, Step } from './types';
import { initialDetails, initialSearch } from './types';

export type Action =
  | { type: 'OPTIONS'; options: BookingState['options'] }
  | { type: 'SET_SEARCH'; patch: Partial<SearchState> }
  | { type: 'SET_DETAILS'; patch: Partial<DetailsState> }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'QUOTE_OK'; quote: BookingState['quote'] }
  | {
      type: 'HOLD_OK';
      hold: NonNullable<BookingState['hold']>;
      classKey: string;
      serverSkewMs: number;
    }
  | { type: 'CLEAR_HOLD' }
  | { type: 'CLEAR_BOOKING' }
  | { type: 'BOOKING_OK'; booking: NonNullable<BookingState['booking']>; serverSkewMs: number }
  | { type: 'SET_ERRORS'; errors: Record<string, string>; formError?: string | null }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'BUSY'; busy: boolean }
  | { type: 'HOLD_EXPIRED' }
  | { type: 'CLEAR_HOLD_EXPIRED' }
  | { type: 'SELECT_CLASS'; classKey: string }
  | { type: 'QUOTE_REFRESHED'; quote: BookingState['quote'] };

export function createInitialState(): BookingState {
  return {
    step: 'search',
    options: null,
    search: initialSearch(),
    quote: null,
    hold: null,
    serverSkewMs: 0,
    details: initialDetails(),
    booking: null,
    selectedClassKey: null,
    errors: {},
    formError: null,
    busy: false,
    holdExpiredMessage: false,
  };
}

export function bookingReducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case 'OPTIONS':
      return {
        ...state,
        options: action.options,
        search: {
          ...state.search,
          fromZone: state.search.fromZone || action.options?.zones[0]?.code || '',
          toZone: state.search.toZone || action.options?.zones[1]?.code || action.options?.zones[0]?.code || '',
          hours: action.options?.classes.find((c) => c.hourly)?.hourly?.minHours ?? state.search.hours,
        },
      };
    case 'SET_SEARCH':
      return { ...state, search: { ...state.search, ...action.patch } };
    case 'SET_DETAILS':
      return { ...state, details: { ...state.details, ...action.patch } };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'QUOTE_OK':
      return {
        ...state,
        quote: action.quote,
        step: 'vehicle',
        formError: null,
        errors: {},
        hold: null,
        selectedClassKey: null,
        booking: null,
      };
    case 'HOLD_OK':
      return {
        ...state,
        hold: action.hold,
        selectedClassKey: action.classKey,
        serverSkewMs: action.serverSkewMs,
        step: 'details',
        formError: null,
        errors: {},
        holdExpiredMessage: false,
      };
    case 'CLEAR_HOLD':
      return { ...state, hold: null, selectedClassKey: null };
    case 'CLEAR_BOOKING':
      return { ...state, booking: null };
    case 'BOOKING_OK':
      return {
        ...state,
        booking: action.booking,
        serverSkewMs: action.serverSkewMs,
        step: 'review',
        formError: null,
        errors: {},
      };
    case 'SET_ERRORS':
      return {
        ...state,
        errors: action.errors,
        formError: action.formError ?? null,
      };
    case 'CLEAR_ERRORS':
      return { ...state, errors: {}, formError: null };
    case 'BUSY':
      return { ...state, busy: action.busy };
    case 'HOLD_EXPIRED':
      return {
        ...state,
        hold: null,
        selectedClassKey: null,
        booking: null,
        step: 'vehicle',
        holdExpiredMessage: true,
      };
    case 'CLEAR_HOLD_EXPIRED':
      return { ...state, holdExpiredMessage: false };
    case 'SELECT_CLASS':
      return {
        ...state,
        selectedClassKey: action.classKey,
        step: 'details',
        formError: null,
        errors: {},
        holdExpiredMessage: false,
      };
    case 'QUOTE_REFRESHED':
      return {
        ...state,
        quote: action.quote,
        holdExpiredMessage: false,
        formError: null,
        errors: {},
      };
    default:
      return state;
  }
}

export function stepFromHash(hash: string): Step | null {
  const h = hash.replace(/^#/, '');
  if (h === 'search' || h === 'vehicle' || h === 'details' || h === 'review' || h === 'handoff') {
    return h;
  }
  return null;
}
