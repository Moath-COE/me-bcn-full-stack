export function cooldownSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}
