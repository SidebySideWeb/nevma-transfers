import { formatEuro } from '../booking/pricing';
import { t } from '../strings';

export function priceLabel(
  cents: number | null,
  opts: { show: boolean; perHour?: boolean },
): { text: string; isPrice: boolean } {
  if (!opts.show || cents == null) {
    return { text: t('site.noOnlinePrice'), isPrice: false };
  }
  const price = formatEuro(cents);
  if (opts.perHour) {
    return { text: t('site.perHour', { price }), isPrice: true };
  }
  return { text: t('site.fromPrice', { price }), isPrice: true };
}
