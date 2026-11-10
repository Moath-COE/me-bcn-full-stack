import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import {
  account,
  adminAuditLog,
  session,
  twoFactor,
  user
} from "../src/db/schema/index.js";
import { recordAdminAction } from "../src/services/audit-log.service.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import {
  resetAccounts,
  signedInStudent,
  signUp,
  signUpBody,
  webOrigin
} from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

const auditLogUrl = "/api/v1/admin/audit-log";

async function entries() {
  return db.select().from(adminAuditLog).orderBy(adminAuditLog.createdAt);
}

// A Student who has not signed in: only an Account to act on.
async function targetStudent(overrides: Record<string, unknown> = {}) {
  const body = signUpBody(overrides);
  const response = await signUp(body).expect(200);

  return { body, id: response.body.user.id as string };
}

describe("Audit log writes from Better Auth admin endpoints", () => {
  beforeEach(resetAccounts);

  type AdminAgent = Awaited<ReturnType<typeof adminWithTwoFactor>>["agent"];

  function adminPost(agent: AdminAgent, path: string, body: Record<string, unknown>) {
    return agent.post(`/api/auth/admin/${path}`).set("Origin", webOrigin).send(body);
  }

  it("records a ban with the reason and the ban fields before and after", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const target = await targetStudent();

    await adminPost(agent, "ban-user", {
      userId: target.id,
      banReason: "spam",
      banExpiresIn: 3600
    }).expect(200);

    const [entry, ...rest] = await entries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: userId,
      action: "account.ban",
      targetType: "account",
      targetId: target.id,
      reason: "spam",
      before: { banned: false, banReason: null, banExpires: null },
      after: { banned: true, banReason: "spam" }
    });
    expect(typeof entry!.after!.banExpires).toBe("string");
  });

  it("records an unban", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const target = await targetStudent();
    await adminPost(agent, "ban-user", { userId: target.id }).expect(200);

    await adminPost(agent, "unban-user", { userId: target.id }).expect(200);

    const unban = (await entries()).filter((entry) => entry.action === "account.unban");
    expect(unban).toHaveLength(1);
    expect(unban[0]).toMatchObject({
      actorId: userId,
      targetId: target.id,
      before: { banned: true, banReason: "No reason", banExpires: null },
      after: { banned: false, banReason: null, banExpires: null }
    });
  });

  it("records a Role change", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const target = await targetStudent();

    await adminPost(agent, "set-role", { userId: target.id, role: "admin" }).expect(200);

    expect(await entries()).toMatchObject([
      {
        actorId: userId,
        action: "account.set-role",
        targetType: "account",
        targetId: target.id,
        before: { role: "user" },
        after: { role: "admin" }
      }
    ]);
  });

  it("records an Account update with only the changed fields", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent({ name: "Sara" });

    // majorId is sent with its current value, so it is not a change.
    await adminPost(agent, "update-user", {
      userId: target.id,
      data: { name: "Renamed", majorId: "ksu-cs" }
    }).expect(200);

    const [entry, ...rest] = await entries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      action: "account.update",
      targetId: target.id,
      before: { name: "Sara" },
      after: { name: "Renamed" }
    });
  });

  it("lets /admin/update-user change the allowed fields and records each", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();

    await adminPost(agent, "update-user", {
      userId: target.id,
      data: {
        name: "N",
        email: "New@Example.com",
        phoneNumber: "+966500000999",
        institutionId: "ksu",
        majorId: "ksu-cs",
        emailVerified: true
      }
    }).expect(200);

    const [entry] = await entries();
    expect(entry!.before).toMatchObject({ name: "Sara", emailVerified: false });
    expect(entry!.after).toEqual({
      name: "N",
      email: "new@example.com",
      phoneNumber: "+966500000999",
      emailVerified: true
    });
  });

  it("refuses update-user fields outside the allowlist with ADMIN_UPDATE_FIELD_NOT_ALLOWED", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();

    for (const data of [
      { twoFactorEnabled: true },
      { role: "admin" },
      { banned: true },
      { image: "http://example.com/x.png" },
      { name: "Fine", twoFactorEnabled: false }
    ]) {
      const response = await adminPost(agent, "update-user", {
        userId: target.id,
        data
      }).expect(400);

      expect(response.body.code).toBe("ADMIN_UPDATE_FIELD_NOT_ALLOWED");
    }

    expect(await entries()).toEqual([]);
    expect(await db.query.user.findFirst({ where: { id: target.id } })).toMatchObject({
      name: "Sara",
      role: "user",
      banned: false,
      twoFactorEnabled: false
    });
  });

  it("records a session revocation by resolving the Account, and keeps the token out", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const student = await signedInStudent();
    const studentId = (await db.query.user.findFirst({
      where: { email: student.body.email }
    }))!.id;
    const row = (await db.query.session.findFirst({ where: { userId: studentId } }))!;

    await adminPost(agent, "revoke-user-session", { sessionToken: row.token }).expect(
      200
    );

    const [entry, ...rest] = await entries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: userId,
      action: "account.revoke-session",
      targetType: "account",
      targetId: studentId,
      before: { sessionId: row.id },
      after: null
    });
    expect(JSON.stringify(entry)).not.toContain(row.token);
    expect(await db.query.session.findFirst({ where: { id: row.id } })).toBeUndefined();
  });

  it("records the revocation of all of an Account's sessions", async () => {
    const { agent } = await adminWithTwoFactor();
    const student = await signedInStudent();
    await student.agent
      .post("/api/auth/sign-in/email")
      .set("Origin", webOrigin)
      .send({ email: student.body.email, password: "correct horse battery" })
      .expect(200);
    const studentId = (await db.query.user.findFirst({
      where: { email: student.body.email }
    }))!.id;

    await adminPost(agent, "revoke-user-sessions", { userId: studentId }).expect(200);

    expect(await entries()).toMatchObject([
      {
        action: "account.revoke-sessions",
        targetId: studentId,
        before: { sessionCount: 2 },
        after: { sessionCount: 0 }
      }
    ]);
  });

  it("records a removal with no before, no after and no name, email or phone", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const target = await targetStudent({ name: "Layla Hassan" });

    await adminPost(agent, "remove-user", { userId: target.id }).expect(200);

    const [entry, ...rest] = await entries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: userId,
      action: "account.remove",
      targetType: "account",
      targetId: target.id,
      before: null,
      after: null,
      reason: null
    });

    const stored = JSON.stringify(entry);
    expect(stored).not.toContain("Layla");
    expect(stored).not.toContain(target.body.email);
    expect(stored).not.toContain(target.body.phoneNumber);
  });

  it("keeps an Admin's entries, with a null actor, after the Admin is removed", async () => {
    const first = await adminWithTwoFactor();
    const second = await adminWithTwoFactor();
    const target = await targetStudent();
    await adminPost(first.agent, "ban-user", { userId: target.id }).expect(200);

    await adminPost(second.agent, "remove-user", { userId: first.userId }).expect(200);

    const all = await entries();
    expect(all).toHaveLength(2);
    expect(all.find((entry) => entry.action === "account.ban")).toMatchObject({
      actorId: null,
      targetId: target.id
    });
    expect(all.find((entry) => entry.action === "account.remove")).toMatchObject({
      actorId: second.userId,
      targetId: first.userId
    });
  });

  it("strips name, email and phone from earlier entries when the Account is removed", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent({ name: "Layla Hassan" });
    await adminPost(agent, "update-user", {
      userId: target.id,
      data: { name: "Layla H.", email: "layla.new@example.com", emailVerified: true }
    }).expect(200);
    await adminPost(agent, "ban-user", { userId: target.id, banReason: "spam" }).expect(
      200
    );
    const other = await targetStudent({ name: "Omar Other" });
    await adminPost(agent, "update-user", {
      userId: other.id,
      data: { name: "Omar O." }
    }).expect(200);

    await adminPost(agent, "remove-user", { userId: target.id }).expect(200);

    const all = await entries();
    const forTarget = all.filter((entry) => entry.targetId === target.id);
    expect(forTarget.map((entry) => entry.action)).toEqual([
      "account.update",
      "account.ban",
      "account.remove"
    ]);

    const stored = JSON.stringify(forTarget);
    for (const personal of [
      "Layla",
      target.body.email,
      "layla.new@example.com",
      target.body.phoneNumber
    ]) {
      expect(stored).not.toContain(personal);
    }
    expect(forTarget[0]).toMatchObject({
      before: { emailVerified: false },
      after: { emailVerified: true }
    });
    expect(forTarget[0]!.before).not.toHaveProperty("name");
    expect(forTarget[1]).toMatchObject({
      before: { banned: false },
      after: { banned: true, banReason: "spam" },
      reason: "spam"
    });

    // Another Account's entries keep theirs.
    expect(all.find((entry) => entry.targetId === other.id)).toMatchObject({
      before: { name: "Omar Other" },
      after: { name: "Omar O." }
    });
  });

  describe("failed or refused calls write nothing", () => {
    it("a ban by a Student who has two-factor", async () => {
      const { agent, body } = await adminWithTwoFactor();
      await db.update(user).set({ role: "user" }).where(eq(user.email, body.email));
      const target = await targetStudent();

      await adminPost(agent, "ban-user", { userId: target.id }).expect(403);

      expect(await entries()).toEqual([]);
      expect((await db.query.user.findFirst({ where: { id: target.id } }))!.banned).toBe(
        false
      );
    });

    it("a ban by a Student without two-factor", async () => {
      const { agent } = await signedInStudent();
      const target = await targetStudent();

      const response = await adminPost(agent, "ban-user", { userId: target.id }).expect(
        403
      );

      expect(response.body.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
      expect(await entries()).toEqual([]);
    });

    it("a request without a session", async () => {
      const target = await targetStudent();

      await request(app)
        .post("/api/auth/admin/ban-user")
        .set("Origin", webOrigin)
        .send({ userId: target.id })
        .expect(401);

      expect(await entries()).toEqual([]);
    });

    it("set-role and remove-user on a session older than ten minutes", async () => {
      const { agent, userId } = await adminWithTwoFactor();
      const target = await targetStudent();
      await db
        .update(session)
        .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(session.userId, userId));

      await adminPost(agent, "set-role", { userId: target.id, role: "admin" }).expect(
        403
      );
      await adminPost(agent, "remove-user", { userId: target.id }).expect(403);

      expect(await entries()).toEqual([]);
    });

    it("an Admin targeting themselves with ban, set-role or remove-user", async () => {
      const { agent, userId } = await adminWithTwoFactor();

      for (const [path, body] of [
        ["ban-user", { userId, banReason: "oops" }],
        ["set-role", { userId, role: "user" }],
        ["remove-user", { userId }]
      ] as const) {
        const response = await adminPost(agent, path, body).expect(403);
        expect(response.body.code).toBe("ADMIN_SELF_TARGET");
      }

      expect(await entries()).toEqual([]);
      expect(await db.query.user.findFirst({ where: { id: userId } })).toMatchObject({
        role: "admin",
        banned: false
      });
    });

    it("self-targeting is refused with ADMIN_SELF_TARGET even on a stale session", async () => {
      const { agent, userId } = await adminWithTwoFactor();
      await db
        .update(session)
        .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(session.userId, userId));

      const response = await adminPost(agent, "set-role", {
        userId,
        role: "user"
      }).expect(403);

      expect(response.body.code).toBe("ADMIN_SELF_TARGET");
      expect(await entries()).toEqual([]);
    });

    it("an unknown Account and an unknown Role", async () => {
      const { agent } = await adminWithTwoFactor();
      const target = await targetStudent();

      await adminPost(agent, "ban-user", { userId: "no-such-account" }).expect(404);
      await adminPost(agent, "revoke-user-sessions", {
        userId: "no-such-account"
      }).expect(200);
      await adminPost(agent, "revoke-user-session", {
        sessionToken: "no-such-token"
      }).expect(200);
      await adminPost(agent, "set-role", { userId: target.id, role: "emperor" }).expect(
        400
      );
      await adminPost(agent, "update-user", { userId: target.id, data: {} }).expect(400);

      expect(await entries()).toEqual([]);
    });
  });

  it("does not audit reads", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();

    await agent.get("/api/auth/admin/list-users").expect(200);
    await agent.get(`/api/auth/admin/get-user?id=${target.id}`).expect(200);
    await adminPost(agent, "list-user-sessions", { userId: target.id }).expect(200);
    await adminPost(agent, "has-permission", { permissions: { audit: ["read"] } }).expect(
      200
    );

    expect(await entries()).toEqual([]);
  });

  it("keeps password hashes, session tokens and two-factor secrets out of every entry", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const student = await signedInStudent();
    const studentId = (await db.query.user.findFirst({
      where: { email: student.body.email }
    }))!.id;
    const sessionToken = (await db.query.session.findFirst({
      where: { userId: studentId }
    }))!.token;

    await adminPost(agent, "update-user", {
      userId: studentId,
      data: { name: "Renamed" }
    }).expect(200);
    await adminPost(agent, "update-user", {
      userId: studentId,
      data: { password: "a brand new password" }
    }).expect(400);
    await adminPost(agent, "ban-user", { userId: studentId, banReason: "spam" }).expect(
      200
    );
    await adminPost(agent, "unban-user", { userId: studentId }).expect(200);
    await adminPost(agent, "set-role", { userId: studentId, role: "admin" }).expect(200);
    await adminPost(agent, "revoke-user-sessions", { userId: studentId }).expect(200);

    const stored = JSON.stringify(await entries());
    const secrets = [
      sessionToken,
      ...(await db.select().from(account)).flatMap((row) => [row.password ?? ""]),
      ...(await db.select().from(twoFactor)).flatMap((row) => [
        row.secret,
        row.backupCodes
      ])
    ].filter((secret) => secret !== "");

    expect(secrets.length).toBeGreaterThan(2);
    for (const secret of secrets) expect(stored).not.toContain(secret);
    expect(stored).not.toContain("a brand new password");
    expect(JSON.parse(stored)).toHaveLength(5);
    expect(userId).toBeDefined();
  });
});

describe("recordAdminAction", () => {
  beforeEach(resetAccounts);

  it("writes an entry for our own routes, with null before, after and reason by default", async () => {
    const { userId } = await adminWithTwoFactor();

    await recordAdminAction({
      actorId: userId,
      action: "course.publish",
      targetType: "course",
      targetId: "becan-test"
    });

    expect(await entries()).toMatchObject([
      {
        actorId: userId,
        action: "course.publish",
        targetType: "course",
        targetId: "becan-test",
        before: null,
        after: null,
        reason: null
      }
    ]);
  });

  it("commits with the caller's transaction and rolls back with it", async () => {
    const { userId } = await adminWithTwoFactor();
    const entry = {
      actorId: userId,
      action: "course.update",
      targetType: "course",
      targetId: "becan-test",
      before: { title: "a" },
      after: { title: "b" },
      reason: "typo"
    };

    await db.transaction((tx) => recordAdminAction(entry, tx));
    await expect(
      db.transaction(async (tx) => {
        await recordAdminAction(entry, tx);
        throw new Error("the route failed after writing the entry");
      })
    ).rejects.toThrow("the route failed");

    expect(await entries()).toMatchObject([entry]);
  });
});

describe("GET /api/v1/admin/audit-log", () => {
  beforeEach(resetAccounts);

  function read(cookie: string, query = "") {
    return request(app).get(`${auditLogUrl}${query}`).set("Cookie", cookie);
  }

  async function seed(actorId: string | null, count: number, overrides = {}) {
    // Spaced a minute apart, the first being oldest, ending at `endsAt`.
    const endsAt = new Date("2026-10-10T12:00:00Z").getTime();
    const rows = Array.from({ length: count }, (_, index) => ({
      actorId,
      action: "account.ban",
      targetType: "account",
      targetId: `target-${index}`,
      createdAt: new Date(endsAt - (count - 1 - index) * 60_000),
      ...overrides
    }));
    await db.insert(adminAuditLog).values(rows);
  }

  it("answers 401 UNAUTHENTICATED without a session", async () => {
    const response = await request(app).get(auditLogUrl).expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("refuses a Student with ADMIN_PERMISSION_REQUIRED", async () => {
    const { cookie } = await signedInStudent();

    const response = await read(cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  it("refuses an Admin without two-factor with ADMIN_TWO_FACTOR_REQUIRED", async () => {
    const { body, cookie } = await signedInStudent();
    await promoteToAdmin(body.email);

    const response = await read(cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it("returns an empty page for an empty log", async () => {
    const { cookie } = await adminWithTwoFactor();

    const response = await read(cookie).expect(200);

    expect(response.body).toEqual({ entries: [], total: 0, limit: 50, offset: 0 });
  });

  it("lists newest first with the actor's id, name and email", async () => {
    const { cookie, userId, body } = await adminWithTwoFactor();
    await seed(userId, 3);

    const response = await read(cookie).expect(200);

    expect(response.body.total).toBe(3);
    expect(
      response.body.entries.map((entry: { targetId: string }) => entry.targetId)
    ).toEqual(["target-2", "target-1", "target-0"]);
    expect(response.body.entries[0]).toEqual({
      id: expect.any(String),
      actor: { id: userId, name: body.name, email: body.email },
      action: "account.ban",
      targetType: "account",
      targetId: "target-2",
      before: null,
      after: null,
      reason: null,
      createdAt: "2026-10-10T12:00:00.000Z"
    });
  });

  it("shows a null actor for an Admin who was removed", async () => {
    const { cookie } = await adminWithTwoFactor();
    await seed(null, 1);

    const response = await read(cookie).expect(200);

    expect(response.body.entries[0].actor).toBeNull();
  });

  it("pages with limit and offset and keeps the total", async () => {
    const { cookie, userId } = await adminWithTwoFactor();
    await seed(userId, 5);

    const response = await read(cookie, "?limit=2&offset=1").expect(200);

    expect(response.body).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(
      response.body.entries.map((entry: { targetId: string }) => entry.targetId)
    ).toEqual(["target-3", "target-2"]);
  });

  it("filters by actor, target type, target id and action", async () => {
    const { cookie, userId } = await adminWithTwoFactor();
    const other = await targetStudent();
    await seed(userId, 2);
    await seed(other.id, 1, {
      action: "course.publish",
      targetType: "course",
      targetId: "c1"
    });

    const byActor = await read(cookie, `?actorId=${other.id}`).expect(200);
    expect(byActor.body.total).toBe(1);
    expect(byActor.body.entries[0].actor.id).toBe(other.id);

    const byType = await read(cookie, "?targetType=course").expect(200);
    expect(
      byType.body.entries.map((entry: { targetId: string }) => entry.targetId)
    ).toEqual(["c1"]);

    const byTarget = await read(cookie, "?targetType=account&targetId=target-1").expect(
      200
    );
    expect(byTarget.body.total).toBe(1);

    const byAction = await read(cookie, "?action=account.ban").expect(200);
    expect(byAction.body.total).toBe(2);
  });

  it("filters by a date range, a date alone covering its whole UTC day", async () => {
    const { cookie, userId } = await adminWithTwoFactor();
    await db.insert(adminAuditLog).values(
      [
        "2026-10-08T23:59:59Z",
        "2026-10-09T00:00:00Z",
        "2026-10-09T18:00:00Z",
        "2026-10-10T00:00:00Z"
      ].map((createdAt, index) => ({
        actorId: userId,
        action: "account.ban",
        targetType: "account",
        targetId: `day-${index}`,
        createdAt: new Date(createdAt)
      }))
    );
    const targets = async (query: string) =>
      (await read(cookie, query).expect(200)).body.entries.map(
        (entry: { targetId: string }) => entry.targetId
      );

    expect(await targets("?from=2026-10-09&to=2026-10-09")).toEqual(["day-2", "day-1"]);
    expect(await targets("?from=2026-10-09T00:00:00Z&to=2026-10-09T00:00:00Z")).toEqual([
      "day-1"
    ]);
    expect(await targets("?from=2026-10-09T12:00:00Z")).toEqual(["day-3", "day-2"]);
    expect(await targets("?to=2026-10-08")).toEqual(["day-0"]);
  });

  it("rejects an invalid query with 400", async () => {
    const { cookie } = await adminWithTwoFactor();

    for (const query of [
      "?limit=201",
      "?limit=0",
      "?offset=-1",
      "?from=yesterday",
      "?limit=x"
    ]) {
      await read(cookie, query).expect(400);
    }
  });

  it("does not audit its own reads", async () => {
    const { cookie } = await adminWithTwoFactor();

    await read(cookie).expect(200);

    expect(await entries()).toEqual([]);
  });
});
