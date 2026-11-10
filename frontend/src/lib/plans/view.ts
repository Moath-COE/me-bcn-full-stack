import type { ApiPlan } from "./schema";

/** A plan as the pages show it, derived from the API response. */
export type PlanView = {
  id: string;
  name: string;
  /** Price of one period in SAR, VAT included; 0 for the free plan. */
  price: number;
  /** Study minutes per period; `null` is unlimited. */
  minutes: number | null;
  /** The minutes as rounded hours; `null` when unlimited or under half an hour. */
  hours: number | null;
  /** Courses a student can be enrolled in at once; `null` is unlimited. */
  courses: number | null;
  /** Sessions per period; `null` is unlimited. */
  sessions: number | null;
  badge: string | null;
  featured: boolean;
};

export function toPlanView(plan: ApiPlan): PlanView {
  const minutes = plan.limits.seconds === null ? null : plan.limits.seconds / 60;
  const hours = minutes === null ? null : Math.round(minutes / 60);
  return {
    id: plan.id,
    name: plan.name,
    price: plan.priceHalalas / 100,
    minutes,
    hours: hours === null || hours < 1 ? null : hours,
    courses: plan.limits.enrollments,
    sessions: plan.limits.sessions,
    badge: plan.badge,
    featured: plan.featured,
  };
}

/** 149 or 99.90. */
export const formatPrice = (price: number) => (Number.isInteger(price) ? String(price) : price.toFixed(2));
