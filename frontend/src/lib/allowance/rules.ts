import type { Enrollment } from "@/lib/courses/schema";
import type { Allowance } from "./schema";

export function minutesLeft({ limits, usage, unlimited }: Allowance): number | null {
  if (unlimited) return null;
  return limits.seconds === null ? null : Math.max(0, Math.floor(limits.seconds / 60) - Math.ceil(usage.seconds / 60));
}

export function usedUp({ limits, usage, unlimited }: Allowance): boolean {
  if (unlimited) return false;
  return (limits.sessions !== null && usage.sessions >= limits.sessions)
    || (limits.seconds !== null && limits.seconds - usage.seconds < (limits.minStartSeconds ?? 1));
}

export function nearlyOut(allowance: Allowance): boolean {
  const remaining = minutesLeft(allowance);
  return !usedUp(allowance) && remaining !== null && remaining > 0 && remaining < 15;
}

export function slotsFull(allowance: Allowance | null, enrollments: Enrollment[], courseId: string): boolean {
  if (!allowance || allowance.unlimited || enrollments.some((enrollment) => enrollment.course.id === courseId)) return false;
  const { limits, usage } = allowance;
  return limits.enrollments !== null && usage.enrollments >= limits.enrollments;
}

export type StartDecision =
  | { ok: true }
  | { ok: false; reason: "unpublished" | "not-enrolled" | "used-up" };

/* Can this account start a session on this chapter? This is the one place that refuses a start because
   of publication, enrollment or limits. An unlimited account (an admin) starts any chapter, published
   or not, without enrolling and without limits: that is how a chapter is tested before it is published.
   Every other account is refused an unpublished chapter. */
export function startDecision({ allowance, enrolled, published }: {
  allowance: Allowance | null;
  enrolled: boolean;
  published: boolean;
}): StartDecision {
  if (allowance?.unlimited) return { ok: true };
  if (!published) return { ok: false, reason: "unpublished" };
  if (!enrolled) return { ok: false, reason: "not-enrolled" };
  if (allowance && usedUp(allowance)) return { ok: false, reason: "used-up" };
  return { ok: true };
}
