export type PriceLine = { label: string; cents: number };

/**
 * Display only (confirmed page, manage page): the design's paid box lists each item before VAT,
 * then "VAT 24%", then the total. The server stores final prices, so this takes the VAT share
 * out of each item at the booking's own rate. The last item absorbs rounding so that
 * items + VAT = total exactly (AC-37: 22000 at 24% is 17742 + 4258).
 */
export function linesBeforeVat(lines: PriceLine[], vatRateBp: number, vatCents: number, totalCents: number): PriceLine[] {
  const netTotal = totalCents - vatCents;
  let used = 0;
  return lines.map((line, i) => {
    const cents =
      i === lines.length - 1 ? netTotal - used : Math.round((line.cents * 10000) / (10000 + vatRateBp));
    used += cents;
    return { label: line.label, cents };
  });
}
