import { describe, expect, it } from 'vitest';
import { placeLabel, transferRouteLabel } from './route-label';

describe('route-label', () => {
  it('prefers zone names over addresses', () => {
    expect(placeLabel('Airport', 'Long address, Greece')).toBe('Airport');
    expect(
      transferRouteLabel('Airport', 'Centre', 'A, Greece', 'B, Greece'),
    ).toBe('Airport → Centre');
  });

  it('falls back to the first address segment when zones are missing', () => {
    expect(placeLabel(null, 'Sounio Poseidon Villa, Androu, Greece')).toBe(
      'Sounio Poseidon Villa',
    );
    expect(placeLabel('', null)).toBe('—');
    expect(
      transferRouteLabel(
        null,
        null,
        'Sounio Poseidon Villa, Androu, Greece',
        'Athens International Airport "Eleftherios Venizelos" (ATH), Spata, Greece',
      ),
    ).toBe(
      'Sounio Poseidon Villa → Athens International Airport "Eleftherios Venizelos" (ATH)',
    );
  });
});
