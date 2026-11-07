import { afterEach, describe, expect, it } from 'vitest';
import type { SiteSettings } from './sanity/content';
import { siteWhatsappChrome } from './whatsapp-site';

const settings: SiteSettings = {
  companyName: 'Elite Protection',
  phone: '+30 210 970 6967',
  email: 'info@eliteprotection.gr',
  bookingNotificationEmail: 'office@example.com',
  whatsapp: {
    enabled: true,
    label: 'WhatsApp',
    greeting: null,
    showFloatingButton: true,
  },
};

const prev = {
  FEATURE_WHATSAPP: process.env.FEATURE_WHATSAPP,
  WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER,
};

afterEach(() => {
  if (prev.FEATURE_WHATSAPP === undefined) delete process.env.FEATURE_WHATSAPP;
  else process.env.FEATURE_WHATSAPP = prev.FEATURE_WHATSAPP;
  if (prev.WHATSAPP_NUMBER === undefined) delete process.env.WHATSAPP_NUMBER;
  else process.env.WHATSAPP_NUMBER = prev.WHATSAPP_NUMBER;
});

describe('siteWhatsappChrome', () => {
  it('returns null when FEATURE_WHATSAPP is off (switch-off: no wa.me)', () => {
    process.env.FEATURE_WHATSAPP = 'false';
    process.env.WHATSAPP_NUMBER = '306900000000';
    expect(siteWhatsappChrome(settings)).toBeNull();
  });

  it('builds a wa.me href when the switch is on', () => {
    process.env.FEATURE_WHATSAPP = 'true';
    process.env.WHATSAPP_NUMBER = '306900000000';
    const chrome = siteWhatsappChrome(settings, {
      ref: 'EP-7K3QX',
      pickupAt: '2026-11-23T16:34:00.000Z',
    });
    expect(chrome).not.toBeNull();
    expect(chrome!.href).toContain('https://wa.me/306900000000?text=');
    expect(decodeURIComponent(chrome!.href)).toContain('EP-7K3QX');
    expect(chrome!.label).toBe('WhatsApp');
    expect(chrome!.showFloatingButton).toBe(true);
  });

  it('returns null when Sanity disabled WhatsApp', () => {
    process.env.FEATURE_WHATSAPP = 'true';
    process.env.WHATSAPP_NUMBER = '306900000000';
    expect(
      siteWhatsappChrome({
        ...settings,
        whatsapp: { ...settings.whatsapp!, enabled: false },
      }),
    ).toBeNull();
  });
});
