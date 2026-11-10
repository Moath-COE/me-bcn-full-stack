const periodMilliseconds = 30 * 24 * 60 * 60 * 1000;

// Before the anchor, return the first Period rather than a Period before the assignment.
export function currentPeriod(anchor: Date, now: Date): { start: Date; end: Date } {
  const elapsed = Math.max(0, now.getTime() - anchor.getTime());
  const start =
    anchor.getTime() + Math.floor(elapsed / periodMilliseconds) * periodMilliseconds;

  return { start: new Date(start), end: new Date(start + periodMilliseconds) };
}
