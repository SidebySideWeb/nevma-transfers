import type { DetailsState, QuoteData, SearchState } from './types';

const KEY = 'tem.booking.quote.v1';

export type QuoteSession = {
  quote: QuoteData;
  search: SearchState;
  details: Pick<DetailsState, 'pickupAddress' | 'dropoffAddress' | 'pickupPlace' | 'dropoffPlace' | 'flightNumber'>;
};

export function saveQuoteSession(data: QuoteSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode */
  }
}

export function loadQuoteSession(): QuoteSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuoteSession;
  } catch {
    return null;
  }
}

export function clearQuoteSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** Push `/book/vehicle?q=&s=` when the quote is signed. */
export function vehicleUrl(quote: QuoteData): string | null {
  if (!quote.quoteId || !quote.signature) return null;
  const q = new URLSearchParams({ q: quote.quoteId, s: quote.signature });
  return `/book/vehicle?${q}`;
}
