import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { plan } from "../src/db/schema/index.js";

describe("GET /api/v1/plans", () => {
  afterEach(async () => {
    await db.delete(plan).where(eq(plan.id, "plans-unlisted-test"));
  });

  it("lists the three seeded Plans in order with prices, badges and limits, signed out", async () => {
    const response = await request(app).get("/api/v1/plans").expect(200);

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.body).toEqual({
      plans: [
        {
          id: "free",
          name: { ar: "الباقة المجانية", en: "Free plan" },
          priceHalalas: 0,
          featured: false,
          badge: null,
          limits: {
            sessions: 6,
            seconds: 3600,
            enrollments: 1,
            sessionSeconds: 1800,
            minStartSeconds: 180
          }
        },
        {
          id: "lite",
          name: { ar: "باقة لايت", en: "Lite plan" },
          priceHalalas: 9000,
          featured: true,
          badge: { ar: "الأنسب للبداية", en: "Best for getting started" },
          limits: {
            sessions: 25,
            seconds: 15000,
            enrollments: null,
            sessionSeconds: 1800,
            minStartSeconds: 180
          }
        },
        {
          id: "pro",
          name: { ar: "باقة برو", en: "Pro plan" },
          priceHalalas: 14900,
          featured: false,
          badge: { ar: "الأنسب قبل الاختبارات", en: "Best before exams" },
          limits: {
            sessions: 50,
            seconds: 30000,
            enrollments: null,
            sessionSeconds: 1800,
            minStartSeconds: 180
          }
        }
      ]
    });
  });

  it("leaves out an unlisted Plan", async () => {
    await db.insert(plan).values({
      id: "plans-unlisted-test",
      nameAr: "خطة مخفية",
      nameEn: "Hidden plan",
      secondsPerPeriod: 600,
      sortOrder: -1,
      isListed: false
    });

    const response = await request(app).get("/api/v1/plans").expect(200);

    const ids = response.body.plans.map((entry: { id: string }) => entry.id);
    expect(ids).toEqual(["free", "lite", "pro"]);
  });

  it("orders by sort order, then id", async () => {
    await db.insert(plan).values({
      id: "plans-unlisted-test",
      nameAr: "خطة اختبار",
      nameEn: "Test plan",
      secondsPerPeriod: 600,
      sortOrder: 1
    });

    const response = await request(app).get("/api/v1/plans").expect(200);

    const ids = response.body.plans.map((entry: { id: string }) => entry.id);
    expect(ids).toEqual(["free", "lite", "plans-unlisted-test", "pro"]);
  });
});
