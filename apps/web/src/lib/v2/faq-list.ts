/** First FAQ item is open; others closed. */
export function faqExpandedAt(index: number): boolean {
  return index === 0;
}

export function faqToggleSign(expanded: boolean): string {
  return expanded ? '−' : '+';
}

/** Toggle one item open; accordion closes siblings when opening. */
export function faqAfterToggle(
  openIndex: number | null,
  clicked: number,
): number | null {
  if (openIndex === clicked) return null;
  return clicked;
}
