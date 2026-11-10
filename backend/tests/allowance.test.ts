import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { enrollment, plan, planAssignment, user } from "../src/db/schema/index.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";

describe("GET /api/v1/me/allowance", () => {
  beforeEach(resetAccounts);
  afterEach(() => vi.useRealTimers());

  it("rejects a Plan with no bound on Session time", async () => {
    const id = "unbounded-session-test";
    try {
      await expect(
        db.insert(plan).values({
          id,
          nameAr: "باقة الاختبار",
          nameEn: "Unbounded test",
          secondsPerPeriod: null,
          maxSessionSeconds: null
        })
      ).rejects.toMatchObject({
        cause: { constraint: "plan_session_budget_bounded_check" }
      });
    } finally {
      await db.delete(plan).where(eq(plan.id, id));
    }
  });

  it("requires a Device session", async () => {
    const response = await request(app).get("/api/v1/me/allowance").expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the Free Plan, the current Period, its limits and unused Allowance", async () => {
    const { agent, body } = await signedInStudent();
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    const response = await agent.get("/api/v1/me/allowance").expect(200);

    expect(response.body).toEqual({
      unlimited: false,
      plan: { id: "free", name: { ar: "الباقة المجانية", en: "Free plan" } },
      period: {
        start: student!.createdAt.toISOString(),
        end: new Date(
          student!.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000
        ).toISOString()
      },
      limits: {
        sessions: 6,
        seconds: 3600,
        enrollments: 1,
        sessionSeconds: 1800,
        minStartSeconds: 180
      },
      usage: { sessions: 0, seconds: 0, enrollments: 0 }
    });
  });

  it("counts only the Student's active Enrollments", async () => {
    const { agent, body } = await signedInStudent();
    const otherStudent = await signedInStudent();
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    await db.insert(enrollment).values({ userId: student!.id, courseId: "acct-101" });
    await otherStudent.agent.put("/api/v1/me/enrollments/becan-test").expect(201);

    const two = await agent.get("/api/v1/me/allowance").expect(200);
    expect(two.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 2 });

    await agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const one = await agent.get("/api/v1/me/allowance").expect(200);
    expect(one.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 1 });
  });

  it("recomputes the Period from the assignment's anchor across multiple windows", async () => {
    const { agent, body } = await signedInStudent();
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));

    await db
      .update(planAssignment)
      .set({ startsAt: new Date("2026-10-01T12:00:00.000Z") })
      .where(eq(planAssignment.userId, student!.id));
    const first = await agent.get("/api/v1/me/allowance").expect(200);
    expect(first.body.period).toEqual({
      start: "2026-10-01T12:00:00.000Z",
      end: "2026-10-31T12:00:00.000Z"
    });

    await db
      .update(planAssignment)
      .set({ startsAt: new Date("2026-08-01T12:00:00.000Z") })
      .where(eq(planAssignment.userId, student!.id));
    const shifted = await agent.get("/api/v1/me/allowance").expect(200);
    expect(shifted.body.period).toEqual({
      start: "2026-09-30T12:00:00.000Z",
      end: "2026-10-30T12:00:00.000Z"
    });
  });

  it("returns a server error when the current assignment is missing", async () => {
    const { agent, body } = await signedInStudent();
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    await db.delete(planAssignment).where(eq(planAssignment.userId, student!.id));

    const response = await agent.get("/api/v1/me/allowance").expect(500);
    expect(response.body).toEqual({
      error: { message: "Internal server error", code: "PLAN_ASSIGNMENT_MISSING" }
    });
  });

  it("does not use an ended assignment as the current Plan", async () => {
    const { agent, body } = await signedInStudent();
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    await db
      .update(planAssignment)
      .set({ endsAt: new Date() })
      .where(eq(planAssignment.userId, student!.id));

    const response = await agent.get("/api/v1/me/allowance").expect(500);
    expect(response.body.error.code).toBe("PLAN_ASSIGNMENT_MISSING");
  });

  it("reads the current Plan and serializes unlimited limits as null", async () => {
    const { agent, body } = await signedInStudent();
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    const testPlan = {
      id: "unlimited-test",
      nameAr: "باقة الاختبار",
      nameEn: "Unlimited test",
      sessionsPerPeriod: null,
      secondsPerPeriod: null,
      maxActiveEnrollments: null,
      maxSessionSeconds: 1800,
      minStartSeconds: null
    };
    await db.insert(plan).values(testPlan);

    try {
      const startsAt = new Date();
      await db
        .update(planAssignment)
        .set({ endsAt: startsAt })
        .where(eq(planAssignment.userId, student!.id));
      await db.insert(planAssignment).values({
        userId: student!.id,
        planId: testPlan.id,
        startsAt,
        source: "payment"
      });

      const response = await agent.get("/api/v1/me/allowance").expect(200);
      expect(response.body.plan).toEqual({
        id: testPlan.id,
        name: { ar: testPlan.nameAr, en: testPlan.nameEn }
      });
      expect(response.body.limits).toEqual({
        sessions: null,
        seconds: null,
        enrollments: null,
        sessionSeconds: 1800,
        minStartSeconds: null
      });
      expect(response.body.period.start).toBe(startsAt.toISOString());
    } finally {
      await db.delete(planAssignment).where(eq(planAssignment.planId, testPlan.id));
      await db.delete(plan).where(eq(plan.id, testPlan.id));
    }
  });
});
