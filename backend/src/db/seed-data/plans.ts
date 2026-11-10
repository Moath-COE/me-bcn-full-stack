import type { plan } from "../schema/plan-schema.js";

// The code is the Plans' source of truth (ADR 0007). Prices are for one Period, VAT (15%) included,
// in halalas. A null limit means unlimited.
export const freePlan = {
  id: "free",
  nameAr: "الباقة المجانية",
  nameEn: "Free plan",
  priceHalalas: 0,
  sessionsPerPeriod: 6,
  secondsPerPeriod: 3600,
  maxActiveEnrollments: 1,
  maxSessionSeconds: 1800,
  minStartSeconds: 180,
  sortOrder: 0,
  isListed: true,
  featured: false,
  badgeAr: null,
  badgeEn: null
} satisfies typeof plan.$inferInsert;

export const litePlan = {
  id: "lite",
  nameAr: "باقة لايت",
  nameEn: "Lite plan",
  priceHalalas: 9000,
  sessionsPerPeriod: 25,
  secondsPerPeriod: 15000,
  maxActiveEnrollments: null,
  maxSessionSeconds: 1800,
  minStartSeconds: 180,
  sortOrder: 1,
  isListed: true,
  featured: true,
  badgeAr: "الأنسب للبداية",
  badgeEn: "Best for getting started"
} satisfies typeof plan.$inferInsert;

export const proPlan = {
  id: "pro",
  nameAr: "باقة برو",
  nameEn: "Pro plan",
  priceHalalas: 14900,
  sessionsPerPeriod: 50,
  secondsPerPeriod: 30000,
  maxActiveEnrollments: null,
  maxSessionSeconds: 1800,
  minStartSeconds: 180,
  sortOrder: 2,
  isListed: true,
  featured: false,
  badgeAr: "الأنسب قبل الاختبارات",
  badgeEn: "Best before exams"
} satisfies typeof plan.$inferInsert;

export const planSeed = [freePlan, litePlan, proPlan];
