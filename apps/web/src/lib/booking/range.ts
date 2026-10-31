/** Real elapsed minutes — same formula as SQL `blocked_range_for`. */
export function blockedRange(
  pickup: Date,
  durationMinutes: number,
  bufferMinutes: number,
): { start: Date; end: Date } {
  const start = new Date(pickup.getTime() - bufferMinutes * 60_000);
  const end = new Date(pickup.getTime() + (durationMinutes + bufferMinutes) * 60_000);
  return { start, end };
}
