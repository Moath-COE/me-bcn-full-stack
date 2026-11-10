import { eq } from "drizzle-orm";
import { TokenVerifier } from "livekit-server-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { logger } from "../src/config/logger.js";
import { db } from "../src/db/index.js";
import {
  planAssignment,
  studySession,
  studySessionPresence,
  livekitWebhookEvent,
  user
} from "../src/db/schema/index.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import {
  signedWebhook,
  webhookEndpoint,
  webhookEvent,
  webhookSignature
} from "./support/livekit-webhook.js";

const tokenBody = {
  courseId: "becan-test",
  chapterNumber: 1,
  language: "Arabic",
  experience: "quick"
};
const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

async function startSession() {
  const student = await signedInStudent();
  await student.agent.put("/api/v1/me/enrollments/becan-test").expect(201);
  const start = Math.ceil(Date.now() / 1000) * 1000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  const response = await student.agent
    .post("/api/v1/livekit/token")
    .send(tokenBody)
    .expect(200);
  const claims = await verifier.verify(response.body.token);
  const room = { name: claims.video!.room! };
  const participant = { identity: claims.sub!, kind: "STANDARD" };
  const send = (
    event: string,
    seconds: number,
    overrides: Record<string, unknown> = {}
  ) =>
    signedWebhook(
      webhookEvent({
        event,
        room,
        participant,
        createdAt: String(start / 1000 + seconds),
        ...overrides
      })
    );
  return { ...student, start, claims, room, participant, send };
}

describe("LiveKit webhooks", () => {
  beforeEach(resetAccounts);
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects missing and invalid signatures through the shared error path", async () => {
    for (const signature of [undefined, "invalid-jwt"]) {
      const call = request(app).post(webhookEndpoint).send(webhookEvent());
      if (signature) call.set("Authorization", signature);
      const response = await call.expect(401);
      expect(response.body.error.code).toBe("INVALID_WEBHOOK_SIGNATURE");
    }
  });

  it.each(["application/webhook+json", "application/json"])(
    "accepts a signed raw body with %s without a Device session",
    async (contentType) => {
      expect((await signedWebhook(webhookEvent(), contentType)).status).toBe(200);
    }
  );

  it("verifies the exact bytes, accepting whitespace and rejecting a changed body", async () => {
    const raw = JSON.stringify(webhookEvent(), null, 2) + "\n";
    const signature = await webhookSignature(raw);
    await request(app)
      .post(webhookEndpoint)
      .set("Content-Type", "application/webhook+json")
      .set("Authorization", signature)
      .send(raw)
      .expect(200);
    const changed = await request(app)
      .post(webhookEndpoint)
      .set("Content-Type", "application/webhook+json")
      .set("Authorization", signature)
      .send(raw + " ")
      .expect(401);
    expect(changed.body.error.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("serializes concurrent retries and distinct joins into one interval", async () => {
    const { agent, start, send } = await startSession();
    const responses = await Promise.all([
      send("participant_joined", 0, { id: "concurrent-join" }),
      send("participant_joined", 0, { id: "concurrent-join" }),
      send("participant_joined", 0)
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    await send("participant_left", 90);
    vi.setSystemTime(start + 100_000);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.seconds).toBe(90);
  });

  it("cascades presence on Account deletion and keeps the event retry records", async () => {
    const { send, claims } = await startSession();
    await send("participant_joined", 0, { id: "retained-event" });
    expect(await db.select().from(studySessionPresence)).toHaveLength(1);
    await db.delete(user).where(eq(user.id, claims.sub!));
    expect(await db.select().from(studySessionPresence)).toHaveLength(0);
    expect(await db.select().from(livekitWebhookEvent)).toMatchObject([
      { id: "retained-event" }
    ]);
  });

  it("enforces seconds left and minimum start from connected Usage", async () => {
    const { agent, start, send, participant } = await startSession();
    await send("participant_joined", 0);
    await send("participant_left", 1700);
    vi.setSystemTime(start + 1820_000);
    const second = await agent.post("/api/v1/livekit/token").send(tokenBody).expect(200);
    const secondRoom = (await verifier.verify(second.body.token)).video!.room!;
    await send("participant_joined", 1820, { room: { name: secondRoom } });
    await send("participant_left", 3520, { room: { name: secondRoom } });
    vi.setSystemTime(start + 3640_000);
    const third = await agent.post("/api/v1/livekit/token").send(tokenBody).expect(200);
    const thirdClaims = await verifier.verify(third.body.token);
    expect(thirdClaims.attributes).toMatchObject({
      session_seconds: "200",
      session_limit: "allowance"
    });
    const room = { name: thirdClaims.video!.room! };
    await send("participant_joined", 3640, { room, participant });
    await send("participant_left", 3670, { room, participant });
    vi.setSystemTime(start + 3700_000);
    const continued = await agent
      .post("/api/v1/livekit/token")
      .send(tokenBody)
      .expect(200);
    expect(
      (await verifier.verify(continued.body.token)).attributes!.session_seconds
    ).toBe("170");
    vi.setSystemTime(start + 3790_000);
    const denied = await agent.post("/api/v1/livekit/token").send(tokenBody).expect(403);
    expect(denied.body.error.code).toBe("MINUTES_USED_UP");
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 3, seconds: 3430, enrollments: 1 });
  });

  it("continues an actively connected Session with its remaining grant", async () => {
    const { agent, start, send, room } = await startSession();
    await send("participant_joined", 0);
    vi.setSystemTime(start + 90_500);
    const response = await agent
      .post("/api/v1/livekit/token")
      .send(tokenBody)
      .expect(200);
    const claims = await verifier.verify(response.body.token);
    expect(claims.video!.room).toBe(room.name);
    expect(claims.attributes!.session_seconds).toBe("1709.5");
  });

  it("charges 90 connected seconds using event time, even when delivery is delayed", async () => {
    const { agent, start, send } = await startSession();
    vi.setSystemTime(start + 15 * 60 * 1000);
    expect((await send("participant_joined", 0)).status).toBe(200);
    expect((await send("participant_left", 90)).status).toBe(200);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 1, seconds: 90, enrollments: 1 });
  });

  it("retries each event id as a no-op, even after another interval opens", async () => {
    const { agent, start, send } = await startSession();
    const joinId = "first-join";
    const leaveId = "first-leave";
    await send("participant_joined", 0, { id: joinId });
    await send("participant_left", 90, { id: leaveId });
    await send("participant_joined", 120);
    await send("participant_left", 90, { id: leaveId });
    await send("participant_joined", 0, { id: joinId });
    await send("participant_left", 180);
    vi.setSystemTime(start + 200_000);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.seconds).toBe(150);
  });

  it("ignores agents, unknown rooms, other identities and other event types", async () => {
    const { agent, start, participant, send } = await startSession();
    const ignored = [
      { participant: { ...participant, kind: "AGENT" } },
      { participant: { ...participant, kind: 4 } },
      { participant: { ...participant, identity: "another-student" } },
      { room: { name: "ss_00000000-0000-0000-0000-000000000000" } },
      { room: { name: "ss_not-a-uuid" } },
      { room: { name: "unrelated-room" } },
      { participant: undefined },
      { event: "room_started" }
    ];
    for (const overrides of ignored) {
      expect((await send("participant_joined", 0, overrides)).status).toBe(200);
    }
    vi.setSystemTime(start + 601_000);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 1 });
  });

  it("ignores a leave with no open interval and distinct repeated joins", async () => {
    const { agent, start, send } = await startSession();
    await send("participant_left", 0);
    await send("participant_joined", 10);
    await send("participant_joined", 20);
    await send("participant_left", 100);
    await send("participant_left", 120);
    vi.setSystemTime(start + 150_000);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.seconds).toBe(90);
  });

  it("adds intervals and caps both open and closed Usage at the grant", async () => {
    const { agent, start, send } = await startSession();
    await send("participant_joined", 0);
    await send("participant_left", 90);
    await send("participant_joined", 120);
    vi.setSystemTime(start + 180_000);
    const open = await agent.get("/api/v1/me/allowance").expect(200);
    expect(open.body.usage.seconds).toBe(150);
    vi.setSystemTime(start + 3000_000);
    const capped = await agent.get("/api/v1/me/allowance").expect(200);
    expect(capped.body.usage.seconds).toBe(1800);
    await send("participant_left", 3000);
    const closed = await agent.get("/api/v1/me/allowance").expect(200);
    expect(closed.body.usage.seconds).toBe(1800);
  });

  it.each([
    { elapsed: 119, continues: true },
    { elapsed: 120, continues: false }
  ])(
    "continues only inside the two-minute resume window: %j",
    async ({ elapsed, continues }) => {
      const { agent, start, send, room } = await startSession();
      await send("participant_joined", 0);
      await send("participant_left", 90);
      vi.setSystemTime(start + (90 + elapsed) * 1000);
      const response = await agent
        .post("/api/v1/livekit/token")
        .send(tokenBody)
        .expect(200);
      const claims = await verifier.verify(response.body.token);
      expect(claims.video!.room === room.name).toBe(continues);
      expect(claims.attributes!.session_seconds).toBe(continues ? "1710" : "1800");
    }
  );

  it("ends a missing leave at the grant boundary on issuance and logs it only once", async () => {
    const { agent, start, send, room, claims } = await startSession();
    const warn = vi.spyOn(logger, "warn");
    await send("participant_joined", 0);
    vi.setSystemTime(start + 1801_000);
    const capped = await agent.get("/api/v1/me/allowance").expect(200);
    expect(capped.body.usage.seconds).toBe(1800);
    expect(warn).not.toHaveBeenCalled();
    const response = await agent
      .post("/api/v1/livekit/token")
      .send(tokenBody)
      .expect(200);
    expect((await verifier.verify(response.body.token)).video!.room).not.toBe(room.name);
    const id = room.name.slice(3);
    const [ended] = await db.select().from(studySession).where(eq(studySession.id, id));
    expect(ended).toMatchObject({
      endedAt: new Date(start + 1800_000),
      endReason: "no_leave_event"
    });
    const [presence] = await db
      .select()
      .from(studySessionPresence)
      .where(eq(studySessionPresence.sessionId, id));
    expect(presence!.leftAt).toEqual(new Date(start + 1800_000));
    await agent.post("/api/v1/livekit/token").send(tokenBody).expect(200);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { userId: claims.sub, sessionId: id },
      "Session ended without a leave event"
    );
  });

  it("ends a missing leave using the grant remaining after earlier intervals", async () => {
    const { agent, start, send, room } = await startSession();
    await send("participant_joined", 0);
    await send("participant_left", 90);
    await send("participant_joined", 120);
    vi.setSystemTime(start + 1831_000);
    await agent.post("/api/v1/livekit/token").send(tokenBody).expect(200);
    const [ended] = await db
      .select()
      .from(studySession)
      .where(eq(studySession.id, room.name.slice(3)));
    expect(ended).toMatchObject({
      endedAt: new Date(start + 1830_000),
      endReason: "no_leave_event"
    });
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage.seconds).toBe(1800);
  });

  it("persists missing-leave cleanup even when the next token is refused", async () => {
    const { agent, start, send } = await startSession();
    await send("participant_joined", 0);
    vi.setSystemTime(start + 1801_000);
    const second = await agent.post("/api/v1/livekit/token").send(tokenBody).expect(200);
    const room = (await verifier.verify(second.body.token)).video!.room!;
    await send("participant_joined", 1801, { room: { name: room } });
    vi.setSystemTime(start + 3602_000);
    const warn = vi.spyOn(logger, "warn");
    for (let retry = 0; retry < 2; retry += 1) {
      const denied = await agent
        .post("/api/v1/livekit/token")
        .send(tokenBody)
        .expect(403);
      expect(denied.body.error.code).toBe("MINUTES_USED_UP");
    }
    const [ended] = await db
      .select()
      .from(studySession)
      .where(eq(studySession.id, room.slice(3)));
    expect(ended).toMatchObject({
      endedAt: new Date(start + 3601_000),
      endReason: "no_leave_event"
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("charges a Session only to its issuance Period, even when it joins after the boundary", async () => {
    const { agent, start, claims, send } = await startSession();
    await db
      .update(planAssignment)
      .set({ startsAt: new Date(start - 30 * 24 * 60 * 60 * 1000 + 60_000) })
      .where(eq(planAssignment.userId, claims.sub!));
    await send("participant_joined", 90);
    await send("participant_left", 180);
    vi.setSystemTime(start + 200_000);
    const allowance = await agent.get("/api/v1/me/allowance").expect(200);
    expect(allowance.body.usage).toEqual({ sessions: 0, seconds: 0, enrollments: 1 });
    await db
      .update(planAssignment)
      .set({ startsAt: new Date(start) })
      .where(eq(planAssignment.userId, claims.sub!));
    const issuancePeriod = await agent.get("/api/v1/me/allowance").expect(200);
    expect(issuancePeriod.body.usage.seconds).toBe(90);
  });
});
