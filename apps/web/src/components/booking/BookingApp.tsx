import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatVatRate } from '../../lib/booking/pricing';
import { parseBookingPrefill, quoteRequestBody } from '../../lib/booking/prefill';
import { BookingApiError, bookingApi } from './api';
import { formatEuroV2 } from './format';
import { Handoff } from './Handoff';
import { bookingReducer, createInitialState, stepFromHash } from './reducer';
import { StepDetails } from './StepDetails';
import { StepReview, type ReviewTarget } from './StepReview';
import { StepSearch } from './StepSearch';
import { StepVehicle, defaultVehicleKey } from './StepVehicle';
import { getTurnstileToken } from './turnstile';
import type { BookingStrings, ContactInfo } from './types';
import {
  BookingHero,
  type HeroHeader,
  type HeroHold,
  type HeroStepKey,
} from './v2/BookingHero';
import { BookingSummary, type BookingSummaryProps } from './v2/BookingSummary';
import { fill, formatWhen, hoursText, isPickupLocal, routeLines } from './v2/journey';

export type BookingAppProps = {
  strings: BookingStrings;
  turnstileSiteKey: string;
  contact: ContactInfo;
  header: HeroHeader;
  /** PUBLIC_ADDRESS_AUTOCOMPLETE=true and server key present (build-time public flag). */
  addressAutocomplete?: boolean;
  /** FEATURE_DISTANCE_PRICING (publicFeatures). */
  distancePricing?: boolean;
  /** wa.me URL when FEATURE_WHATSAPP is on. */
  whatsappHref?: string | null;
};

function skewFromDateHeader(dateHeader: string | null): number {
  if (!dateHeader) return 0;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return 0;
  return Date.now() - server;
}

function focusStepHeading() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-block="appHero"] h1')?.focus();
  });
}

function focusErrorSummary() {
  requestAnimationFrame(() => {
    document.getElementById('error-summary')?.focus();
  });
}

export default function BookingApp({
  strings,
  turnstileSiteKey,
  contact,
  header,
  addressAutocomplete = false,
  distancePricing = false,
  whatsappHref = null,
}: BookingAppProps) {
  const [state, dispatch] = useReducer(bookingReducer, undefined, createInitialState);
  const [preferredClassKey, setPreferredClassKey] = useState<string | null>(null);
  const [pickedClassKey, setPickedClassKey] = useState<string | null>(null);
  const syncHash = useRef(true);
  const prevStep = useRef(state.step);

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
    const from = prevStep.current;
    prevStep.current = state.step;
    if (!syncHash.current) return;
    const next = `#${state.step}`;
    if (window.location.hash !== next) {
      window.history.pushState(null, '', next);
    }
    // The hand-off dialog takes focus itself and gives it back to "Pay" on close.
    if (state.step === 'handoff' || from === 'handoff') return;
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
    // Catch incomplete journey fields here so we never POST a Zod-invalid /api/quote body (400).
    const msg = (key: string, fallback: string) => strings[key] ?? fallback;
    const missing: Record<string, string> = {};
    if (!state.search.fromZone) missing.fromZone = msg('booking.error.fromZone', 'Choose a pick-up zone.');
    if (state.search.type === 'transfer') {
      if (!state.search.toZone) missing.toZone = msg('booking.error.toZone', 'Choose a drop-off zone.');
      else if (state.search.fromZone === state.search.toZone) {
        missing.toZone = msg('booking.error.sameZone', 'Pick-up and drop-off must be different zones.');
      }
      if (!state.details.dropoffAddress.trim()) {
        missing.dropoffAddress = msg('booking.error.dropoffAddress', 'Enter a drop-off address or hotel name.');
      }
    } else if (!(state.search.hours > 0)) {
      missing.hours = msg('booking.error.hours', 'Choose how many hours you need.');
    }
    if (!isPickupLocal(state.search.pickupLocal)) {
      missing.pickupLocal = msg('booking.error.pickupLocal', 'Choose a pick-up date and time.');
    }
    if (!state.details.pickupAddress.trim()) {
      missing.pickupAddress = msg('booking.error.pickupAddress', 'Enter a pick-up address or hotel name.');
    }
    if (Object.keys(missing).length) {
      dispatch({ type: 'SET_ERRORS', errors: missing, formError: strings['booking.errors.summary'] });
      focusErrorSummary();
      return;
    }
    dispatch({ type: 'BUSY', busy: true });
    dispatch({ type: 'CLEAR_ERRORS' });
    try {
      const body = quoteRequestBody(state.search);
      const { data } = await bookingApi.quote(body);
      setPickedClassKey(null);
      dispatch({ type: 'QUOTE_OK', quote: data });
    } catch (e) {
      if (e instanceof BookingApiError && e.body.error === 'no_price') {
        setPickedClassKey(null);
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

  /** Creates the hold. Returns false when it failed (the error is already in state). */
  const selectVehicle = async (classKey: string): Promise<boolean> => {
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
      return true;
    } catch (e) {
      const err = mapApiError(e);
      dispatch({ type: 'SET_ERRORS', ...err });
      return false;
    } finally {
      dispatch({ type: 'BUSY', busy: false });
    }
  };

  /** Frees whatever the customer is holding: the pending booking (review) or the bare hold (details). */
  const releaseHeld = async () => {
    try {
      if (state.booking) await bookingApi.releaseBooking(state.booking.reference);
      else if (state.hold) await bookingApi.releaseHold(state.hold.holdId);
    } catch {
      /* still leave the step */
    }
    dispatch({ type: 'CLEAR_BOOKING' });
    dispatch({ type: 'CLEAR_HOLD' });
  };

  const goTo = async (target: ReviewTarget) => {
    dispatch({ type: 'BUSY', busy: true });
    // Back to Details keeps the typed data and takes a fresh hold on the same vehicle.
    const classKey = state.selectedClassKey;
    await releaseHeld();
    dispatch({ type: 'BUSY', busy: false });
    dispatch({ type: 'CLEAR_HOLD_EXPIRED' });
    if (target === 'details') {
      if (classKey && (await selectVehicle(classKey))) return;
      dispatch({ type: 'SET_STEP', step: 'vehicle' });
      return;
    }
    dispatch({ type: 'SET_STEP', step: target });
  };

  const goStep = (step: HeroStepKey) => {
    if (state.busy || step === 'review') return;
    void goTo(step);
  };

  const submitBooking = async () => {
    if (!state.hold) return;
    const errors: Record<string, string> = {};
    const msg = (key: string, fallback: string) => strings[key] ?? fallback;
    if (!state.details.pickupAddress) {
      errors.pickupAddress = msg('booking.error.pickupAddress', 'Enter a pick-up address or hotel name.');
    }
    if (state.search.type === 'transfer' && !state.details.dropoffAddress) {
      errors.dropoffAddress = msg('booking.error.dropoffAddress', 'Enter a drop-off address or hotel name.');
    }
    if (!state.details.name) errors.name = msg('booking.error.name', 'Enter your full name.');
    if (!state.details.email) errors.email = msg('booking.error.email', 'Enter a valid email address.');
    if (!state.details.phone) {
      errors.phone = msg('booking.error.phone', 'Enter a phone number we can reach you on.');
    }
    if (!state.details.consent) {
      errors.consent = msg('booking.error.consent', 'Please accept the terms to continue.');
    }
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
      if (state.details.pickupPlace) body.pickupPlace = state.details.pickupPlace;
      if (state.search.type === 'transfer' && state.details.dropoffPlace) {
        body.dropoffPlace = state.details.dropoffPlace;
      }
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

  const { options, step } = state;
  const heroStep: HeroStepKey = step === 'handoff' ? 'review' : step;
  const titleKey = {
    search: 'booking.search.title',
    vehicle: 'booking.vehicle.title',
    details: 'booking.details.title',
    review: 'booking.review.title',
  }[heroStep];

  // Which vehicle the aside shows: the held one, else the radio that is on, else a suggestion.
  const heldClass = options?.classes.find((c) => c.key === state.selectedClassKey);
  const radioKey = options && state.quote ? defaultVehicleKey(state.quote, pickedClassKey, preferredClassKey) : null;
  const shownClass =
    heldClass ??
    (step === 'vehicle' ? options?.classes.find((c) => c.key === radioKey) : undefined) ??
    options?.classes.find((c) => c.key === preferredClassKey) ??
    options?.classes.find((c) => c.photo) ??
    options?.classes[0];

  const holdExpiresAt = state.booking?.holdExpiresAt ?? state.hold?.expiresAt;
  const hold: HeroHold | null =
    holdExpiresAt && heldClass && (step === 'details' || step === 'review' || step === 'handoff')
      ? {
          expiresAt: holdExpiresAt,
          serverSkewMs: state.serverSkewMs,
          label: fill(strings['booking.hold.badge'], { vehicle: heldClass.name }).toUpperCase(),
          timerLabel: strings['booking.heldFor'] ?? '',
          announceTemplate: strings['booking.hold.timer'] ?? '{minutes}',
          warningText: strings['booking.hold.warning'] ?? '',
          onExpired: onHoldExpired,
        }
      : null;

  let summary: BookingSummaryProps | null = null;
  if (options && shownClass) {
    const route = routeLines(strings, options, state.search);
    const when = formatWhen(state.search.pickupLocal);
    const quoted = state.quote?.options.find((o) => o.classKey === shownClass.key);
    const lineLabel =
      state.search.type === 'transfer'
        ? fill(strings['booking.summary.line'], { vehicle: shownClass.name })
        : `${shownClass.name} · ${hoursText(strings, state.search.hours)}`;
    const total = (label: string, cents: number) => ({ label, value: formatEuroV2(cents) });
    let lines: BookingSummaryProps['lines'] = [];
    let sum: BookingSummaryProps['total'];
    let analysis: BookingSummaryProps['analysis'];
    if (state.booking && (step === 'review' || step === 'handoff')) {
      const b = state.booking;
      lines = b.lines.map((l) => ({ label: l.label, value: formatEuroV2(l.cents) }));
      analysis = {
        title: strings['booking.review.priceAnalysis'] ?? '',
        net: total(strings['booking.review.net'] ?? '', b.totalCents - b.vatCents),
        vat: total(
          fill(strings['booking.review.vat'], { rate: formatVatRate(b.vatRateBp) }),
          b.vatCents,
        ),
        total: total(strings['booking.total'] ?? '', b.totalCents),
      };
    } else if (step === 'details' && state.hold) {
      // Display only: the base price from the hold plus each chosen extra's listed price. No sum here;
      // the server totals it when the booking is created.
      const extras = state.details.extras.flatMap((e) => {
        const ex = options.extras.find((x) => x.code === e.code);
        return ex ? [{ label: ex.name, value: formatEuroV2(ex.priceCents) }] : [];
      });
      lines = [{ label: lineLabel, value: formatEuroV2(state.hold.baseCents) }, ...extras];
      if (extras.length === 0) sum = total(strings['booking.total'] ?? '', state.hold.baseCents);
    } else if (step === 'vehicle' && quoted?.baseCents != null) {
      lines = [{ label: lineLabel, value: formatEuroV2(quoted.baseCents) }];
      sum = total(strings['booking.total'] ?? '', quoted.baseCents);
    }
    summary = {
      step,
      ariaLabel: strings['booking.summary.title'] ?? '',
      vehicle: {
        eyebrow: step === 'search' ? (strings['booking.summary.suggested'] ?? '') : (shownClass.tagline ?? ''),
        name: shownClass.name,
        photoUrl: shownClass.photo?.url,
      },
      routeLabel: strings['booking.summary.route'] ?? '',
      route: { from: route.from, to: route.second, arrow: route.to !== null },
      rows: [
        {
          label: strings['booking.summary.datetime'] ?? '',
          value: when ? `${when.date}, ${when.time}` : '—',
        },
        {
          label: strings['booking.summary.paxBags'] ?? '',
          value: `${state.search.passengers} · ${state.search.luggage}`,
        },
      ],
      lines,
      total: sum,
      analysis,
      notes: lines.length > 0 ? [strings['booking.priceNote'] ?? ''] : [],
      help: {
        label: strings['booking.summary.help'] ?? '',
        phone: contact.phone,
        href: `tel:${contact.phone.replace(/[^\d+]/g, '')}`,
      },
    };
  }

  let main;
  if (!options) {
    main = (
      <div className="s8f7a6">
        {state.formError ? (
          <div className="notice notice-danger" role="alert">
            {state.formError}
          </div>
        ) : (
          <p className="s0a0a6" role="status">
            {strings['booking.loading']}
          </p>
        )}
      </div>
    );
  } else if (step === 'search') {
    main = (
      <StepSearch
        strings={strings}
        options={options}
        search={state.search}
        details={state.details}
        errors={state.errors}
        formError={state.formError}
        busy={state.busy}
        addressAutocomplete={addressAutocomplete}
        distancePricing={distancePricing}
        whatsappHref={whatsappHref}
        onChange={(patch) => dispatch({ type: 'SET_SEARCH', patch })}
        onChangeDetails={(patch) => dispatch({ type: 'SET_DETAILS', patch })}
        onSubmit={submitQuote}
      />
    );
  } else if (step === 'vehicle' && state.quote) {
    main = (
      <StepVehicle
        strings={strings}
        options={options}
        search={state.search}
        quote={state.quote}
        contact={contact}
        busy={state.busy}
        holdExpiredMessage={state.holdExpiredMessage}
        formError={state.formError}
        preferredClassKey={preferredClassKey}
        pickedClassKey={pickedClassKey}
        onPick={setPickedClassKey}
        onSelect={(classKey) => void selectVehicle(classKey)}
        onBack={() => {
          dispatch({ type: 'CLEAR_HOLD_EXPIRED' });
          dispatch({ type: 'SET_STEP', step: 'search' });
        }}
      />
    );
  } else if (step === 'details' && state.hold && state.selectedClassKey) {
    main = (
      <StepDetails
        strings={strings}
        options={options}
        search={state.search}
        details={state.details}
        errors={state.errors}
        formError={state.formError}
        busy={state.busy}
        onChange={(patch) => dispatch({ type: 'SET_DETAILS', patch })}
        onSubmit={submitBooking}
        onBack={() => void goTo('vehicle')}
      />
    );
  } else if ((step === 'review' || step === 'handoff') && state.booking) {
    main = (
      <StepReview
        strings={strings}
        options={options}
        search={state.search}
        details={state.details}
        classKey={state.selectedClassKey}
        booking={state.booking}
        busy={state.busy}
        formError={state.formError}
        onPay={pay}
        onEdit={(target) => void goTo(target)}
      >
        {step === 'handoff' && (
          <Handoff
            checkoutUrl={state.booking.checkoutUrl}
            total={formatEuroV2(state.booking.totalCents)}
            strings={strings}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'review' })}
          />
        )}
      </StepReview>
    );
  }

  return (
    <>
      <BookingHero
        header={header}
        step={heroStep}
        title={strings[titleKey] ?? ''}
        stepLabels={[
          strings['booking.step.journey'] ?? '',
          strings['booking.step.vehicle'] ?? '',
          strings['booking.step.details'] ?? '',
          strings['booking.step.payment'] ?? '',
        ]}
        stepsLabel={strings['booking.summary.title'] ?? ''}
        hold={hold}
        onGoStep={goStep}
      />
      <section data-block="appBody" className="s39f3a" id="booking-app">
        {main}
        {summary ? <BookingSummary {...summary} /> : null}
      </section>
    </>
  );
}
