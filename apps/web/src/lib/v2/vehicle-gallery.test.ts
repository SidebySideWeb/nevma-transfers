import { describe, expect, it } from 'vitest';
import { formatPhotoCount, galleryStep, wrapGalleryIndex } from './vehicle-gallery';

describe('vehicle gallery index (V2-4)', () => {
  it('wraps at both ends', () => {
    expect(wrapGalleryIndex(-1, 10)).toBe(9);
    expect(wrapGalleryIndex(10, 10)).toBe(0);
    expect(wrapGalleryIndex(0, 10)).toBe(0);
    expect(wrapGalleryIndex(9, 10)).toBe(9);
  });

  it('keyboard and controls advance with wrap', () => {
    expect(galleryStep(0, 10, 'ArrowLeft')).toBe(9);
    expect(galleryStep(9, 10, 'ArrowRight')).toBe(0);
    expect(galleryStep(3, 10, 'prev')).toBe(2);
    expect(galleryStep(3, 10, 'next')).toBe(4);
    expect(galleryStep(0, 10, 'swipeRight')).toBe(9);
    expect(galleryStep(0, 10, 'swipeLeft')).toBe(1);
  });

  it('formats photoCount template', () => {
    expect(formatPhotoCount('{n} / {total}', 1, 10)).toBe('01 / 10');
    expect(formatPhotoCount('{n} of {total}', 2, 6)).toBe('2 of 6');
  });
});
