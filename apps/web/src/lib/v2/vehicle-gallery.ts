/** Wrap gallery index into `[0, length)`. */
export function wrapGalleryIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export type GalleryKey = 'ArrowLeft' | 'ArrowRight' | 'prev' | 'next' | 'swipeLeft' | 'swipeRight';

/** Next index after a gallery control / keyboard / swipe action. */
export function galleryStep(index: number, length: number, action: GalleryKey): number {
  if (action === 'ArrowLeft' || action === 'prev' || action === 'swipeRight') {
    return wrapGalleryIndex(index - 1, length);
  }
  return wrapGalleryIndex(index + 1, length);
}

export function formatPhotoCount(tpl: string, n: number, total: number): string {
  return tpl.replaceAll('{n}', String(n)).replaceAll('{total}', String(total));
}
