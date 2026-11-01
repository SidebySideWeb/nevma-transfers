import { describe, expect, it } from 'vitest';
import { readinessBannerLine, readinessChecklist, readinessMissingLabels } from './readiness';

describe('readinessChecklist', () => {
  it('marks every item missing when facts are empty / offline', () => {
    const items = readinessChecklist({
      hasActiveVehicle: false,
      hasPriceOrRate: false,
      hasSanityPhotos: false,
      online: false,
    });
    expect(items.every((i) => !i.done)).toBe(true);
    expect(items.map((i) => i.id)).toEqual(['vehicle', 'price', 'sanity', 'online']);
  });

  it('shows only Sanity missing when vehicle, price and online are set', () => {
    const facts = {
      hasActiveVehicle: true,
      hasPriceOrRate: true,
      hasSanityPhotos: false,
      online: true,
    };
    const items = readinessChecklist(facts);
    expect(items.find((i) => i.id === 'sanity')?.done).toBe(false);
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(['vehicle', 'price', 'online']);
    expect(readinessMissingLabels(facts)).toEqual(['sanity page with photos']);
    expect(readinessBannerLine({ key: 'limo', ...facts })).toBe(
      'Class limo is online but not ready: sanity page with photos',
    );
  });

  it('returns null banner when offline or fully ready', () => {
    expect(
      readinessBannerLine({
        key: 'limo',
        hasActiveVehicle: false,
        hasPriceOrRate: false,
        hasSanityPhotos: false,
        online: false,
      }),
    ).toBeNull();
    expect(
      readinessBannerLine({
        key: 'sedan',
        hasActiveVehicle: true,
        hasPriceOrRate: true,
        hasSanityPhotos: true,
        online: true,
      }),
    ).toBeNull();
  });
});
