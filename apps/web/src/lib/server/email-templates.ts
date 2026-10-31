import { formatEuro } from '../booking/pricing';
import { t } from '../strings';
import { emailTheme as th } from './email-theme';

export type EmailParts = { subject: string; html: string; text: string };

export type ExtraLine = { label: string; cents: number };

export type ConfirmationInput = {
  reference: string;
  bookingType: 'transfer' | 'hourly';
  pickupAtLocal: string;
  routeOrHours: string;
  className: string;
  passengers: number;
  extras: ExtraLine[];
  totalCents: number;
  vipSecurity: boolean;
  invoiceRequested: boolean;
  cancelUrl: string;
  cancelWindowHours: number;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export type OfficeNewInput = ConfirmationInput & {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string | null;
  flightNumber?: string | null;
  invoiceCompany?: string | null;
  invoiceVat?: string | null;
  invoiceTaxOffice?: string | null;
  invoiceAddress?: string | null;
  adminUrl: string;
};

export type ReminderInput = {
  reference: string;
  pickupAtLocal: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export type CancelledInput = {
  reference: string;
  refundCents?: number;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export type LateRefundInput = {
  reference: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

function wrapHtml(title: string, bodyHtml: string, company: { name: string; phone: string; email: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${th.bg};color:${th.text};font-family:${th.font};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${th.bg};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${th.maxWidth};background:${th.surface};border:1px solid ${th.border};border-radius:10px;">
        <tr><td style="padding:24px;font-size:16px;line-height:1.55;color:${th.text};">
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${th.accent};">${escapeHtml(company.name)}</p>
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:14px;color:${th.muted};">
            ${escapeHtml(company.name)} · ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function companyFooter(c: { companyName: string; companyPhone: string; companyEmail: string }): string {
  return `${c.companyName} · ${c.companyPhone} · ${c.companyEmail}`;
}

function extrasText(extras: ExtraLine[]): string {
  if (!extras.length) return 'None';
  return extras.map((e) => `${e.label}: ${formatEuro(e.cents)}`).join('\n');
}

function tripLines(input: {
  bookingType: 'transfer' | 'hourly';
  pickupAtLocal: string;
  routeOrHours: string;
  className: string;
  passengers: number;
  extras: ExtraLine[];
  totalCents: number;
}): string {
  const typeLabel = input.bookingType === 'transfer' ? 'Transfer' : 'Hourly hire';
  return [
    `Type: ${typeLabel}`,
    `Pick-up: ${input.pickupAtLocal} (Athens)`,
    input.bookingType === 'transfer' ? `Route: ${input.routeOrHours}` : `Hours: ${input.routeOrHours}`,
    `Vehicle: ${input.className}`,
    `Passengers: ${input.passengers}`,
    `Extras:\n${extrasText(input.extras)}`,
    `Total: ${formatEuro(input.totalCents)}`,
  ].join('\n');
}

export function confirmationEmail(input: ConfirmationInput): EmailParts {
  const subject = t('email.confirmation.subject', { reference: input.reference });
  const body = t('email.confirmation.body', {
    reference: input.reference,
    pickupAt: `${input.pickupAtLocal} (Athens)`,
  });
  const cancel = t('email.confirmation.cancelLink', { cancelUrl: input.cancelUrl });
  const vip = input.vipSecurity ? t('email.confirmation.vip') : '';
  const invoiceNote = input.invoiceRequested ? 'Invoice requested.' : '';

  const text = [
    body,
    '',
    tripLines(input),
    vip ? `\n${vip}` : '',
    invoiceNote ? `\n${invoiceNote}` : '',
    '',
    cancel,
    `You can cancel online until ${input.cancelWindowHours} hours before pick-up.`,
    '',
    companyFooter(input),
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const htmlBody = `
    <p style="margin:0 0 12px;">${escapeHtml(body)}</p>
    <p style="margin:0 0 8px;white-space:pre-line;">${escapeHtml(tripLines(input))}</p>
    ${vip ? `<p style="margin:12px 0;font-weight:600;color:${th.accent};">${escapeHtml(vip)}</p>` : ''}
    ${invoiceNote ? `<p style="margin:8px 0;">${escapeHtml(invoiceNote)}</p>` : ''}
    <p style="margin:16px 0 8px;">${escapeHtml(cancel)}</p>
    <p style="margin:0 0 8px;font-size:14px;color:${th.muted};">You can cancel online until ${input.cancelWindowHours} hours before pick-up.</p>
  `;

  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}

export function officeNewEmail(input: OfficeNewInput): EmailParts {
  const subject = t('email.office.new.subject', { reference: input.reference });
  const vipLine = input.vipSecurity ? 'VIP SECURITY' : '';
  const text = [
    subject,
    vipLine,
    tripLines(input),
    '',
    `Customer: ${input.customerName}`,
    `Email: ${input.customerEmail}`,
    `Phone: ${input.customerPhone}`,
    input.flightNumber ? `Flight: ${input.flightNumber}` : '',
    input.notes ? `Notes: ${input.notes}` : '',
    input.invoiceCompany
      ? `Invoice: ${input.invoiceCompany}, VAT ${input.invoiceVat}, ${input.invoiceTaxOffice}, ${input.invoiceAddress}`
      : '',
    '',
    `Admin: ${input.adminUrl}`,
    '',
    companyFooter(input),
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
    ${vipLine ? `<p style="margin:0 0 12px;font-weight:700;color:${th.accent};letter-spacing:0.06em;">${vipLine}</p>` : ''}
    <p style="margin:0 0 8px;white-space:pre-line;">${escapeHtml(tripLines(input))}</p>
    <p style="margin:12px 0 4px;"><strong>Customer:</strong> ${escapeHtml(input.customerName)}</p>
    <p style="margin:0 0 4px;"><strong>Email:</strong> ${escapeHtml(input.customerEmail)}</p>
    <p style="margin:0 0 4px;"><strong>Phone:</strong> ${escapeHtml(input.customerPhone)}</p>
    ${input.flightNumber ? `<p style="margin:0 0 4px;"><strong>Flight:</strong> ${escapeHtml(input.flightNumber)}</p>` : ''}
    ${input.notes ? `<p style="margin:0 0 4px;"><strong>Notes:</strong> ${escapeHtml(input.notes)}</p>` : ''}
    ${
      input.invoiceCompany
        ? `<p style="margin:8px 0;"><strong>Invoice:</strong> ${escapeHtml(
            `${input.invoiceCompany}, VAT ${input.invoiceVat}, ${input.invoiceTaxOffice}, ${input.invoiceAddress}`,
          )}</p>`
        : ''
    }
    <p style="margin:16px 0 0;"><a href="${escapeHtml(input.adminUrl)}" style="color:${th.accent};">Open in admin</a></p>
  `;

  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}

export function reminderEmail(input: ReminderInput): EmailParts {
  const subject = t('email.reminder.subject', { reference: input.reference });
  const body = t('email.reminder.body', {
    reference: input.reference,
    pickupAt: `${input.pickupAtLocal} (Athens)`,
  });
  const text = [body, '', companyFooter(input)].join('\n');
  const htmlBody = `<p style="margin:0;">${escapeHtml(body)}</p>`;
  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}

export function cancelledCustomerEmail(input: CancelledInput): EmailParts {
  const subject = t('email.cancelled.subject', { reference: input.reference });
  const body = t('email.cancelled.body', { reference: input.reference });
  const refund =
    input.refundCents && input.refundCents > 0
      ? t('email.refunded.body', { amount: formatEuro(input.refundCents) })
      : '';
  const text = [body, refund, '', companyFooter(input)].filter(Boolean).join('\n');
  const htmlBody = `
    <p style="margin:0 0 8px;">${escapeHtml(body)}</p>
    ${refund ? `<p style="margin:0;">${escapeHtml(refund)}</p>` : ''}
  `;
  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}

export function cancelledOfficeEmail(input: CancelledInput): EmailParts {
  const subject = t('email.office.cancelled.subject', { reference: input.reference });
  const body = t('email.cancelled.body', { reference: input.reference });
  const refund =
    input.refundCents && input.refundCents > 0
      ? t('email.refunded.body', { amount: formatEuro(input.refundCents) })
      : '';
  const text = [subject, body, refund, '', companyFooter(input)].filter(Boolean).join('\n');
  const htmlBody = `
    <p style="margin:0 0 8px;">${escapeHtml(body)}</p>
    ${refund ? `<p style="margin:0;">${escapeHtml(refund)}</p>` : ''}
  `;
  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}

export function lateRefundEmail(input: LateRefundInput): EmailParts {
  const subject = t('email.lateRefund.subject', { reference: input.reference });
  const body = t('email.lateRefund.body');
  const text = [body, `Reference: ${input.reference}`, '', companyFooter(input)].join('\n');
  const htmlBody = `
    <p style="margin:0 0 8px;">${escapeHtml(body)}</p>
    <p style="margin:0;">Reference: ${escapeHtml(input.reference)}</p>
  `;
  return {
    subject,
    text,
    html: wrapHtml(subject, htmlBody, {
      name: input.companyName,
      phone: input.companyPhone,
      email: input.companyEmail,
    }),
  };
}
