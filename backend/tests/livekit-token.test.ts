import { and, eq } from "drizzle-orm";
import { TokenVerifier } from "livekit-server-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import {
  chapter,
  plan,
  planAssignment,
  studySession,
  user
} from "../src/db/schema/index.js";
import { deleteLivekitRoom } from "../src/lib/livekit.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import { signedWebhook, webhookEvent } from "./support/livekit-webhook.js";

vi.mock("../src/lib/livekit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/livekit.js")>()),
  deleteLivekitRoom: vi.fn().mockResolvedValue(undefined)
}));

const endpoint = "/api/v1/livekit/token";
const tokenBody = {
  courseId: "becan-test",
  chapterNumber: 1,
  language: "Arabic",
  experience: "quick"
};

const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

async function enrolledStudent() {
  const student = await signedInStudent();
  const [account] = await db
    .select()
    .from(user)
    .where(eq(user.email, student.body.email));
  await student.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
  return { ...student, userId: account!.id };
}

async function publishSecondChapter() {
  await db.insert(chapter).values({
    courseId: "becan-test",
    number: 2,
    titleAr: "الفصل الثاني",
    titleEn: "Second Chapter",
    minutes: 10,
    lessonCount: 1,
    published: true
  });
}

async function assignTestPlan(userId: string, limits: Partial<typeof plan.$inferInsert>) {
  await db.insert(plan).values({
    id: "session-test",
    nameAr: "باقة الاختبار",
    nameEn: "Session test",
    sessionsPerPeriod: 6,
    secondsPerPeriod: 3600,
    maxSessionSeconds: 1800,
    minStartSeconds: 180,
    ...limits
  });
  await db
    .update(planAssignment)
    .set({ planId: "session-test" })
    .where(eq(planAssignment.userId, userId));
}

async function insertJoinedSessions(userId: string, count: number) {
  const [assignment] = await db
    .select()
    .from(planAssignment)
    .where(eq(planAssignment.userId, userId));
  // Fixture Sessions must belong to the assignment's first Period, as issuance enforces.
  const issuedAt = new Date(Math.max(Date.now(), assignment!.startsAt.getTime()));
  await db.insert(studySession).values(
    Array.from({ length: count }, () => ({
      userId,
      courseId: "becan-test",
      chapterNumber: 1,
      grantedSeconds: 1800,
      sessionLimit: "session" as const,
      issuedAt,
      firstJoinedAt: issuedAt,
      endedAt: issuedAt,
      endReason: "superseded" as const
    }))
  );
}

describe("LiveKit token", () => {
  beforeEach(async () => {
    await resetAccounts();
    vi.mocked(deleteLivekitRoom).mockClear();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await db
      .delete(chapter)
      .where(and(eq(chapter.courseId, "becan-test"), eq(chapter.number, 2)));
    await db.delete(planAssignment).where(eq(planAssignment.planId, "session-test"));
    await db.delete(plan).where(eq(plan.id, "session-test"));
  });

  it("counts and continues the replacement Session when the clock moves behind the Plan anchor", async () => {
    await publishSecondChapter();
    const { agent, userId } = await enrolledStudent();
    const [assignment] = await db
      .select()
      .from(planAssignment)
      .where(eq(planAssignment.userId, userId));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(assignment!.startsAt.getTime() - 500);

    await agent.post(endpoint).send(tokenBody).expect(200);
    const secondBody = { ...tokenBody, chapterNumber: 2 };
    const replacement = await agent.post(endpoint).send(secondBody).expect(200);
    const room = (await verifier.verify(replacement.body.token)).video!.room;
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(1);

    const continued = await agent.post(endpoint).send(secondBody).expect(200);
    expect((await verifier.verify(continued.body.token)).video!.room).toBe(room);
    vi.setSystemTime(assignment!.startsAt.getTime() + 1);
    const recovered = await agent.get("/api/v1/me/allowance").expect(200);
    expect(recovered.body.usage.sessions).toBe(1);
  });

  it("keeps a held Session counted and in its room when the reading clock moves backwards", async () => {
    const { agent, userId } = await enrolledStudent();
    const [assignment] = await db
      .select()
      .from(planAssignment)
      .where(eq(planAssignment.userId, userId));
    const issuedAt = assignment!.startsAt.getTime() + 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(issuedAt);
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    vi.setSystemTime(issuedAt - 1);

    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(1);
    const continued = await agent.post(endpoint).send(tokenBody).expect(200);
    expect((await verifier.verify(continued.body.token)).video!.room).toBe(
      (await verifier.verify(first.body.token)).video!.room
    );
  });

  it("refuses a new Session after six joined Sessions in the current Period", async () => {
    const { agent, userId } = await enrolledStudent();
    await insertJoinedSessions(userId, 6);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 6, seconds: 0, enrollments: 1 });
    const response = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(response.body.error.code).toBe("SESSIONS_USED_UP");
    expect(
      await db.select().from(studySession).where(eq(studySession.userId, userId))
    ).toHaveLength(6);
  });

  it("refuses a new Session when the remaining seconds cannot cover the minimum start", async () => {
    const { agent, userId } = await enrolledStudent();
    await assignTestPlan(userId, { secondsPerPeriod: 179 });
    const response = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(response.body.error.code).toBe("MINUTES_USED_UP");
    expect(
      await db.select().from(studySession).where(eq(studySession.userId, userId))
    ).toHaveLength(0);
  });

  it.each([
    { secondsPerPeriod: 0, maxSessionSeconds: 1800, minStartSeconds: null },
    { secondsPerPeriod: 0, maxSessionSeconds: 1800, minStartSeconds: 0 },
    { secondsPerPeriod: null, maxSessionSeconds: 0, minStartSeconds: null }
  ])("refuses a zero budget rather than inserting a Session: %j", async (limits) => {
    const { agent, userId } = await enrolledStudent();
    await assignTestPlan(userId, limits);
    const response = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(response.body.error.code).toBe("MINUTES_USED_UP");
  });

  it("checks the Session limit before the seconds limit", async () => {
    const { agent, userId } = await enrolledStudent();
    await assignTestPlan(userId, { sessionsPerPeriod: 0, secondsPerPeriod: 0 });
    const response = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(response.body.error.code).toBe("SESSIONS_USED_UP");
  });

  it.each([
    { secondsPerPeriod: 600, maxSessionSeconds: 1800, grant: "600", limit: "allowance" },
    {
      secondsPerPeriod: 1800,
      maxSessionSeconds: 1800,
      grant: "1800",
      limit: "allowance"
    },
    { secondsPerPeriod: null, maxSessionSeconds: 1800, grant: "1800", limit: "session" },
    { secondsPerPeriod: 600, maxSessionSeconds: null, grant: "600", limit: "allowance" }
  ])(
    "bounds the grant and labels its limiting bound: %j",
    async ({ secondsPerPeriod, maxSessionSeconds, grant, limit }) => {
      const { agent, userId } = await enrolledStudent();
      await assignTestPlan(userId, {
        secondsPerPeriod,
        maxSessionSeconds,
        sessionsPerPeriod: null
      });
      const response = await agent.post(endpoint).send(tokenBody).expect(200);
      expect((await verifier.verify(response.body.token)).attributes).toMatchObject({
        session_seconds: grant,
        session_limit: limit
      });
      const [session] = await db
        .select()
        .from(studySession)
        .where(eq(studySession.userId, userId));
      expect(session).toMatchObject({
        grantedSeconds: Number(grant),
        sessionLimit: limit
      });
    }
  );

  it("stops counting a held Session after its ten-minute token window", async () => {
    const { agent, userId } = await enrolledStudent();
    await db
      .update(planAssignment)
      .set({ startsAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(planAssignment.userId, userId));
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    await db
      .update(studySession)
      .set({ issuedAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(studySession.userId, userId));
    const expired = await agent.get("/api/v1/me/allowance").expect(200);
    expect(expired.body.usage.sessions).toBe(0);
    const second = await agent.post(endpoint).send(tokenBody).expect(200);
    expect((await verifier.verify(second.body.token)).video?.room).not.toBe(
      (await verifier.verify(first.body.token)).video?.room
    );
    const current = await agent.get("/api/v1/me/allowance").expect(200);
    expect(current.body.usage.sessions).toBe(1);
    expect(deleteLivekitRoom).not.toHaveBeenCalled();
  });

  it("continues an open Session even when all Sessions in the Allowance are used", async () => {
    const { agent, userId } = await enrolledStudent();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const now = new Date(Math.ceil(Date.now() / 1000) * 1000);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    expect(
      (
        await signedWebhook(
          webhookEvent({
            room: { name: (await verifier.verify(first.body.token)).video!.room },
            participant: { identity: userId, kind: "STANDARD" }
          })
        )
      ).status
    ).toBe(200);
    await db
      .update(studySession)
      .set({ issuedAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(studySession.userId, userId));
    await db
      .update(planAssignment)
      .set({ startsAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(planAssignment.userId, userId));
    await insertJoinedSessions(userId, 5);
    const response = await agent.post(endpoint).send(tokenBody).expect(200);
    const claims = await verifier.verify(response.body.token);
    expect(claims.video?.room).toBe(
      (await verifier.verify(first.body.token)).video?.room
    );
    expect(claims.attributes?.session_seconds).toBe("1800");
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(6);
  });

  it("counts Sessions in their issuance Period and only for their Student", async () => {
    const { agent, userId } = await enrolledStudent();
    const other = await enrolledStudent();
    await insertJoinedSessions(other.userId, 6);
    await insertJoinedSessions(userId, 6);
    await db
      .update(planAssignment)
      .set({ startsAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(planAssignment.userId, userId));
    await db
      .update(studySession)
      .set({ issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(studySession.userId, userId));
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(0);
    await agent.post(endpoint).send(tokenBody).expect(200);
  });

  it("serializes parallel same-Chapter requests with one Session left into one room and row", async () => {
    const { agent, userId } = await enrolledStudent();
    await insertJoinedSessions(userId, 5);
    const responses = await Promise.all([
      agent.post(endpoint).send(tokenBody).expect(200),
      agent.post(endpoint).send(tokenBody).expect(200)
    ]);
    const claims = await Promise.all(
      responses.map((response) => verifier.verify(response.body.token))
    );
    expect(claims[0]!.video?.room).toBe(claims[1]!.video?.room);
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(6);
    expect(sessions.filter((session) => session.endedAt === null)).toHaveLength(1);
  });

  it("serializes parallel different-Chapter requests leaving one non-ended Session", async () => {
    await publishSecondChapter();
    const { agent, userId } = await enrolledStudent();
    await insertJoinedSessions(userId, 5);
    const responses = await Promise.all([
      agent.post(endpoint).send(tokenBody).expect(200),
      agent
        .post(endpoint)
        .send({ ...tokenBody, chapterNumber: 2 })
        .expect(200)
    ]);
    const claims = await Promise.all(
      responses.map((response) => verifier.verify(response.body.token))
    );
    expect(claims[0]!.video?.room).not.toBe(claims[1]!.video?.room);
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(7);
    expect(sessions.filter((session) => session.endedAt === null)).toHaveLength(1);
    const superseded = sessions.find(
      (session) => session.firstJoinedAt === null && session.endedAt !== null
    )!;
    expect(superseded.endReason).toBe("superseded");
    expect(deleteLivekitRoom).toHaveBeenCalledExactlyOnceWith(`ss_${superseded.id}`);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(6);
  });

  it("returns a server error if the current Plan assignment is missing", async () => {
    const { agent, userId } = await enrolledStudent();
    await db.delete(planAssignment).where(eq(planAssignment.userId, userId));
    const response = await agent.post(endpoint).send(tokenBody).expect(500);
    expect(response.body.error.code).toBe("PLAN_ASSIGNMENT_MISSING");
  });

  it("rolls back supersession and keeps the room when a new Session is refused", async () => {
    await publishSecondChapter();
    const { agent, userId } = await enrolledStudent();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const firstRoom = (await verifier.verify(first.body.token)).video!.room;
    await db
      .update(studySession)
      .set({ firstJoinedAt: new Date() })
      .where(eq(studySession.userId, userId));
    await insertJoinedSessions(userId, 5);
    const response = await agent
      .post(endpoint)
      .send({ ...tokenBody, chapterNumber: 2 })
      .expect(403);
    expect(response.body.error.code).toBe("SESSIONS_USED_UP");
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(6);
    expect(sessions.find((session) => `ss_${session.id}` === firstRoom)).toMatchObject({
      endedAt: null,
      endReason: null
    });
    expect(deleteLivekitRoom).not.toHaveBeenCalled();
  });

  it("supersedes a held Session for another Chapter and deletes its room", async () => {
    await publishSecondChapter();
    const { agent, userId } = await enrolledStudent();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const firstRoom = (await verifier.verify(first.body.token)).video!.room;
    vi.mocked(deleteLivekitRoom).mockImplementationOnce(async (room) => {
      const [ended] = await db
        .select()
        .from(studySession)
        .where(eq(studySession.id, room.slice(3)));
      expect(ended).toMatchObject({ endedAt: expect.any(Date), endReason: "superseded" });
    });
    const second = await agent
      .post(endpoint)
      .send({ ...tokenBody, chapterNumber: 2 })
      .expect(200);
    const secondRoom = (await verifier.verify(second.body.token)).video!.room;
    expect(secondRoom).not.toBe(firstRoom);
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(2);
    expect(sessions.find((session) => session.chapterNumber === 1)).toMatchObject({
      endedAt: expect.any(Date),
      endReason: "superseded"
    });
    expect(vi.mocked(deleteLivekitRoom)).toHaveBeenCalledExactlyOnceWith(firstRoom);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.sessions).toBe(1);
  });

  it("continues a held Session in the same room without counting it again", async () => {
    const { agent, userId } = await enrolledStudent();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const second = await agent.post(endpoint).send(tokenBody).expect(200);
    const firstClaims = await verifier.verify(first.body.token);
    const secondClaims = await verifier.verify(second.body.token);
    expect(secondClaims.video?.room).toBe(firstClaims.video?.room);
    expect(secondClaims.attributes).toMatchObject({
      session_seconds: "1800",
      session_limit: "session"
    });
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(1);
    expect(firstClaims.video?.room).toBe(`ss_${sessions[0]!.id}`);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 1, seconds: 0, enrollments: 1 });
  });

  it("cascades Session rows when their Account is deleted", async () => {
    const { agent, userId } = await enrolledStudent();
    await agent.post(endpoint).send(tokenBody).expect(200);
    expect(
      await db.select().from(studySession).where(eq(studySession.userId, userId))
    ).toHaveLength(1);
    await db.delete(user).where(eq(user.id, userId));
    expect(
      await db.select().from(studySession).where(eq(studySession.userId, userId))
    ).toHaveLength(0);
  });

  it("requires a Device session", async () => {
    const response = await request(app).post(endpoint).send(tokenBody).expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    {},
    { ...tokenBody, courseId: "Bad slug" },
    { ...tokenBody, courseId: "a".repeat(81) },
    { ...tokenBody, chapterNumber: 0 },
    { ...tokenBody, chapterNumber: 1.5 },
    { ...tokenBody, chapterNumber: "1" },
    { ...tokenBody, language: "arabic" },
    { ...tokenBody, experience: "fast" }
  ])("rejects an invalid body: %j", async (body) => {
    const { agent } = await signedInStudent();
    const response = await agent.post(endpoint).send(body).expect(400);
    expect(response.body.error.message).toBe("Invalid request");
  });

  it.each([
    { courseId: "unknown", chapterNumber: 1 },
    { courseId: "becan-test", chapterNumber: 999 }
  ])("checks Chapter existence before Enrollment: %j", async (chapter) => {
    const { agent } = await signedInStudent();
    const response = await agent
      .post(endpoint)
      .send({ ...tokenBody, ...chapter })
      .expect(404);
    expect(response.body.error.code).toBe("CHAPTER_NOT_FOUND");
  });

  it.each(["becan-test", "acct-101"])(
    "requires Enrollment before checking publication for %s",
    async (courseId) => {
      const { agent } = await signedInStudent();
      const response = await agent
        .post(endpoint)
        .send({ ...tokenBody, courseId })
        .expect(403);
      expect(response.body.error.code).toBe("NOT_ENROLLED");
    }
  );

  it("rejects an unpublished Chapter after enrolling", async () => {
    const { agent } = await signedInStudent();
    await agent.put("/api/v1/me/enrollments/acct-101").expect(201);
    const response = await agent
      .post(endpoint)
      .send({ ...tokenBody, courseId: "acct-101" })
      .expect(409);
    expect(response.body.error.code).toBe("CHAPTER_NOT_PUBLISHED");
  });

  it("rejects an ended Enrollment and another Account's active Enrollment", async () => {
    const first = await signedInStudent();
    const second = await signedInStudent();
    await first.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
    const other = await second.agent.post(endpoint).send(tokenBody).expect(403);
    expect(other.body.error.code).toBe("NOT_ENROLLED");

    await first.agent.delete("/api/v1/me/enrollments/becan-test").expect(204);
    const ended = await first.agent.post(endpoint).send(tokenBody).expect(403);
    expect(ended.body.error.code).toBe("NOT_ENROLLED");
  });

  it.each([
    { language: "Arabic", experience: "quick" },
    { language: "English", experience: "relaxed" }
  ])("mints a signed token with the agent contract: %j", async (preferences) => {
    const { agent, body } = await signedInStudent({ name: "سارة" });
    const student = await db.query.user.findFirst({ where: { email: body.email } });
    await agent.put("/api/v1/me/enrollments/becan-test").expect(201);

    const response = await agent
      .post(endpoint)
      .send({ ...tokenBody, ...preferences })
      .expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      token: expect.any(String),
      serverUrl: "wss://livekit.test"
    });

    const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    const claims = await verifier.verify(response.body.token);
    expect(claims.sub).toBe(student!.id);
    expect(claims.name).toBe(body.name);
    expect(claims.attributes).toEqual({
      course_id: "becan-test",
      chapter_id: "ch_1",
      ...preferences,
      user_id: student!.id,
      user_name: body.name,
      session_seconds: "1800",
      session_limit: "session"
    });
    const room = claims.video?.room;
    expect(room).toMatch(/^ss_[0-9a-f-]{36}$/);
    expect(claims.video).toEqual({ roomJoin: true, room });

    const payload = JSON.parse(
      Buffer.from(response.body.token.split(".")[1], "base64url").toString("utf8")
    );
    expect(payload.exp - payload.nbf).toBe(600);
  });
});
