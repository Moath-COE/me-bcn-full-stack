import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import { adminAuditLog } from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import {
  resetAccounts,
  signedInStudent,
  signUp,
  signUpBody,
  webOrigin
} from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

type Sent = { kind: string; to: string; url: string };

// Email delivery is fire-and-forget and logged in tests; capture what would be sent instead.
const emails = vi.hoisted(() => ({ sent: [] as Sent[] }));

vi.mock("../src/services/email/email.service.js", () => ({
  sendResetPasswordEmail: (recipient: { email: string }, url: string) =>
    emails.sent.push({ kind: "reset", to: recipient.email, url }),
  sendChangeEmailVerification: (recipient: { email: string }, url: string) =>
    emails.sent.push({ kind: "change", to: recipient.email, url })
}));

const base = "/api/v1/admin/accounts";
const adminOrigin = env.ADMIN_ORIGIN;
const web = new URL(webOrigin).origin;

// What the admin app's Next.js proxy sends: the browser's host in `x-forwarded-host`.
const viaAdminHost = {
  Origin: adminOrigin,
  "X-Forwarded-Host": new URL(adminOrigin).host
};

async function targetStudent(overrides: Record<string, unknown> = {}) {
  const body = signUpBody(overrides);
  const response = await signUp(body).expect(200);
  emails.sent.length = 0;

  return { body, id: response.body.user.id as string };
}

async function auditEntries() {
  return db.select().from(adminAuditLog).orderBy(adminAuditLog.createdAt);
}

describe("Admin Account emails: access", () => {
  beforeEach(async () => {
    emails.sent.length = 0;
    await resetAccounts();
  });

  const routes = ["password-reset"];

  it.each(routes)("POST /%s answers 401 without a session", async (route) => {
    const response = await request(app).post(`${base}/x/${route}`).expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each(routes)("POST /%s refuses a Student", async (route) => {
    const { cookie } = await signedInStudent();

    const response = await request(app)
      .post(`${base}/x/${route}`)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  it.each(routes)("POST /%s refuses an Admin without two-factor", async (route) => {
    const { body, cookie } = await signedInStudent();
    await promoteToAdmin(body.email);

    const response = await request(app)
      .post(`${base}/x/${route}`)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it.each(routes)("POST /%s answers 404 for an unknown Account", async (route) => {
    const { cookie } = await adminWithTwoFactor();
    emails.sent.length = 0;

    const response = await request(app)
      .post(`${base}/no-such-account/${route}`)
      .set("Cookie", cookie)
      .expect(404);

    expect(response.body.error.code).toBe("ACCOUNT_NOT_FOUND");
    expect(emails.sent).toEqual([]);
  });
});

describe("POST /admin/accounts/:accountId/password-reset", () => {
  beforeEach(async () => {
    emails.sent.length = 0;
    await resetAccounts();
  });

  it("sends a reset email whose link is on the web origin, even through the admin host", async () => {
    const { cookie } = await adminWithTwoFactor();
    const target = await targetStudent();

    await request(app)
      .post(`${base}/${target.id}/password-reset`)
      .set(viaAdminHost)
      .set("Cookie", cookie)
      .expect(204);

    await vi.waitFor(() => expect(emails.sent).toHaveLength(1));
    const [sent] = emails.sent;
    expect(sent!.kind).toBe("reset");
    expect(sent!.to).toBe(target.body.email);

    const link = new URL(sent!.url);
    expect(link.origin).toBe(web);
    expect(link.pathname).toMatch(/^\/api\/auth\/reset-password\//);
    // The page the Student lands on after the link is the web app's reset page.
    expect(new URL(link.searchParams.get("callbackURL")!).origin).toBe(web);
    expect(new URL(link.searchParams.get("callbackURL")!).pathname).toBe(
      "/reset-password"
    );
  });

  it("writes one Audit log entry, with no token in it", async () => {
    const { cookie, userId } = await adminWithTwoFactor();
    const target = await targetStudent();

    await request(app)
      .post(`${base}/${target.id}/password-reset`)
      .set("Cookie", cookie)
      .expect(204);

    const [entry, ...rest] = await auditEntries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: userId,
      action: "account.password-reset-sent",
      targetType: "account",
      targetId: target.id,
      after: { email: target.body.email }
    });

    const token = new URL(emails.sent[0]!.url).pathname.split("/").pop()!;
    expect(JSON.stringify(entry)).not.toContain(token);
  });
});

describe("Admin email change through /admin/update-user", () => {
  beforeEach(async () => {
    emails.sent.length = 0;
    await resetAccounts();
  });

  type AdminAgent = Awaited<ReturnType<typeof adminWithTwoFactor>>["agent"];

  function updateUser(
    agent: AdminAgent,
    userId: string,
    data: Record<string, unknown>,
    headers: Record<string, string> = { Origin: webOrigin }
  ) {
    return agent.post("/api/auth/admin/update-user").set(headers).send({ userId, data });
  }

  it("changes the address and sends nothing", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();

    await updateUser(
      agent,
      target.id,
      { email: "New.Address@Example.com" },
      viaAdminHost
    ).expect(200);

    const row = await db.query.user.findFirst({ where: { id: target.id } });
    expect(row!.email).toBe("new.address@example.com");
    expect(emails.sent).toEqual([]);
  });

  it("records the audit entry with the old and new email", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();

    await updateUser(agent, target.id, { email: "changed@example.com" }).expect(200);

    const [entry, ...rest] = await auditEntries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      action: "account.update",
      targetId: target.id,
      before: { email: target.body.email },
      after: { email: "changed@example.com" }
    });
  });

  it("changes nothing when the update is refused", async () => {
    const { agent } = await adminWithTwoFactor();
    const target = await targetStudent();
    const other = await targetStudent();

    await updateUser(agent, target.id, { email: other.body.email }).expect(400);
    await updateUser(agent, target.id, {
      email: "fresh@example.com",
      phoneNumber: "12345"
    }).expect(400);

    const row = await db.query.user.findFirst({ where: { id: target.id } });
    expect(row!.email).toBe(target.body.email);
    expect(emails.sent).toEqual([]);
    expect(await auditEntries()).toEqual([]);
  });
});
