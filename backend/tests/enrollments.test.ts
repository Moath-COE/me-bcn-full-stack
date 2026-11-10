import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { enrollment, plan, planAssignment, user } from "../src/db/schema/index.js";
import type { EnrollmentDto } from "../src/services/enrollment.service.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";

describe("Enrollment", () => {
  beforeEach(resetAccounts);

  it.each(["get", "put", "delete"] as const)(
    "requires a Device session for %s",
    async (method) => {
      const path =
        method === "get" ? "/api/v1/me/enrollments" : "/api/v1/me/enrollments/becan-test";
      const response = await request(app)[method](path).expect(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    }
  );

  it("creates an Enrollment, returns the same active one on repeat, and lists its exact DTO", async () => {
    const { agent } = await signedInStudent();
    const first = await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const summary = await request(app).get("/api/v1/courses").expect(200);

    expect(first.body).toEqual({
      enrolledAt: expect.any(String),
      course: summary.body[0]
    });
    expect(new Date(first.body.enrolledAt).toISOString()).toBe(first.body.enrolledAt);
    expect(first.headers["cache-control"]).toBe("no-store");

    const second = await agent.put("/api/v1/me/enrollments/becan-test").expect(200);
    expect(second.body).toEqual(first.body);
    expect(second.headers["cache-control"]).toBe("no-store");

    const list = await agent.get("/api/v1/me/enrollments").expect(200);
    expect(list.body).toEqual([first.body]);
    expect(list.headers["cache-control"]).toBe("private, no-store");
  });

  it("ends an Enrollment without erasing it and re-enrolls with a new row", async () => {
    const { agent } = await signedInStudent();
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const [original] = await db.select().from(enrollment);

    await agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const list = await agent.get("/api/v1/me/enrollments").expect(200);
    expect(list.body).toEqual([]);
    expect(list.headers["cache-control"]).toBe("private, no-store");
    const [ended] = await db.select().from(enrollment);
    expect(ended).toMatchObject({
      id: original!.id,
      endReason: "unenrolled",
      endedAt: expect.any(Date)
    });

    await agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    expect(await db.select().from(enrollment)).toEqual([ended]);
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);

    const rows = await db.select().from(enrollment);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === original!.id)).toEqual(ended);
    const active = rows.filter((row) => row.endedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).not.toBe(original!.id);
    expect(active[0]!.endReason).toBeNull();
  });

  it("un-enrolls idempotently when no Enrollment exists, even for an unknown Course", async () => {
    const { agent } = await signedInStudent();
    await agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    await agent.delete("/api/v1/me/enrollments/unknown").expect(204);
    expect(await db.select().from(enrollment)).toEqual([]);
  });

  it("returns COURSE_NOT_FOUND for enrolling in an unknown Course", async () => {
    const { agent } = await signedInStudent();
    const response = await agent.put("/api/v1/me/enrollments/unknown").expect(404);
    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(await db.select().from(enrollment)).toEqual([]);
  });

  it("allows multiple unpublished Courses across Institutions with unlimited Enrollment slots, newest first", async () => {
    const { agent, body } = await signedInStudent({
      institutionId: "ksu",
      majorId: "ksu-cs"
    });
    const [student] = await db.select().from(user).where(eq(user.email, body.email));
    const testPlanId = "enrollment-unlimited-test";
    await db.insert(plan).values({
      id: testPlanId,
      nameAr: "باقة الاختبار",
      nameEn: "Unlimited enrollment test",
      sessionsPerPeriod: null,
      secondsPerPeriod: null,
      maxActiveEnrollments: null,
      maxSessionSeconds: 1800,
      minStartSeconds: null
    });

    try {
      await db
        .update(planAssignment)
        .set({ planId: testPlanId })
        .where(eq(planAssignment.userId, student!.id));

      const first = await agent.put("/api/v1/me/enrollments/acct-101").expect(201);
      const second = await agent.put("/api/v1/me/enrollments/phys-101").expect(201);
      const third = await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
      const response = await agent.get("/api/v1/me/enrollments").expect(200);
      const enrollments: EnrollmentDto[] = response.body;

      expect(enrollments).toEqual([third.body, second.body, first.body]);
      expect(second.body.course).toMatchObject({
        institution: { id: "kau" },
        publishedChapterCount: 0
      });
      const allowance = await agent.get("/api/v1/me/allowance").expect(200);
      expect(allowance.body.plan.id).toBe(testPlanId);
      expect(allowance.body.limits.enrollments).toBeNull();
      expect(allowance.body.usage.enrollments).toBe(3);
    } finally {
      await db
        .update(planAssignment)
        .set({ planId: "free" })
        .where(eq(planAssignment.userId, student!.id));
      await db.delete(plan).where(eq(plan.id, testPlanId));
    }
  });

  it("blocks another Course when slots are full without inserting, while a repeat PUT still succeeds", async () => {
    const { agent } = await signedInStudent();
    const first = await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const originalRows = await db.select().from(enrollment);

    const blocked = await agent.put("/api/v1/me/enrollments/acct-101").expect(409);
    expect(blocked.body.error.code).toBe("ENROLLMENT_LIMIT_REACHED");
    expect(await db.select().from(enrollment)).toEqual(originalRows);

    const repeat = await agent.put("/api/v1/me/enrollments/becan-test").expect(200);
    expect(repeat.body).toEqual(first.body);
    const unknown = await agent.put("/api/v1/me/enrollments/unknown").expect(404);
    expect(unknown.body.error.code).toBe("COURSE_NOT_FOUND");
    expect(await db.select().from(enrollment)).toEqual(originalRows);

    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.enrollments).toBe(1);
  });

  it("frees a slot on un-enrolling and counts a later re-enrollment again", async () => {
    const { agent } = await signedInStudent();
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    await agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const unused = await agent.get("/api/v1/me/allowance").expect(200);
    expect(unused.body.usage.enrollments).toBe(0);

    await agent.put("/api/v1/me/enrollments/acct-101").expect(201);
    const blocked = await agent.put("/api/v1/me/enrollments/becan-test").expect(409);
    expect(blocked.body.error.code).toBe("ENROLLMENT_LIMIT_REACHED");
    expect(await db.select().from(enrollment)).toHaveLength(2);

    await agent.delete("/api/v1/me/enrollments/acct-101").expect(204);
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const used = await agent.get("/api/v1/me/allowance").expect(200);
    expect(used.body.usage.enrollments).toBe(1);
    const blockedAgain = await agent.put("/api/v1/me/enrollments/acct-101").expect(409);
    expect(blockedAgain.body.error.code).toBe("ENROLLMENT_LIMIT_REACHED");

    const rows = await db.select().from(enrollment);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.endedAt === null)).toEqual([
      expect.objectContaining({ courseId: "becan-test" })
    ]);
  });

  it.each(["missing", "ended"])(
    "returns PLAN_ASSIGNMENT_MISSING for a %s current assignment, preserving unknown Course errors",
    async (state) => {
      const { agent, body } = await signedInStudent();
      const [student] = await db.select().from(user).where(eq(user.email, body.email));
      if (state === "missing") {
        await db.delete(planAssignment).where(eq(planAssignment.userId, student!.id));
      } else {
        await db
          .update(planAssignment)
          .set({ endsAt: new Date() })
          .where(eq(planAssignment.userId, student!.id));
      }

      const response = await agent.put("/api/v1/me/enrollments/becan-test").expect(500);
      expect(response.body).toEqual({
        error: { message: "Internal server error", code: "PLAN_ASSIGNMENT_MISSING" }
      });
      const unknown = await agent.put("/api/v1/me/enrollments/unknown").expect(404);
      expect(unknown.body.error.code).toBe("COURSE_NOT_FOUND");
      expect(await db.select().from(enrollment)).toEqual([]);
    }
  );

  it("keeps Enrollments scoped to the signed-in Account", async () => {
    const first = await signedInStudent();
    const second = await signedInStudent();
    await first.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    await second.agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const secondList = await second.agent.get("/api/v1/me/enrollments").expect(200);
    expect(secondList.body).toEqual([]);
    const firstList = await first.agent.get("/api/v1/me/enrollments").expect(200);
    expect(firstList.body).toHaveLength(1);

    await second.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    expect(
      await db.select().from(enrollment).where(isNull(enrollment.endedAt))
    ).toHaveLength(2);
  });

  it("leaves exactly one active Enrollment after two concurrent PUT requests", async () => {
    const { body, cookie } = await signedInStudent();
    const responses = await Promise.all([
      request(app).put("/api/v1/me/enrollments/becan-test").set("Cookie", cookie),
      request(app).put("/api/v1/me/enrollments/becan-test").set("Cookie", cookie)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    const student = await db.query.user.findFirst({ where: { email: body.email } });
    const rows = await db
      .select()
      .from(enrollment)
      .where(
        and(
          eq(enrollment.userId, student!.id),
          eq(enrollment.courseId, "becan-test"),
          isNull(enrollment.endedAt)
        )
      );
    expect(rows).toHaveLength(1);
    expect(await db.select().from(enrollment)).toHaveLength(1);
  });

  it("allows exactly one of two concurrent PUTs for different Courses when one slot is free", async () => {
    const { cookie } = await signedInStudent();
    const courseIds = ["becan-test", "acct-101"];
    const responses = await Promise.all(
      courseIds.map((courseId) =>
        request(app).put(`/api/v1/me/enrollments/${courseId}`).set("Cookie", cookie)
      )
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const created = responses.find((response) => response.status === 201)!;
    const blocked = responses.find((response) => response.status === 409)!;
    expect(blocked.body.error.code).toBe("ENROLLMENT_LIMIT_REACHED");
    const rows = await db.select().from(enrollment);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      courseId: created.body.course.id,
      endedAt: null
    });

    const allowance = await request(app)
      .get("/api/v1/me/allowance")
      .set("Cookie", cookie)
      .expect(200);
    expect(allowance.body.usage.enrollments).toBe(1);
  });

  it("erases Enrollments when their Account is deleted", async () => {
    const { agent, body } = await signedInStudent();
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    await db.delete(user).where(eq(user.email, body.email));
    expect(await db.select().from(enrollment)).toEqual([]);
    await request(app).get("/api/v1/courses/becan-test").expect(200);
  });
});
