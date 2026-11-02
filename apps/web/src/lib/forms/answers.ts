import { addressAnswer, parsePlace } from '@tem/places';
import { formatLocal } from '../booking/time';
import { localToInstant } from '../booking/time';
import { t, type UiStringKey } from '../strings';
import type {
  ContactData,
  FormKey,
  TransferRequestData,
  VipSecurityData,
} from './schemas';

export type Answer = { key: string; label: string; value: string };

export type AnswersCtx = {
  zoneNames: Record<string, string>;
  classNames: Record<string, string>;
  topicLabels?: Record<string, string>;
  timeZone?: string;
};

function label(key: UiStringKey): string {
  return t(key);
}

function yesNo(v: boolean): string {
  return v ? 'Yes' : 'No';
}

function zoneLabel(code: string, other: string | undefined, names: Record<string, string>): string {
  if (code === 'other') return other?.trim() || 'Other';
  return names[code] ?? code;
}

function transferAnswers(data: TransferRequestData, ctx: AnswersCtx): Answer[] {
  const tz = ctx.timeZone ?? 'Europe/Athens';
  const instant = localToInstant(data.datetime, tz);
  const when = `${formatLocal(instant, tz)} (Athens)`;
  const out: Answer[] = [
    { key: 'name', label: label('form.name'), value: data.name },
    { key: 'email', label: label('form.email'), value: data.email },
    { key: 'phone', label: label('form.phone'), value: data.phone },
    {
      key: 'fromZone',
      label: label('form.fromZone'),
      value: zoneLabel(data.fromZone, data.fromOther, ctx.zoneNames),
    },
    {
      key: 'toZone',
      label: label('form.toZone'),
      value: zoneLabel(data.toZone, data.toOther, ctx.zoneNames),
    },
  ];
  if (data.pickupAddress) {
    let pick = null;
    try {
      pick = parsePlace((data as { pickupPlace?: unknown }).pickupPlace ?? null);
    } catch {
      pick = null;
    }
    out.push({
      key: 'pickupAddress',
      label: label('form.pickupAddress'),
      value: addressAnswer(data.pickupAddress, pick),
    });
  }
  if (data.dropoffAddress) {
    let drop = null;
    try {
      drop = parsePlace((data as { dropoffPlace?: unknown }).dropoffPlace ?? null);
    } catch {
      drop = null;
    }
    out.push({
      key: 'dropoffAddress',
      label: label('form.dropoffAddress'),
      value: addressAnswer(data.dropoffAddress, drop),
    });
  }
  out.push(
    { key: 'datetime', label: label('form.datetime'), value: when },
    { key: 'passengers', label: label('form.passengers'), value: String(data.passengers) },
    { key: 'luggage', label: label('form.luggage'), value: String(data.luggage) },
  );
  if (data.flight) {
    out.push({ key: 'flight', label: label('form.flight'), value: data.flight });
  }
  if (data.kind) {
    out.push({ key: 'kind', label: label('form.serviceType'), value: data.kind });
  }
  const classValue =
    data.vehicleClass === 'any'
      ? label('form.vehicleClass.any')
      : (ctx.classNames[data.vehicleClass] ?? data.vehicleClass);
  out.push({ key: 'vehicleClass', label: label('form.vehicleClass'), value: classValue });
  out.push({ key: 'vipSecurity', label: label('form.vipSecurity'), value: yesNo(Boolean(data.vipSecurity)) });
  out.push({ key: 'invoice', label: label('form.invoice'), value: yesNo(Boolean(data.invoice)) });
  if (data.invoice) {
    if (data.invoiceCompany) {
      out.push({ key: 'invoiceCompany', label: label('booking.invoice.company'), value: data.invoiceCompany });
    }
    if (data.invoiceVat) {
      out.push({ key: 'invoiceVat', label: label('booking.invoice.vat'), value: data.invoiceVat });
    }
    if (data.invoiceTaxOffice) {
      out.push({
        key: 'invoiceTaxOffice',
        label: label('booking.invoice.taxOffice'),
        value: data.invoiceTaxOffice,
      });
    }
    if (data.invoiceAddress) {
      out.push({
        key: 'invoiceAddress',
        label: label('booking.invoice.address'),
        value: data.invoiceAddress,
      });
    }
  }
  if (data.message) {
    out.push({ key: 'message', label: label('form.message'), value: data.message });
  }
  out.push({ key: 'consent', label: label('form.consent'), value: yesNo(true) });
  return out;
}

function vipAnswers(data: VipSecurityData, _ctx: AnswersCtx): Answer[] {
  const out: Answer[] = [
    { key: 'name', label: label('form.name'), value: data.name },
    { key: 'email', label: label('form.email'), value: data.email },
    { key: 'phone', label: label('form.phone'), value: data.phone },
    { key: 'serviceType', label: label('form.serviceType'), value: data.serviceType },
  ];
  if (data.date) out.push({ key: 'date', label: label('form.date'), value: data.date });
  if (data.place) out.push({ key: 'place', label: label('form.place'), value: data.place });
  if (data.people != null) out.push({ key: 'people', label: label('form.people'), value: String(data.people) });
  if (data.message) out.push({ key: 'message', label: label('form.message'), value: data.message });
  out.push({ key: 'consent', label: label('form.consent'), value: yesNo(true) });
  return out;
}

function contactAnswers(data: ContactData, ctx: AnswersCtx): Answer[] {
  const topicLabel = ctx.topicLabels?.[data.topic] ?? data.topic;
  const out: Answer[] = [
    { key: 'name', label: label('form.name'), value: data.name },
    { key: 'email', label: label('form.email'), value: data.email },
  ];
  if (data.phone) out.push({ key: 'phone', label: label('form.phone'), value: data.phone });
  out.push(
    { key: 'topic', label: label('form.topic'), value: topicLabel },
    { key: 'message', label: label('form.message'), value: data.message },
    { key: 'consent', label: label('form.consent'), value: yesNo(true) },
  );
  return out;
}

export function toAnswers(
  form: FormKey,
  data: TransferRequestData | VipSecurityData | ContactData,
  ctx: AnswersCtx,
): Answer[] {
  if (form === 'transfer-request') return transferAnswers(data as TransferRequestData, ctx);
  if (form === 'vip-security') return vipAnswers(data as VipSecurityData, ctx);
  return contactAnswers(data as ContactData, ctx);
}
