import { useEffect, useId, useRef, useState } from 'react';

export interface GalleryImage {
  src: string;
  srcset?: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface GalleryProps {
  images: GalleryImage[];
  labelPrev: string;
  labelNext: string;
}

export function Gallery({ images, labelPrev, labelNext }: GalleryProps) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const id = useId();
  const n = images.length;
  const cur = images[i] ?? images[0];

  useEffect(() => {
    if (n < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + n) % n);
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);

  if (!cur) return null;

  return (
    <div className="v2-gallery">
      <div
        className="v2-gallery-main"
        role="img"
        aria-label={cur.alt}
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || n < 2) return;
          const d = end - start;
          if (Math.abs(d) < 40) return;
          setI((v) => (d > 0 ? (v - 1 + n) % n : (v + 1) % n));
        }}
      >
        <img
          src={cur.src}
          srcSet={cur.srcset}
          sizes="(min-width: 900px) 55vw, 100vw"
          width={cur.width ?? 1600}
          height={cur.height ?? 1000}
          alt=""
          decoding="async"
        />
        {n > 1 ? (
          <>
            <div className="v2-gallery-controls">
              <button type="button" className="v2-gallery-arrow" aria-label={labelPrev} onClick={() => setI((v) => (v - 1 + n) % n)}>
                ←
              </button>
              <button type="button" className="v2-gallery-arrow" aria-label={labelNext} onClick={() => setI((v) => (v + 1) % n)}>
                →
              </button>
            </div>
            <div className="v2-gallery-count" aria-live="polite">
              {i + 1} / {n}
            </div>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="v2-gallery-thumbs" role="tablist" aria-label="Photos">
          {images.map((img, idx) => (
            <button
              key={`${id}-${idx}`}
              type="button"
              role="tab"
              aria-selected={idx === i}
              className="v2-gallery-thumb"
              aria-label={`${idx + 1}`}
              onClick={() => setI(idx)}
            >
              <img src={img.src} alt="" width={120} height={80} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
