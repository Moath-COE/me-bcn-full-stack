import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { resetAccounts, signedInStudent, webOrigin } from "./support/accounts.js";

type Sent = { kind: string; to: string; url: string };

// Email delivery is fire-and-forget and logged in tests; capture what would be sent instead.
const emails = vi.hoisted(() => ({ sent: [] as Sent[] }));

vi.mock("../src/services/email/email.service.js", () => ({
  sendResetPasswordEmail: (recipient: { email: string }, url: string) =>
    emails.sent.push({ kind: "reset", to: recipient.email, url }),
  sendChangeEmailVerification: (recipient: { email: string }, url: string) =>
    emails.sent.push({ kind: "change", to: recipient.email, url })
}));

describe("POST /api/auth/change-email", () => {
  beforeEach(async () => {
    emails.sent.length = 0;
    await resetAccounts();
  });

  it("sends a confirmation link to the new address and changes the email once it is opened", async () => {
    const { agent, body } = await signedInStudent();

    await agent
      .post("/api/auth/change-email")
      .set("Origin", webOrigin)
      .send({ newEmail: "New.Address@Example.com", callbackURL: "/account" })
      .expect(200);

    await vi.waitFor(() => expect(emails.sent).toHaveLength(1));
    const [sent] = emails.sent;
    expect(sent).toMatchObject({ kind: "change", to: "new.address@example.com" });

    // Nothing changes until the link is opened.
    expect((await db.query.user.findFirst({ where: { email: body.email } }))?.email).toBe(
      body.email
    );

    const link = new URL(sent!.url);
    await request(app).get(`${link.pathname}${link.search}`).expect(302);

    expect(
      await db.query.user.findFirst({ where: { email: "new.address@example.com" } })
    ).toBeDefined();
  });
});
