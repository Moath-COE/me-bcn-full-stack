import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { session, user } from "../src/db/schema/index.js";
import {
  password,
  resetAccounts,
  signedInStudent,
  signUp,
  signUpBody,
  webOrigin
} from "./support/accounts.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import {
  adminWithTwoFactor,
  currentTotpCode,
  startSignIn,
  twoFactorRowCount
} from "./support/two-factor.js";

async function storedTwoFactorEnabled(email: string) {
  const row = await db.query.user.findFirst({
    columns: { twoFactorEnabled: true },
    where: { email }
  });

  return row?.twoFactorEnabled;
}

describe("two-factor (TOTP)", () => {
  beforeEach(resetAccounts);

  it("lets an Admin turn TOTP on with their password and a generated code", async () => {
    const { agent, body } = await signedInStudent();
    const { userId } = await promoteToAdmin(body.email);

    const enabled = await agent
      .post("/api/auth/two-factor/enable")
      .set("Origin", webOrigin)
      .send({ password })
      .expect(200);

    expect(enabled.body.totpURI).toMatch(/^otpauth:\/\/totp\/Becan:/);
    expect(enabled.body.backupCodes).toHaveLength(10);
    // Not on until a code from the authenticator app is verified.
    expect(await storedTwoFactorEnabled(body.email)).toBe(false);

    await agent
      .post("/api/auth/two-factor/verify-totp")
      .set("Origin", webOrigin)
      .send({ code: await currentTotpCode(userId) })
      .expect(200);

    expect(await storedTwoFactorEnabled(body.email)).toBe(true);
  });

  it("refuses to turn TOTP on with the wrong password", async () => {
    const { agent, body } = await signedInStudent();
    await promoteToAdmin(body.email);

    await agent
      .post("/api/auth/two-factor/enable")
      .set("Origin", webOrigin)
      .send({ password: "not the password" })
      .expect(400);

    expect(await storedTwoFactorEnabled(body.email)).toBe(false);
  });

  it("answers sign-in with the two-factor challenge, and a TOTP code completes it", async () => {
    const { body, userId } = await adminWithTwoFactor();

    const { agent, response } = await startSignIn(body.email);

    expect(response.body).toMatchObject({
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"]
    });
    // No session yet: the challenge cookie is all the agent holds.
    const before = await agent.get("/api/auth/get-session").expect(200);
    expect(before.body).toBeNull();

    await agent
      .post("/api/auth/two-factor/verify-totp")
      .set("Origin", webOrigin)
      .send({ code: await currentTotpCode(userId) })
      .expect(200);

    const after = await agent.get("/api/auth/get-session").expect(200);
    expect(after.body.user.email).toBe(body.email);
  });

  it("rejects a wrong TOTP code and leaves the Device signed out", async () => {
    const { body, userId } = await adminWithTwoFactor();
    const { agent } = await startSignIn(body.email);
    const right = await currentTotpCode(userId);
    const wrong = right === "000000" ? "111111" : "000000";

    await agent
      .post("/api/auth/two-factor/verify-totp")
      .set("Origin", webOrigin)
      .send({ code: wrong })
      .expect(401);

    const after = await agent.get("/api/auth/get-session").expect(200);
    expect(after.body).toBeNull();
  });

  it("accepts a backup code in place of a TOTP code, once", async () => {
    const { body, backupCodes } = await adminWithTwoFactor();
    const { agent } = await startSignIn(body.email);

    await agent
      .post("/api/auth/two-factor/verify-backup-code")
      .set("Origin", webOrigin)
      .send({ code: backupCodes[0] })
      .expect(200);

    const after = await agent.get("/api/auth/get-session").expect(200);
    expect(after.body.user.email).toBe(body.email);

    // A used backup code is spent.
    const second = await startSignIn(body.email);
    await second.agent
      .post("/api/auth/two-factor/verify-backup-code")
      .set("Origin", webOrigin)
      .send({ code: backupCodes[0] })
      .expect(401);
  });

  it("does not challenge an Account that has not turned two-factor on", async () => {
    const { body } = await signedInStudent();

    const { response } = await startSignIn(body.email);

    expect(response.body.twoFactorRedirect).toBeUndefined();
    expect(response.body.user.email).toBe(body.email);
  });

  it("removes the two-factor row with the Account", async () => {
    const { userId } = await adminWithTwoFactor();
    expect(await twoFactorRowCount(userId)).toBe(1);

    await db.delete(user).where(eq(user.id, userId));

    expect(await twoFactorRowCount(userId)).toBe(0);
  });
});

describe("Better Auth /admin/* endpoints", () => {
  beforeEach(resetAccounts);

  it("refuses an Admin without two-factor with ADMIN_TWO_FACTOR_REQUIRED", async () => {
    const { agent, body } = await signedInStudent();
    await promoteToAdmin(body.email);

    const response = await agent.get("/api/auth/admin/list-users").expect(403);

    expect(response.body.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it("allows an Admin with two-factor", async () => {
    const { agent } = await adminWithTwoFactor();

    const response = await agent.get("/api/auth/admin/list-users").expect(200);

    expect(response.body.users.length).toBeGreaterThanOrEqual(1);
  });

  it("answers 401 to a caller without a session, leaving that to the plugin", async () => {
    await request(app).get("/api/auth/admin/list-users").expect(401);
  });

  it("refuses an Account without two-factor even if it lacks the permission", async () => {
    const { agent } = await signedInStudent();

    const response = await agent.get("/api/auth/admin/list-users").expect(403);

    expect(response.body.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it("keeps /two-factor/* reachable for an Admin who has not turned two-factor on", async () => {
    const { agent, body } = await signedInStudent();
    await promoteToAdmin(body.email);

    await agent
      .post("/api/auth/two-factor/enable")
      .set("Origin", webOrigin)
      .send({ password })
      .expect(200);
  });
});

describe("fresh session for risky Admin actions", () => {
  beforeEach(resetAccounts);

  async function ageSessions(userId: string, minutes: number) {
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - minutes * 60 * 1000) })
      .where(eq(session.userId, userId));
  }

  async function targetStudent() {
    const body = signUpBody();
    const response = await signUp(body).expect(200);

    return response.body.user.id as string;
  }

  it("lets /admin/set-role through on a session created minutes ago", async () => {
    const { agent } = await adminWithTwoFactor();
    const targetId = await targetStudent();

    await agent
      .post("/api/auth/admin/set-role")
      .set("Origin", webOrigin)
      .send({ userId: targetId, role: "admin" })
      .expect(200);
  });

  it("rejects /admin/set-role on a session older than 10 minutes", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const targetId = await targetStudent();
    await ageSessions(userId, 11);

    const response = await agent
      .post("/api/auth/admin/set-role")
      .set("Origin", webOrigin)
      .send({ userId: targetId, role: "admin" })
      .expect(403);

    expect(response.body.code).toBe("FRESH_SESSION_REQUIRED");
  });

  it("rejects /admin/remove-user on a session older than 10 minutes", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    const targetId = await targetStudent();
    await ageSessions(userId, 11);

    const response = await agent
      .post("/api/auth/admin/remove-user")
      .set("Origin", webOrigin)
      .send({ userId: targetId })
      .expect(403);

    expect(response.body.code).toBe("FRESH_SESSION_REQUIRED");
    expect(await db.query.user.findFirst({ where: { id: targetId } })).toBeDefined();
  });

  it("does not ask for a fresh session on other /admin/* endpoints", async () => {
    const { agent, userId } = await adminWithTwoFactor();
    await ageSessions(userId, 11);

    await agent.get("/api/auth/admin/list-users").expect(200);
  });

  it("does not change Students' own session freshness rules", async () => {
    // Better Auth's global freshAge (one day) still governs Students' account routes.
    const { agent, body } = await signedInStudent();
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(
        eq(
          session.userId,
          (await db.query.user.findFirst({ where: { email: body.email } }))!.id
        )
      );

    const response = await agent.get("/api/auth/list-sessions").expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
