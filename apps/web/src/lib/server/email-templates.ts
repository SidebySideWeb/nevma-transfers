import { formatEuro, formatVatRate } from '../booking/pricing';
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
  /** Vehicle/hours + extras at final prices (for the price analysis). */
  lines?: ExtraLine[];
  totalCents: number;
  vatRateBp: number;
  vatCents: number;
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
  /** Set when the DB single-vehicle rule assigned the vehicle. */
  vehicleLabel?: string | null;
  vehicleAutoAssigned?: boolean;
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

function priceAnalysisLines(input: {
  lines?: ExtraLine[];
  className: string;
  extras: ExtraLine[];
  totalCents: number;
  vatRateBp: number;
  vatCents: number;
}): string {
  const items =
    input.lines && input.lines.length > 0
      ? input.lines
      : [{ label: input.className, cents: input.totalCents - input.extras.reduce((s, e) => s + e.cents, 0) }, ...input.extras];
  const rate = formatVatRate(input.vatRateBp);
  const net = input.totalCents - input.vatCents;
  return [
    t('email.confirmation.priceAnalysis'),
    ...items.map((l) => `${l.label}: ${formatEuro(l.cents)}`),
    `${t('email.confirmation.net')}: ${formatEuro(net)}`,
    `${t('email.confirmation.vat', { rate })}: ${formatEuro(input.vatCents)}`,
    `${t('email.confirmation.total')}: ${formatEuro(input.totalCents)}`,
  ].join('\n');
}

function priceAnalysisHtml(input: {
  lines?: ExtraLine[];
  className: string;
  extras: ExtraLine[];
  totalCents: number;
  vatRateBp: number;
  vatCents: number;
}): string {
  const items =
    input.lines && input.lines.length > 0
      ? input.lines
      : [{ label: input.className, cents: input.totalCents - input.extras.reduce((s, e) => s + e.cents, 0) }, ...input.extras];
  const rate = formatVatRate(input.vatRateBp);
  const net = input.totalCents - input.vatCents;
  const rows = [
    ...items.map(
      (l) =>
        `<tr><td style="padding:4px 0;color:${th.muted};">${escapeHtml(l.label)}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(formatEuro(l.cents))}</td></tr>`,
    ),
    `<tr><td style="padding:4px 0;color:${th.muted};">${escapeHtml(t('email.confirmation.net'))}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(formatEuro(net))}</td></tr>`,
    `<tr><td style="padding:4px 0;color:${th.muted};">${escapeHtml(t('email.confirmation.vat', { rate }))}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(formatEuro(input.vatCents))}</td></tr>`,
    `<tr><td style="padding:8px 0 4px;font-weight:600;">${escapeHtml(t('email.confirmation.total'))}</td><td style="padding:8px 0 4px;text-align:right;font-weight:600;">${escapeHtml(formatEuro(input.totalCents))}</td></tr>`,
  ].join('');
  return `<p style="margin:16px 0 8px;font-weight:600;">${escapeHtml(t('email.confirmation.priceAnalysis'))}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;">${rows}</table>`;
}

export function manageLinkEmail(input: {
  reference: string;
  manageUrl: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
}): EmailParts {
  const subject = t('email.manageLink.subject', { reference: input.reference });
  const body = t('email.manageLink.body', {
    reference: input.reference,
    manageUrl: input.manageUrl,
  });
  const text = [body, '', companyFooter(input)].join('\n');
  const htmlBody = `<p style="margin:0 0 12px;">${escapeHtml(body)}</p>
    <p style="margin:16px 0;"><a href="${escapeHtml(input.manageUrl)}" style="color:${th.accent};">Open your booking</a></p>`;
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

export function confirmationEmail(input: ConfirmationInput): EmailParts {
  const subject = t('email.confirmation.subject', { reference: input.reference });
  const body = t('email.confirmation.body', {
    reference: input.reference,
    pickupAt: `${input.pickupAtLocal} (Athens)`,
  });
  const cancel = t('email.confirmation.cancelLink', { cancelUrl: input.cancelUrl });
  const vip = input.vipSecurity ? t('email.confirmation.vip') : '';
  const invoiceNote = input.invoiceRequested ? 'Invoice requested.' : '';

  const analysis = priceAnalysisLines(input);
  const text = [
    body,
    '',
    tripLines(input),
    '',
    analysis,
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
    ${priceAnalysisHtml(input)}
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
  const autoVehicleLine =
    input.vehicleAutoAssigned && input.vehicleLabel
      ? `Vehicle: ${input.vehicleLabel} (automatic)`
      : '';
  const text = [
    subject,
    vipLine,
    tripLines(input),
    autoVehicleLine,
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
    ${
      autoVehicleLine
        ? `<p style="margin:0 0 8px;"><strong>Vehicle:</strong> ${escapeHtml(input.vehicleLabel!)} (automatic)</p>`
        : ''
    }
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

export type PaymentLinkInput = {
  reference: string;
  pickupAtLocal: string;
  holdEndsLocal: string;
  checkoutUrl: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export function paymentLinkEmail(input: PaymentLinkInput): EmailParts {
  const subject = t('email.paymentLink.subject', { reference: input.reference });
  const body = t('email.paymentLink.body', {
    reference: input.reference,
    pickupAt: `${input.pickupAtLocal} (Athens)`,
    holdEnds: input.holdEndsLocal,
  });
  const button = t('email.paymentLink.button');
  const text = [body, '', `${button}: ${input.checkoutUrl}`, '', companyFooter(input)].join('\n');
  const htmlBody = `
    <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
    <p style="margin:0;">
      <a href="${escapeHtml(input.checkoutUrl)}"
         style="display:inline-block;padding:12px 20px;background:${th.accent};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
        ${escapeHtml(button)}
      </a>
    </p>
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

export type DriverAssignmentInput = {
  kind: 'assigned' | 'changed' | 'removed';
  reference: string;
  pickupAtLocal: string;
  routeOrHours: string;
  pickupAddress: string;
  passengers: number;
  driverName: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export function driverAssignmentEmail(input: DriverAssignmentInput): EmailParts {
  const subjectKey =
    input.kind === 'assigned'
      ? 'email.driver.assigned.subject'
      : input.kind === 'changed'
        ? 'email.driver.changed.subject'
        : 'email.driver.removed.subject';
  const bodyKey =
    input.kind === 'assigned'
      ? 'email.driver.assigned.body'
      : input.kind === 'changed'
        ? 'email.driver.changed.body'
        : 'email.driver.removed.body';
  const subject = t(subjectKey, { reference: input.reference });
  const body = t(bodyKey, {
    reference: input.reference,
    pickupAt: `${input.pickupAtLocal} (Athens)`,
    routeOrHours: input.routeOrHours,
    pickupAddress: input.pickupAddress,
    passengers: input.passengers,
  });
  const text = [body, '', companyFooter(input)].join('\n');
  const htmlBody = `<p style="margin:0 0 16px;">${escapeHtml(body)}</p>`;
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

export type DriverInviteInput = {
  name: string;
  link: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export function driverInviteEmail(input: DriverInviteInput): EmailParts {
  const subject = t('email.driver.invite.subject');
  const body = t('email.driver.invite.body', { name: input.name, link: input.link });
  const text = [body, '', companyFooter(input)].join('\n');
  const htmlBody = `
    <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
    <p style="margin:0;">
      <a href="${escapeHtml(input.link)}"
         style="display:inline-block;padding:12px 20px;background:${th.accent};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
        Sign in
      </a>
    </p>
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

export type FormAnswerLine = { key: string; label: string; value: string };

export type FormOfficeInput = {
  formTitle: string;
  name: string;
  answers: FormAnswerLine[];
  studioUrl: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

export type FormConfirmInput = {
  formTitle: string;
  name: string;
  answers: FormAnswerLine[];
  companyName: string;
  companyPhone: string;
  companyEmail: string;
};

function answersText(answers: FormAnswerLine[]): string {
  return answers.map((a) => `${a.label}: ${a.value}`).join('\n');
}

function answersTable(answers: FormAnswerLine[]): string {
  const rows = answers
    .map(
      (a) =>
        `<tr>
          <td style="padding:6px 12px 6px 0;vertical-align:top;color:${th.muted};white-space:nowrap;">${escapeHtml(a.label)}</td>
          <td style="padding:6px 0;vertical-align:top;">${escapeHtml(a.value).replace(/\n/g, '<br>')}</td>
        </tr>`,
    )
    .join('');
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

export function formOffice(input: FormOfficeInput): EmailParts {
  const subject = t('email.form.office.subject', { form: input.formTitle, name: input.name });
  const text = [
    subject,
    '',
    answersText(input.answers),
    '',
    `Studio: ${input.studioUrl}`,
    '',
    companyFooter(input),
  ].join('\n');
  const htmlBody = `
    <p style="margin:0 0 16px;">${escapeHtml(subject)}</p>
    ${answersTable(input.answers)}
    <p style="margin:16px 0 0;">
      <a href="${escapeHtml(input.studioUrl)}" style="color:${th.accent};">Open in Studio</a>
    </p>
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

export function formConfirm(input: FormConfirmInput): EmailParts {
  const subject = t('email.form.confirm.subject');
  const body = t('email.form.confirm.body', { name: input.name });
  const text = [body, '', answersText(input.answers), '', companyFooter(input)].join('\n');
  const htmlBody = `
    <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
    ${answersTable(input.answers)}
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
