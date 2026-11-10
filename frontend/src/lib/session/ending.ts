import { reachedAllowanceQuota } from "@/lib/allowance/presentation";
import type { Allowance } from "@/lib/allowance/schema";
import type { SessionState } from "./session-reducer";

export function sessionEndingQuota(
  state: Pick<SessionState, "ending" | "allowanceReached">,
  allowance: Allowance | null,
) {
  /* The signal arrives before the budget runs out, so the usage read back from the backend
     may not show the limit as reached yet. */
  return state.ending && state.allowanceReached && allowance && !allowance.unlimited
    ? reachedAllowanceQuota(allowance)
    : null;
}
