import {
  findListedPlans,
  insertDefaultPlanAssignment
} from "../repositories/plan.repository.js";

export async function assignFreePlan(userId: string, createdAt: Date): Promise<void> {
  await insertDefaultPlanAssignment(userId, createdAt);
}

export type ListedPlanDto = {
  id: string;
  name: { ar: string; en: string };
  priceHalalas: number;
  featured: boolean;
  badge: { ar: string; en: string } | null;
  // Same keys as `GET /me/allowance`; null means unlimited.
  limits: {
    sessions: number | null;
    seconds: number | null;
    enrollments: number | null;
    sessionSeconds: number | null;
    minStartSeconds: number | null;
  };
};

export async function listPlans(): Promise<ListedPlanDto[]> {
  const plans = await findListedPlans();

  return plans.map((row) => ({
    id: row.id,
    name: { ar: row.nameAr, en: row.nameEn },
    priceHalalas: row.priceHalalas,
    featured: row.featured,
    // The schema check guarantees both badge texts are set or both are null.
    badge:
      row.badgeAr !== null && row.badgeEn !== null
        ? { ar: row.badgeAr, en: row.badgeEn }
        : null,
    limits: {
      sessions: row.sessionsPerPeriod,
      seconds: row.secondsPerPeriod,
      enrollments: row.maxActiveEnrollments,
      sessionSeconds: row.maxSessionSeconds,
      minStartSeconds: row.minStartSeconds
    }
  }));
}
