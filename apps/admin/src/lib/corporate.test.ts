import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { features } from '@tem/features';
import {
  corporateEnabled,
  corporateNotFound,
  parseCompanyTab,
  statementToCsv,
} from './corporate';

describe('features().corporate', () => {
  it('defaults to false and is true only for "true"', () => {
    expect(features({}).corporate).toBe(false);
    expect(features({ FEATURE_CORPORATE: 'false' }).corporate).toBe(false);
    expect(features({ FEATURE_CORPORATE: 'TRUE' }).corporate).toBe(false);
    expect(features({ FEATURE_CORPORATE: 'true' }).corporate).toBe(true);
  });
});

describe('B9 FEATURE_CORPORATE off', () => {
  const prev = process.env.FEATURE_CORPORATE;

  beforeEach(() => {
    process.env.FEATURE_CORPORATE = 'false';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_CORPORATE;
    else process.env.FEATURE_CORPORATE = prev;
  });

  it('corporateNotFound returns 404', () => {
    const r = corporateNotFound();
    expect(r).not.toBeNull();
    expect(r!.status).toBe(404);
  });

  it('corporateEnabled mirrors features().corporate', () => {
    expect(corporateEnabled()).toBe(false);
  });

  it('corporateNotFound returns null when on', () => {
    process.env.FEATURE_CORPORATE = 'true';
    expect(corporateNotFound()).toBeNull();
  });
});

describe('companies helpers', () => {
  it('parseCompanyTab falls back to details', () => {
    expect(parseCompanyTab('prices')).toBe('prices');
    expect(parseCompanyTab('nope')).toBe('details');
    expect(parseCompanyTab(null)).toBe('details');
  });

  it('statementToCsv writes euros, a total row and escapes formulas and quotes', () => {
    const csv = statementToCsv(
      [
        {
          reference: 'EP-1',
          pickup_at: '2026-11-01T10:00:00+02:00',
          guest_name: '=HYPERLINK("x")',
          cost_center: 'A,B',
          price_cents: 12050,
        },
      ],
      12050,
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Reference,Pickup date,Guest,Cost centre,Amount EUR');
    expect(lines[1]).toBe('EP-1,2026-11-01,"\'=HYPERLINK(""x"")","A,B",120.50');
    expect(lines[2]).toBe(',,,Total,120.50');
  });
});
