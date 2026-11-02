import { afterEach, describe, expect, it, vi } from 'vitest';
import { bgImage } from './bg-image';

describe('bgImage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a CDN URL with width, auto format and q=70', () => {
    vi.stubEnv('SANITY_PROJECT_ID', 'project1');
    vi.stubEnv('SANITY_DATASET', 'production');
    const style = bgImage(
      {
        asset: {
          _ref: 'image-abc123def456-1600x1000-jpg',
        },
      },
      1200,
    );
    expect(style).toMatch(/^--bg-image:url\(/);
    expect(style).toContain('cdn.sanity.io');
    expect(style).toContain('w=1200');
    expect(style).toMatch(/q=70|quality=70|q%3D70/);
    expect(style).toMatch(/auto=format|auto%3Dformat/);
  });

  it('falls back to asset.url when builder is unavailable', () => {
    vi.stubEnv('SANITY_PROJECT_ID', '');
    vi.stubEnv('SANITY_DATASET', '');
    const style = bgImage({ asset: { url: 'https://cdn.example/pic.jpg' } }, 800);
    expect(style).toBe('--bg-image:url(https://cdn.example/pic.jpg)');
  });
});
