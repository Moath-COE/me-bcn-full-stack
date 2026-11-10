import type { PlanView } from "./view";

/** The phrases that describe a plan's limits. */

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

export function minutesLabel(plan: PlanView): string {
  return plan.minutes === null ? "Unlimited minutes" : `${plan.minutes} ${plural(plan.minutes, "minute", "minutes")}`;
}

/** "≈ 4 hours of guided study", or `null` when the hours figure adds nothing. */
export function hoursLabel(plan: PlanView): string | null {
  return plan.hours === null ? null : `≈ ${plan.hours} ${plural(plan.hours, "hour", "hours")} of guided study`;
}

export function coursesLabel(plan: PlanView): string {
  if (plan.courses === null) return "All your courses";
  return plan.courses === 1 ? "One course" : `${plan.courses} courses`;
}

export function sessionsLabel(plan: PlanView): string {
  return plan.sessions === null
    ? "Unlimited sessions"
    : `Up to ${plan.sessions} ${plural(plan.sessions, "session", "sessions")}`;
}
