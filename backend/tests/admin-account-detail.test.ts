import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import {
  adminAuditLog,
  enrollment,
  plan,
  studySession,
  studySessionPresence
} from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import {
  resetAccounts,
  signedInStudent,
  signUp,
  signUpBody
} from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

const base = "/api/v1/admin/accounts";

// An Account to act on, without signing it in.
async function targetStudent() {
  const response = await signUp(signUpBody()).expect(200);

  return response.body.user.id as string;
}

async function auditEntries() {
  return db.select().from(adminAuditLog).orderBy(adminAuditLog.createdAt);
}

describe("Admin Account detail: access", () => {
  beforeEach(resetAccounts);

  const routes = [
    ["get", "/x/enrollments"],
    ["get", "/x/allowance"],
    ["get", "/x/sessions"],
    ["put", "/x/enrollments/becan-test"],
    ["delete", "/x/enrollments/becan-test"]
  ] as const;

  it.each(routes)("%s %s answers 401 without a session", async (method, path) => {
    const response = await request(app)
      [method](base + path)
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each(routes)("%s %s refuses a Student", async (method, path) => {
    const { cookie } = await signedInStudent();

    const response = await request(app)
      [method](base + path)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  it.each(routes)("%s %s refuses an Admin without two-factor", async (method, path) => {
    const { body, cookie } = await signedInStudent();
    await promoteToAdmin(body.email);

    const response = await request(app)
      [method](base + path)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it.each(routes)(
    "%s %s answers 404 ACCOUNT_NOT_FOUND for an unknown Account",
    async (method, path) => {
      const { cookie } = await adminWithTwoFactor();

      const response = await request(app)
        [method](base + path.replace("/x/", "/no-such-account/"))
        .set("Cookie", cookie)
        .expect(404);

      expect(response.body.error.code).toBe("ACCOUNT_NOT_FOUND");
    }
  );
});

describe("GET /admin/accounts/:accountId/enrollments", () => {
  beforeEach(resetAccounts);

  it("lists active and ended Enrollments, newest first", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-02-01T00:00:00.000Z");
    const [first, second] = await db
      .insert(enrollment)
      .values([
        {
          userId: accountId,
          courseId: "becan-test",
          enrolledAt: older,
          endedAt: new Date("2026-01-15T00:00:00.000Z"),
          endReason: "unenrolled"
        },
        { userId: accountId, courseId: "acct-101", enrolledAt: newer }
      ])
      .returning({ id: enrollment.id });

    const response = await request(app)
      .get(`${base}/${accountId}/enrollments`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual([
      {
        id: second!.id,
        course: {
          id: "acct-101",
          code: expect.any(String),
          name: { ar: expect.any(String), en: expect.any(String) }
        },
        enrolledAt: newer.toISOString(),
        endedAt: null,
        endReason: null
      },
      {
        id: first!.id,
        course: {
          id: "becan-test",
          code: expect.any(String),
          name: { ar: expect.any(String), en: expect.any(String) }
        },
        enrolledAt: older.toISOString(),
        endedAt: "2026-01-15T00:00:00.000Z",
        endReason: "unenrolled"
      }
    ]);
  });

  it("returns an empty list for an Account with none", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();

    const response = await request(app)
      .get(`${base}/${accountId}/enrollments`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body).toEqual([]);
  });
});

describe("GET /admin/accounts/:accountId/allowance", () => {
  beforeEach(resetAccounts);

  it("returns exactly what the Student sees on /me/allowance", async () => {
    const { cookie } = await adminWithTwoFactor();
    const student = await signedInStudent();
    const studentView = await student.agent.get("/api/v1/me/allowance").expect(200);
    const studentId = (await db.query.user.findFirst({
      columns: { id: true },
      where: { email: student.body.email }
    }))!.id;

    const response = await request(app)
      .get(`${base}/${studentId}/allowance`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body).toEqual(studentView.body);
    expect(response.body.unlimited).toBe(false);
    expect(response.body.plan.id).toBe("free");
  });

  it("includes unlimited: true for an Admin with two-factor", async () => {
    const { cookie, userId } = await adminWithTwoFactor();

    const response = await request(app)
      .get(`${base}/${userId}/allowance`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.unlimited).toBe(true);
  });

  it("counts held Enrollments in Usage, as the Student's read does", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);

    const response = await request(app)
      .get(`${base}/${accountId}/allowance`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.usage.enrollments).toBe(1);
  });
});

describe("GET /admin/accounts/:accountId/sessions", () => {
  beforeEach(resetAccounts);

  async function seedSessions(accountId: string) {
    const rows = await db
      .insert(studySession)
      .values([
        {
          userId: accountId,
          courseId: "becan-test",
          chapterNumber: 1,
          grantedSeconds: 1800,
          sessionLimit: "allowance",
          issuedAt: new Date("2026-03-01T10:00:00.000Z"),
          firstJoinedAt: new Date("2026-03-01T10:00:05.000Z"),
          endedAt: new Date("2026-03-01T10:10:05.000Z"),
          endReason: "no_leave_event"
        },
        {
          userId: accountId,
          courseId: "acct-101",
          chapterNumber: 2,
          grantedSeconds: 10800,
          sessionLimit: "session",
          issuedAt: new Date("2026-03-02T10:00:00.000Z"),
          kind: "admin"
        },
        {
          userId: accountId,
          courseId: "becan-test",
          chapterNumber: 1,
          grantedSeconds: 900,
          sessionLimit: "session",
          issuedAt: new Date()
        }
      ])
      .returning();

    // Sorted oldest to newest by issuedAt.
    const [ended, adminOne, held] = rows;
    await db.insert(studySessionPresence).values([
      {
        sessionId: ended!.id,
        joinedAt: new Date("2026-03-01T10:00:05.000Z"),
        leftAt: new Date("2026-03-01T10:01:05.000Z")
      },
      {
        sessionId: ended!.id,
        joinedAt: new Date("2026-03-01T10:05:00.000Z"),
        leftAt: new Date("2026-03-01T10:05:30.000Z")
      }
    ]);

    return { ended: ended!, adminOne: adminOne!, held: held! };
  }

  it("lists Sessions newest first with Course, kind, state and connected seconds", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const { ended, adminOne, held } = await seedSessions(accountId);

    const response = await request(app)
      .get(`${base}/${accountId}/sessions`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toMatchObject({ total: 3, limit: 25, offset: 0 });
    expect(response.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      held.id,
      adminOne.id,
      ended.id
    ]);

    const [heldDto, adminDto, endedDto] = response.body.sessions;
    expect(heldDto).toMatchObject({
      room: `ss_${held.id}`,
      kind: "student",
      state: "held",
      connectedSeconds: 0,
      firstJoinedAt: null,
      endedAt: null,
      endReason: null,
      grantedSeconds: 900,
      sessionLimit: "session"
    });
    expect(adminDto).toMatchObject({
      room: `ss_${adminOne.id}`,
      kind: "admin",
      state: "ended",
      chapterNumber: 2,
      grantedSeconds: 10800,
      course: { id: "acct-101", code: expect.any(String) }
    });
    expect(endedDto).toEqual({
      id: ended.id,
      room: `ss_${ended.id}`,
      course: {
        id: "becan-test",
        code: expect.any(String),
        name: { ar: expect.any(String), en: expect.any(String) }
      },
      chapterNumber: 1,
      kind: "student",
      grantedSeconds: 1800,
      sessionLimit: "allowance",
      issuedAt: "2026-03-01T10:00:00.000Z",
      firstJoinedAt: "2026-03-01T10:00:05.000Z",
      endedAt: "2026-03-01T10:10:05.000Z",
      endReason: "no_leave_event",
      // 60 s + 30 s across two intervals; the gap between them is free.
      connectedSeconds: 90,
      state: "ended"
    });
  });

  it("caps connectedSeconds at the grant, as Usage does", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const [row] = await db
      .insert(studySession)
      .values({
        userId: accountId,
        courseId: "becan-test",
        chapterNumber: 1,
        grantedSeconds: 60,
        sessionLimit: "session",
        issuedAt: new Date("2026-03-01T10:00:00.000Z"),
        firstJoinedAt: new Date("2026-03-01T10:00:00.000Z"),
        endedAt: new Date("2026-03-01T11:00:00.000Z"),
        endReason: "no_leave_event"
      })
      .returning();
    await db.insert(studySessionPresence).values({
      sessionId: row!.id,
      joinedAt: new Date("2026-03-01T10:00:00.000Z"),
      leftAt: new Date("2026-03-01T10:30:00.000Z")
    });

    const response = await request(app)
      .get(`${base}/${accountId}/sessions`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.sessions[0].connectedSeconds).toBe(60);
  });

  it("reports an open Session with a running interval as open", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const joined = new Date(Date.now() - 30_000);
    const [row] = await db
      .insert(studySession)
      .values({
        userId: accountId,
        courseId: "becan-test",
        chapterNumber: 1,
        grantedSeconds: 1800,
        sessionLimit: "allowance",
        issuedAt: new Date(Date.now() - 60_000),
        firstJoinedAt: joined
      })
      .returning();
    await db
      .insert(studySessionPresence)
      .values({ sessionId: row!.id, joinedAt: joined });

    const response = await request(app)
      .get(`${base}/${accountId}/sessions`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.sessions[0].state).toBe("open");
    expect(response.body.sessions[0].connectedSeconds).toBeGreaterThanOrEqual(30);
  });

  it("pages with limit and offset and reports the total", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const { ended, adminOne } = await seedSessions(accountId);

    const response = await request(app)
      .get(`${base}/${accountId}/sessions?limit=1&offset=1`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(response.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      adminOne.id
    ]);

    const last = await request(app)
      .get(`${base}/${accountId}/sessions?limit=2&offset=2`)
      .set("Cookie", cookie)
      .expect(200);
    expect(last.body.sessions.map((s: { id: string }) => s.id)).toEqual([ended.id]);
  });

  it("only lists the named Account's Sessions", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const otherId = await targetStudent();
    await seedSessions(otherId);

    const response = await request(app)
      .get(`${base}/${accountId}/sessions`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body).toMatchObject({ sessions: [], total: 0 });
  });

  it.each(["limit=0", "limit=101", "offset=-1", "limit=abc"])(
    "rejects ?%s with 400",
    async (query) => {
      const { cookie } = await adminWithTwoFactor();
      const accountId = await targetStudent();

      await request(app)
        .get(`${base}/${accountId}/sessions?${query}`)
        .set("Cookie", cookie)
        .expect(400);
    }
  );
});

describe("PUT /admin/accounts/:accountId/enrollments/:courseId", () => {
  beforeEach(resetAccounts);

  it("grants an Enrollment within the Plan limit and audits it in the same step", async () => {
    const { cookie, userId: actorId } = await adminWithTwoFactor();
    const accountId = await targetStudent();

    const response = await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);

    const [row] = await db.select().from(enrollment);
    expect(row).toMatchObject({
      userId: accountId,
      courseId: "becan-test",
      endedAt: null,
      endReason: null
    });
    expect(response.body).toEqual({
      id: row!.id,
      course: {
        id: "becan-test",
        code: expect.any(String),
        name: { ar: expect.any(String), en: expect.any(String) }
      },
      enrolledAt: row!.enrolledAt.toISOString(),
      endedAt: null,
      endReason: null
    });
    expect(await auditEntries()).toMatchObject([
      {
        actorId,
        action: "enrollment.grant",
        targetType: "account",
        targetId: accountId,
        before: null,
        after: { courseId: "becan-test", enrollmentId: row!.id }
      }
    ]);
  });

  it("answers 200 and writes no entry when the Course is already held", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    const first = await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);

    const again = await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(200);

    expect(again.body).toEqual(first.body);
    expect(await db.select().from(enrollment)).toHaveLength(1);
    expect(await auditEntries()).toHaveLength(1);
  });

  it("follows the Plan slot limit: 409 ENROLLMENT_LIMIT_REACHED, nothing written", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);

    const response = await request(app)
      .put(`${base}/${accountId}/enrollments/acct-101`)
      .set("Cookie", cookie)
      .expect(409);

    expect(response.body.error.code).toBe("ENROLLMENT_LIMIT_REACHED");
    expect(await db.select().from(enrollment)).toHaveLength(1);
    // Only the first grant is audited.
    expect(await auditEntries()).toHaveLength(1);
  });

  it("grants beyond a Free slot when the Plan allows more", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await db.update(plan).set({ maxActiveEnrollments: null }).where(eq(plan.id, "free"));

    try {
      await request(app)
        .put(`${base}/${accountId}/enrollments/becan-test`)
        .set("Cookie", cookie)
        .expect(201);
      await request(app)
        .put(`${base}/${accountId}/enrollments/acct-101`)
        .set("Cookie", cookie)
        .expect(201);
    } finally {
      await db.update(plan).set({ maxActiveEnrollments: 1 }).where(eq(plan.id, "free"));
    }

    expect(await db.select().from(enrollment)).toHaveLength(2);
  });

  it("answers 404 COURSE_NOT_FOUND for an unknown Course and writes no entry", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();

    const response = await request(app)
      .put(`${base}/${accountId}/enrollments/no-such-course`)
      .set("Cookie", cookie)
      .expect(404);

    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
    expect(await auditEntries()).toEqual([]);
  });

  it("writes no entry when the Admin gate refuses", async () => {
    const { cookie } = await signedInStudent();
    const accountId = await targetStudent();

    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(403);

    expect(await db.select().from(enrollment)).toEqual([]);
    expect(await auditEntries()).toEqual([]);
  });
});

describe("DELETE /admin/accounts/:accountId/enrollments/:courseId", () => {
  beforeEach(resetAccounts);

  it("ends the Enrollment, keeps the row with ended_by_admin, and audits it", async () => {
    const { cookie, userId: actorId } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);
    const [original] = await db.select().from(enrollment);

    await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(204);

    const rows = await db.select().from(enrollment);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: original!.id,
      endReason: "ended_by_admin",
      endedAt: expect.any(Date)
    });
    expect(await auditEntries()).toMatchObject([
      { action: "enrollment.grant" },
      {
        actorId,
        action: "enrollment.end",
        targetType: "account",
        targetId: accountId,
        before: { courseId: "becan-test", enrollmentId: original!.id },
        after: {
          courseId: "becan-test",
          enrollmentId: original!.id,
          endReason: "ended_by_admin"
        }
      }
    ]);
  });

  it("frees the slot at once and lists the ended Enrollment with its reason", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);
    await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(204);

    await request(app)
      .put(`${base}/${accountId}/enrollments/acct-101`)
      .set("Cookie", cookie)
      .expect(201);

    const list = await request(app)
      .get(`${base}/${accountId}/enrollments`)
      .set("Cookie", cookie)
      .expect(200);
    expect(
      list.body.map((e: { course: { id: string }; endReason: string | null }) => [
        e.course.id,
        e.endReason
      ])
    ).toEqual([
      ["acct-101", null],
      ["becan-test", "ended_by_admin"]
    ]);
  });

  it("answers 404 ENROLLMENT_NOT_FOUND on a second end, with no second entry", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(201);
    await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(204);

    const response = await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(404);

    expect(response.body.error.code).toBe("ENROLLMENT_NOT_FOUND");
    const ends = (await auditEntries()).filter((e) => e.action === "enrollment.end");
    expect(ends).toHaveLength(1);
  });

  it("answers 404 ENROLLMENT_NOT_FOUND when the Account never held the Course", async () => {
    const { cookie } = await adminWithTwoFactor();
    const accountId = await targetStudent();

    const response = await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(404);

    expect(response.body.error.code).toBe("ENROLLMENT_NOT_FOUND");
    expect(await auditEntries()).toEqual([]);
  });

  it("does not touch an Enrollment the Student ended themselves", async () => {
    const { cookie } = await adminWithTwoFactor();
    const student = await signedInStudent();
    await student.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    await student.agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const accountId = (await db.query.user.findFirst({
      columns: { id: true },
      where: { email: student.body.email }
    }))!.id;

    await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(404);

    const [row] = await db.select().from(enrollment);
    expect(row!.endReason).toBe("unenrolled");
    expect(await auditEntries()).toEqual([]);
  });

  it("writes no entry when the Admin gate refuses", async () => {
    const admin = await adminWithTwoFactor();
    const accountId = await targetStudent();
    await request(app)
      .put(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", admin.cookie)
      .expect(201);
    const { cookie } = await signedInStudent();

    await request(app)
      .delete(`${base}/${accountId}/enrollments/becan-test`)
      .set("Cookie", cookie)
      .expect(403);

    const [row] = await db.select().from(enrollment);
    expect(row!.endedAt).toBeNull();
    expect(await auditEntries()).toHaveLength(1);
  });
});
