import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { StepIndicator, SummaryCard } from '../ui';
import { parseBookingPrefill, quoteRequestBody } from '../../lib/booking/prefill';
import { BookingApiError, bookingApi } from './api';
import { formatEuro } from './format';
import { Handoff } from './Handoff';
import { bookingReducer, createInitialState, stepFromHash } from './reducer';
import { StepDetails } from './StepDetails';
import { StepReview } from './StepReview';
import { StepSearch } from './StepSearch';
import { StepVehicle } from './StepVehicle';
import { getTurnstileToken } from './turnstile';
import type { BookingStrings, ContactInfo, Step } from './types';

export type BookingAppProps = {
  strings: BookingStrings;
  turnstileSiteKey: string;
  contact: ContactInfo;
};

const STEPS: Step[] = ['search', 'vehicle', 'details', 'review', 'handoff'];
function skewFromDateHeader(dateHeader: string | null): number {
  if (!dateHeader) return 0;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return 0;
  return Date.now() - server;
}

function focusStepHeading() {
  requestAnimationFrame(() => {
    const h1 = document.querySelector<HTMLElement>('#booking-app h1');
    h1?.focus();
  });
}

function focusErrorSummary() {
  requestAnimationFrame(() => {
    document.getElementById('error-summary')?.focus();
  });
}

export default function BookingApp({ strings, turnstileSiteKey, contact }: BookingAppProps) {
  const [state, dispatch] = useReducer(bookingReducer, undefined, createInitialState);
  const [preferredClassKey, setPreferredClassKey] = useState<string | null>(null);
  const syncHash = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await bookingApi.options();
        if (cancelled) return;
        dispatch({ type: 'OPTIONS', options: data });
        const q = new URLSearchParams(window.location.search);
        const prefill = parseBookingPrefill(q, data);
        if (Object.keys(prefill.search).length) {
          dispatch({ type: 'SET_SEARCH', patch: prefill.search });
        }
        if (prefill.classKey) setPreferredClassKey(prefill.classKey);
      } catch {
        if (!cancelled) {
          dispatch({
            type: 'SET_ERRORS',
            errors: {},
            formError: strings['booking.network'],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strings]);

  useEffect(() => {
    if (!syncHash.current) return;
    const next = `#${state.step}`;
    if (window.location.hash !== next) {
      window.history.pushState(null, '', next);
    }
    focusStepHeading();
  }, [state.step]);

  useEffect(() => {
    const onPop = () => {
      const step = stepFromHash(window.location.hash) ?? 'search';
      syncHash.current = false;
      dispatch({ type: 'SET_STEP', step });
      requestAnimationFrame(() => {
        syncHash.current = true;
        focusStepHeading();
      });
    };
    window.addEventListener('popstate', onPop);
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#search');
    }
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const mapApiError = useCallback(
    (e: unknown) => {
      if (e instanceof BookingApiError) {
        if (e.body.message === 'network' || e.status === 0) {
          return { errors: {}, formError: strings['booking.network'] };
        }
        return {
          errors: e.body.fields ?? {},
          formError: e.body.message || strings['error.invalid_request'],
        };
      }
      return { errors: {}, formError: strings['booking.network'] };
    },
    [strings],
  );

  const submitQuote = async () => {
    dispatch({ type: 'BUSY', busy: true });
    dispatch({ type: 'CLEAR_ERRORS' });
    try {
      const body = quoteRequestBody(state.search);
      const { data } = await bookingApi.quote(body);
      dispatch({ type: 'QUOTE_OK', quote: data });
    } catch (e) {
      if (e instanceof BookingApiError && e.body.error === 'no_price') {
        dispatch({
          type: 'QUOTE_OK',
          quote: {
            pickupAt: state.search.pickupLocal,
            durationMinutes: 0,
            currency: 'EUR',
            options: [],
          },
        });
      } else {
        const err = mapApiError(e);
        dispatch({ type: 'SET_ERRORS', ...err });
        focusErrorSummary();
      }
    } finally {
      dispatch({ type: 'BUSY', busy: false });
    }
  };

  const selectVehicle = async (classKey: string) => {
    dispatch({ type: 'BUSY', busy: true });
    dispatch({ type: 'CLEAR_ERRORS' });
    try {
      const token = await getTurnstileToken(turnstileSiteKey);
      const body =
        state.search.type === 'transfer'
          ? {
              type: 'transfer' as const,
              fromZone: state.search.fromZone,
              toZone: state.search.toZone,
              pickupLocal: state.search.pickupLocal,
              passengers: state.search.passengers,
              luggage: state.search.luggage,
              classKey,
              turnstileToken: token,
            }
          : {
              type: 'hourly' as const,
              fromZone: state.search.fromZone,
              hours: state.search.hours,
              pickupLocal: state.search.pickupLocal,
              passengers: state.search.passengers,
              luggage: state.search.luggage,
              classKey,
              turnstileToken: token,
            };
      const { data, dateHeader } = await bookingApi.createHold(body);
      dispatch({
        type: 'HOLD_OK',
        hold: data,
        classKey,
        serverSkewMs: skewFromDateHeader(dateHeader),
      });
    } catch (e) {
      const err = mapApiError(e);
      dispatch({ type: 'SET_ERRORS', ...err });
    } finally {
      dispatch({ type: 'BUSY', busy: false });
    }
  };

  const releaseHoldAndBack = async () => {
    if (state.hold) {
      try {
        await bookingApi.releaseHold(state.hold.holdId);
      } catch {
        /* still leave the step */
      }
    }
    dispatch({ type: 'CLEAR_HOLD' });
    dispatch({ type: 'SET_STEP', step: 'vehicle' });
  };

  const submitBooking = async () => {
    if (!state.hold) return;
    const errors: Record<string, string> = {};
    if (!state.details.pickupAddress) errors.pickupAddress = strings['error.invalid_request'] ?? '';
    if (state.search.type === 'transfer' && !state.details.dropoffAddress) {
      errors.dropoffAddress = strings['error.invalid_request'] ?? '';
    }
    if (!state.details.name) errors.name = strings['error.invalid_request'] ?? '';
    if (!state.details.email) errors.email = strings['error.invalid_request'] ?? '';
    if (!state.details.phone) errors.phone = strings['error.invalid_request'] ?? '';
    if (!state.details.consent) errors.consent = strings['error.invalid_request'] ?? '';
    if (Object.keys(errors).length) {
      dispatch({ type: 'SET_ERRORS', errors, formError: strings['booking.errors.summary'] });
      focusErrorSummary();
      return;
    }

    dispatch({ type: 'BUSY', busy: true });
    dispatch({ type: 'CLEAR_ERRORS' });
    try {
      const token = await getTurnstileToken(turnstileSiteKey);
      const body: Record<string, unknown> = {
        holdId: state.hold.holdId,
        pickupAddress: state.details.pickupAddress,
        passengers: state.search.passengers,
        luggage: state.search.luggage,
        extras: state.details.extras,
        customer: {
          name: state.details.name,
          email: state.details.email,
          phone: state.details.phone,
        },
        consent: true,
        turnstileToken: token,
      };
      if (state.search.type === 'transfer') body.dropoffAddress = state.details.dropoffAddress;
      if (state.details.flightNumber) body.flightNumber = state.details.flightNumber;
      if (state.details.notes) body.notes = state.details.notes;
      if (state.details.needInvoice) {
        body.invoice = {
          company: state.details.invoiceCompany,
          vat: state.details.invoiceVat,
          taxOffice: state.details.invoiceTaxOffice,
          address: state.details.invoiceAddress,
        };
      }
      const { data, dateHeader } = await bookingApi.createBooking(body);
      dispatch({
        type: 'BOOKING_OK',
        booking: data,
        serverSkewMs: skewFromDateHeader(dateHeader),
      });
    } catch (e) {
      const err = mapApiError(e);
      dispatch({ type: 'SET_ERRORS', ...err });
      focusErrorSummary();
    } finally {
      dispatch({ type: 'BUSY', busy: false });
    }
  };

  const pay = () => {
    if (!state.booking) return;
    dispatch({ type: 'SET_STEP', step: 'handoff' });
  };

  const onHoldExpired = useCallback(() => {
    dispatch({ type: 'HOLD_EXPIRED' });
  }, []);

  if (!state.options) {
    return (
      <div id="booking-app" className="wrap section">
        <p>{strings['booking.loading']}</p>
      </div>
    );
  }

  const stepIndex = Math.max(0, STEPS.indexOf(state.step === 'handoff' ? 'review' : state.step));

  // Summary: shown once a vehicle is held. It displays server data only; no price is computed here.
  const cls = state.options.classes.find((c) => c.key === state.selectedClassKey);
  const zoneName = (code: string) => state.options?.zones.find((z) => z.code === code)?.name ?? code;
  const showSummary =
    cls && (state.step === 'details' || state.step === 'review') && (state.hold || state.booking);
  const journey = state.search;
  const summary = showSummary ? (
    <SummaryCard
      label="Booking summary"
      title={cls.name}
      photoUrl={cls.photo?.url}
      rows={[
        {
          label: strings['booking.pickup.zone'] ?? '',
          value: zoneName(journey.fromZone),
        },
        ...(journey.type === 'transfer'
          ? [{ label: strings['booking.dropoff.zone'] ?? '', value: zoneName(journey.toZone) }]
          : [{ label: strings['booking.hours.label'] ?? '', value: journey.hours }]),
        {
          label: strings['booking.pickup.datetime'] ?? '',
          value: `${journey.pickupLocal.replace('T', ' ')} (Athens)`,
        },
        { label: `${strings['booking.passengers']} · ${strings['booking.luggage']}`, value: `${journey.passengers} · ${journey.luggage}` },
      ]}
      lines={
        state.step === 'details' && state.hold
          ? [{ label: cls.name, value: formatEuro(state.hold.baseCents) }]
          : []
      }
      note={strings['booking.priceNote']}
    />
  ) : null;

  return (
    <div id="booking-app" className="wrap section booking-v2">
      <p className="eyebrow">{strings['home.eyebrow'] ?? 'VIP Transfer'}</p>
      <StepIndicator
        steps={[
          strings['booking.step.journey'] ?? 'Journey',
          strings['booking.step.vehicle'] ?? 'Vehicle',
          strings['booking.step.details'] ?? 'Details',
          strings['booking.step.payment'] ?? 'Payment',
        ]}
        current={stepIndex}
        label={strings['booking.summary.title'] ?? 'Booking steps'}
      />

      <div className={`booking-layout${summary ? ' has-aside' : ''}`}>
        <div className="booking-main">
          {state.step === 'search' && (
            <StepSearch
              strings={strings}
              options={state.options}
              search={state.search}
              errors={state.errors}
              formError={state.formError}
              busy={state.busy}
              onChange={(patch) => dispatch({ type: 'SET_SEARCH', patch })}
              onSubmit={submitQuote}
            />
          )}
          {state.step === 'vehicle' && state.quote && (
            <StepVehicle
              strings={strings}
              options={state.options}
              search={state.search}
              quote={state.quote}
              contact={contact}
              busy={state.busy}
              holdExpiredMessage={state.holdExpiredMessage}
              formError={state.formError}
              preferredClassKey={preferredClassKey}
              onSelect={selectVehicle}
              onChangeSearch={() => {
                dispatch({ type: 'CLEAR_HOLD_EXPIRED' });
                dispatch({ type: 'SET_STEP', step: 'search' });
              }}
            />
          )}
          {state.step === 'details' && state.hold && state.selectedClassKey && (
            <StepDetails
              strings={strings}
              options={state.options}
              search={state.search}
              hold={state.hold}
              details={state.details}
              selectedClassKey={state.selectedClassKey}
              serverSkewMs={state.serverSkewMs}
              errors={state.errors}
              formError={state.formError}
              busy={state.busy}
              onChange={(patch) => dispatch({ type: 'SET_DETAILS', patch })}
              onSubmit={submitBooking}
              onBack={releaseHoldAndBack}
              onHoldExpired={onHoldExpired}
            />
          )}
          {state.step === 'review' && state.booking && (
            <StepReview
              strings={strings}
              booking={state.booking}
              serverSkewMs={state.serverSkewMs}
              busy={state.busy}
              formError={state.formError}
              onPay={pay}
              onHoldExpired={onHoldExpired}
            />
          )}
          {state.step === 'handoff' && state.booking && (
            <Handoff checkoutUrl={state.booking.checkoutUrl} strings={strings} />
          )}
        </div>
        {summary && <aside className="booking-aside">{summary}</aside>}
      </div>
    </div>
  );
}