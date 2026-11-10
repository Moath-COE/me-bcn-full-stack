import { usedUp } from "./rules";
import type { Allowance } from "./schema";

export type UsedUpQuota = {
  kind: "used-up";
  minutesStudied: number;
  sessionsUsed: number;
  renewalDate: Date;
};

export function usedUpQuota(allowance: Allowance | null): UsedUpQuota | null {
  if (!allowance || !usedUp(allowance)) return null;
  return reachedAllowanceQuota(allowance);
}

export function reachedAllowanceQuota(allowance: Allowance): UsedUpQuota {
  return {
    kind: "used-up",
    minutesStudied: Math.ceil(allowance.usage.seconds / 60),
    sessionsUsed: allowance.usage.sessions,
    renewalDate: new Date(allowance.period.end),
  };
}
