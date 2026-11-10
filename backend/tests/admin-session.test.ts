import { eq } from "drizzle-orm";
import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import {
  enrollment,
  plan,
  planAssignment,
  studySession,
  studySessionPresence,
  user
} from "../src/db/schema/index.js";
import { deleteLivekitRoom } from "../src/lib/livekit.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { ADMIN_SESSION_GRANT_SECONDS } from "../src/services/livekit.service.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import { signedWebhook, webhookEvent } from "./support/livekit-webhook.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

vi.mock("../src/lib/livekit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/livekit.js")>()),
  deleteLivekitRoom: vi.fn().mockResolvedValue(undefined)
}));

const endpoint = "/api/v1/livekit/token";
const allowanceEndpoint = "/api/v1/me/allowance";
const tokenBody = {
  courseId: "becan-test",
  chapterNumber: 1,
  language: "Arabic",
  experience: "quick"
};
// A display Course whose Chapters are all unpublished.
const unpublishedBody = { ...tokenBody, courseId: "acct-101" };

const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

async function adminWithoutTwoFactor() {
  const student = await signedInStudent();
  const { userId } = await promoteToAdmin(student.body.email);
  return { ...student, userId };
}

describe("Admin Sessions", () => {
  beforeEach(async () => {
    await resetAccounts();
    vi.mocked(deleteLivekitRoom).mockClear();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await db
      .delete(planAssignment)
      .where(eq(planAssignment.planId, "admin-session-test"));
    await db.delete(plan).where(eq(plan.id, "admin-session-test"));
  });

  it("gives an Admin with two-factor a token for a published Chapter with no Enrollment", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const response = await agent.post(endpoint).send(tokenBody).expect(200);
    const claims = await verifier.verify(response.body.token);

    expect(ADMIN_SESSION_GRANT_SECONDS).toBe(10800);
    expect(claims.attributes).toMatchObject({
      course_id: "becan-test",
      chapter_id: "ch_1",
      user_id: userId,
      session_seconds: "10800",
      session_limit: "session"
    });
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ kind: "admin", grantedSeconds: 10800 });
    expect(claims.video?.room).toBe(`ss_${sessions[0]!.id}`);
  });

  it("allows an unpublished Chapter but still requires the Chapter to exist", async () => {
    const { agent } = await adminWithTwoFactor();
    await agent.post(endpoint).send(unpublishedBody).expect(200);
    const missing = await agent
      .post(endpoint)
      .send({ ...tokenBody, chapterNumber: 99 })
      .expect(404);
    expect(missing.body.error.code).toBe("CHAPTER_NOT_FOUND");
  });

  it("still gives a token when Sessions and minutes are used up", async () => {
    await db.insert(plan).values({
      id: "admin-session-test",
      nameAr: "باقة الاختبار",
      nameEn: "Admin session test",
      sessionsPerPeriod: 1,
      secondsPerPeriod: 100,
      maxSessionSeconds: 100,
      minStartSeconds: 100
    });
    const { agent, userId } = await adminWithTwoFactor();
    const joinedAt = new Date(Date.now() - 200_000);
    await db
      .update(planAssignment)
      .set({ planId: "admin-session-test", startsAt: new Date(Date.now() - 3_600_000) })
      .where(eq(planAssignment.userId, userId));
    const [spent] = await db
      .insert(studySession)
      .values({
        userId,
        courseId: "becan-test",
        chapterNumber: 1,
        grantedSeconds: 100,
        sessionLimit: "session",
        issuedAt: joinedAt,
        firstJoinedAt: joinedAt,
        endedAt: new Date(joinedAt.getTime() + 100_000),
        endReason: "superseded"
      })
      .returning();
    await db.insert(studySessionPresence).values({
      sessionId: spent!.id,
      joinedAt,
      leftAt: new Date(joinedAt.getTime() + 100_000)
    });
    const used = await agent.get(allowanceEndpoint).expect(200);
    expect(used.body.usage).toMatchObject({ sessions: 1, seconds: 100 });

    const response = await agent.post(endpoint).send(tokenBody).expect(200);
    const claims = await verifier.verify(response.body.token);
    expect(claims.attributes).toMatchObject({
      session_seconds: "10800",
      session_limit: "session"
    });
  });

  it("treats an Admin without two-factor as a Student", async () => {
    const { agent, userId } = await adminWithoutTwoFactor();
    const notEnrolled = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(notEnrolled.body.error.code).toBe("NOT_ENROLLED");

    await db.insert(enrollment).values({ userId, courseId: "acct-101" });
    const unpublished = await agent.post(endpoint).send(unpublishedBody).expect(409);
    expect(unpublished.body.error.code).toBe("CHAPTER_NOT_PUBLISHED");
  });

  it("refuses a demoted Admin right away, though the cookie still names the Admin Role", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    await agent.post(endpoint).send(tokenBody).expect(200);
    await db.update(user).set({ role: "user" }).where(eq(user.id, userId));

    const refused = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(refused.body.error.code).toBe("NOT_ENROLLED");
    const unpublished = await agent.post(endpoint).send(unpublishedBody).expect(403);
    expect(unpublished.body.error.code).toBe("NOT_ENROLLED");
  });

  it("does not let a demoted Admin continue an Admin Session", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    await db.update(user).set({ role: "user" }).where(eq(user.id, userId));
    await db.insert(enrollment).values({ userId, courseId: "becan-test" });

    const second = await agent.post(endpoint).send(tokenBody).expect(200);
    const claims = await verifier.verify(second.body.token);
    expect(claims.attributes?.session_seconds).toBe("1800");
    expect(claims.video?.room).not.toBe(
      (await verifier.verify(first.body.token)).video?.room
    );
    const kinds = await db
      .select({ kind: studySession.kind, endReason: studySession.endReason })
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(kinds).toHaveLength(2);
    expect(kinds).toContainEqual({ kind: "admin", endReason: "superseded" });
    expect(kinds).toContainEqual({ kind: "student", endReason: null });
  });

  it("turns an Admin who turns two-factor off back into a Student", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, userId));
    const response = await agent.post(endpoint).send(tokenBody).expect(403);
    expect(response.body.error.code).toBe("NOT_ENROLLED");
    expect((await agent.get(allowanceEndpoint).expect(200)).body.unlimited).toBe(false);
  });

  it("continues a held Admin Session in its room and supersedes it for another Chapter", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const second = await agent.post(endpoint).send(tokenBody).expect(200);
    const firstRoom = (await verifier.verify(first.body.token)).video?.room;
    expect((await verifier.verify(second.body.token)).video?.room).toBe(firstRoom);
    expect(
      await db.select().from(studySession).where(eq(studySession.userId, userId))
    ).toHaveLength(1);
    expect(deleteLivekitRoom).not.toHaveBeenCalled();

    const other = await agent.post(endpoint).send(unpublishedBody).expect(200);
    const otherRoom = (await verifier.verify(other.body.token)).video?.room;
    expect(otherRoom).not.toBe(firstRoom);
    expect(deleteLivekitRoom).toHaveBeenCalledWith(firstRoom);
    const sessions = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.endReason === "superseded")).toHaveLength(
      1
    );
    expect(sessions.every((session) => session.kind === "admin")).toBe(true);
  });

  it("continues an open Admin Session with its remaining grant", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const start = Math.ceil(Date.now() / 1000) * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const first = await agent.post(endpoint).send(tokenBody).expect(200);
    const room = { name: (await verifier.verify(first.body.token)).video!.room! };
    const participant = { identity: userId, kind: "STANDARD" };
    await signedWebhook(
      webhookEvent({ room, participant, createdAt: String(start / 1000) })
    ).then((response) => expect(response.status).toBe(200));
    await signedWebhook(
      webhookEvent({
        event: "participant_left",
        room,
        participant,
        createdAt: String(start / 1000 + 600)
      })
    ).then((response) => expect(response.status).toBe(200));
    vi.setSystemTime(start + 660_000);

    const second = await agent.post(endpoint).send(tokenBody).expect(200);
    const claims = await verifier.verify(second.body.token);
    expect(claims.video?.room).toBe(room.name);
    expect(claims.attributes?.session_seconds).toBe("10200");
  });

  it("records presence for an Admin Session without counting it as Usage", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const start = Math.ceil(Date.now() / 1000) * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const response = await agent.post(endpoint).send(tokenBody).expect(200);
    const room = { name: (await verifier.verify(response.body.token)).video!.room! };
    const participant = { identity: userId, kind: "STANDARD" };

    const held = await agent.get(allowanceEndpoint).expect(200);
    expect(held.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 0 });

    await signedWebhook(
      webhookEvent({ room, participant, createdAt: String(start / 1000) })
    ).then((result) => expect(result.status).toBe(200));
    vi.setSystemTime(start + 300_000);
    const connected = await agent.get(allowanceEndpoint).expect(200);
    expect(connected.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 0 });
    await signedWebhook(
      webhookEvent({
        event: "participant_left",
        room,
        participant,
        createdAt: String(start / 1000 + 300)
      })
    ).then((result) => expect(result.status).toBe(200));

    const [session] = await db
      .select()
      .from(studySession)
      .where(eq(studySession.userId, userId));
    expect(session).toMatchObject({ kind: "admin", firstJoinedAt: new Date(start) });
    const presence = await db
      .select()
      .from(studySessionPresence)
      .where(eq(studySessionPresence.sessionId, session!.id));
    expect(presence).toHaveLength(1);
    expect(presence[0]!.leftAt).toEqual(new Date(start + 300_000));
    const after = await agent.get(allowanceEndpoint).expect(200);
    expect(after.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 0 });
  });

  it("reports unlimited only for an Admin with two-factor", async () => {
    const student = await signedInStudent();
    expect((await student.agent.get(allowanceEndpoint).expect(200)).body.unlimited).toBe(
      false
    );
    const noTwoFactor = await adminWithoutTwoFactor();
    expect(
      (await noTwoFactor.agent.get(allowanceEndpoint).expect(200)).body.unlimited
    ).toBe(false);

    const admin = await adminWithTwoFactor();
    const allowance = await admin.agent.get(allowanceEndpoint).expect(200);
    expect(allowance.body.unlimited).toBe(true);
    // Everything else is unchanged, so the web's existing schema keeps parsing.
    expect(allowance.body.plan.id).toBe("free");
    expect(allowance.body.limits.sessions).toBe(6);

    await db.update(user).set({ role: "user" }).where(eq(user.id, admin.userId));
    expect((await admin.agent.get(allowanceEndpoint).expect(200)).body.unlimited).toBe(
      false
    );
  });
});
