import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Design board → `/dev/v2/[state]` (sample data, frozen; fidelity only). */
export const V2_PREVIEW_STATES = {
  'book-1': { design: '08-book', page: '08-book' },
  'book-2': { design: '08-book-2', page: '08-book-2' },
  'book-3': { design: '08-book-3-options', page: '08-book-3-options' },
  'book-4': { design: '08-book-4', page: '08-book-4' },
  confirmed: { design: '09-thank-you', page: '09-thank-you' },
  'not-completed': { design: '10-payment-failed', page: '10-payment-failed' },
  'hold-expired': { design: '11-hold-expired', page: '11-hold-expired' },
  'request-received': { design: '13-request-received', page: '13-request-received' },
  'find-booking': { design: '14-find-my-booking', page: '14-find-my-booking' },
  manage: { design: '15-manage-booking', page: '15-manage-booking' },
  cancel: { design: '16-cancel-booking', page: '16-cancel-booking' },
} as const;

export type V2PreviewState = keyof typeof V2_PREVIEW_STATES;

export function v2PreviewEnabled(): boolean {
  // Vite inlines PUBLIC_* at build; also read process.env so the fidelity
  // webServer env (PUBLIC_V2_PREVIEW=1) turns the routes on during `astro build`.
  const env = import.meta.env as { DEV?: boolean; PUBLIC_V2_PREVIEW?: string } | undefined;
  return Boolean(
    env?.DEV || env?.PUBLIC_V2_PREVIEW === '1' || process.env.PUBLIC_V2_PREVIEW === '1',
  );
}

/**
 * Inner markup of a design/v2/build page (appHero + appBody + siteFooter),
 * with image paths rewritten for the site. Timers and sample copy stay frozen.
 */
export function designPreviewHtml(designFile: string): string {
  const path = resolve(process.cwd(), '../../design/v2/build', `${designFile}.html`);
  const html = readFileSync(path, 'utf8');
  const open = html.indexOf('<div class="sf2a7c">');
  if (open < 0) throw new Error(`design preview: no sf2a7c in ${designFile}`);
  const afterOpen = open + '<div class="sf2a7c">'.length;
  const closeRoot = html.lastIndexOf('</div>\n</div>\n</body>');
  const closeAlt = html.lastIndexOf('</div></div></body>');
  const end = closeRoot > afterOpen ? closeRoot : closeAlt > afterOpen ? closeAlt : -1;
  if (end < 0) throw new Error(`design preview: could not close sf2a7c in ${designFile}`);
  return html
    .slice(afterOpen, end)
    .replaceAll('../pages/images/', '/images/v2/')
    .replaceAll('href="01-home.html"', 'href="/"')
    .replaceAll('href="02-fleet.html"', 'href="/fleet"')
    .replaceAll('href="04-services.html"', 'href="/services"')
    .replaceAll('href="05-vip-security.html"', 'href="/vip-security"')
    .replaceAll('href="06-about.html"', 'href="/about"')
    .replaceAll('href="07-contact.html"', 'href="/contact"')
    .replaceAll('href="08-book.html"', 'href="/book"')
    .replaceAll('href="12-request-transfer.html"', 'href="/request-a-transfer"')
    .replaceAll('href="14-find-my-booking.html"', 'href="/booking/find"')
    .replaceAll('href="15-manage-booking.html"', 'href="/booking/find"')
    .replaceAll('href="16-cancel-booking.html"', 'href="/booking/find"')
    .replaceAll('href="17-legal.html"', 'href="/legal"');
}
