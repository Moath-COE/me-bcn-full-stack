import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import { session, user } from "../src/db/schema/index.js";
import { appendErrorParam } from "../src/utils/callback-url.js";
import { resetAccounts, signUp, signUpBody, webOrigin } from "./support/accounts.js";

// Email delivery is fire-and-forget and logged in tests; capture the links instead.
const emails = vi.hoisted(() => ({ verify: [] as string[] }));

vi.mock("../src/services/email/email.service.js", () => ({
  sendVerifyEmail: (_recipient: unknown, url: string) => emails.verify.push(url),
  sendResetPasswordEmail: () => undefined,
  sendChangeEmailVerification: () => undefined
}));

// Signs up an unverified Account, optionally bans it, and returns its verification link with the
// given callback URL (the sign-up link carries the one the request passed).
async function unverifiedAccount(options: { banned: boolean; callbackURL?: string }) {
  emails.verify.length = 0;
  const body = signUpBody();
  await signUp({
    ...body,
    callbackURL: options.callbackURL ?? `${webOrigin}/verify-email`
  }).expect(200);
  await vi.waitFor(() => expect(emails.verify).toHaveLength(1));

  if (options.banned) {
    await db.update(user).set({ banned: true }).where(eq(user.email, body.email));
  }

  const link = new URL(emails.verify[0]);
  return { body, link };
}

function openLink(link: URL, callbackURL?: string) {
  const url = new URL(link);
  if (callbackURL === undefined) {
    url.searchParams.delete("callbackURL");
  } else {
    url.searchParams.set("callbackURL", callbackURL);
  }

  return request(app).get(`${url.pathname}${url.search}`).set("Origin", webOrigin);
}

async function accountState(email: string) {
  const [account] = await db.select().from(user).where(eq(user.email, email));
  const sessions = await db.select().from(session).where(eq(session.userId, account.id));
  return { account, sessions };
}

describe("email verification of a banned Account", () => {
  beforeEach(async () => {
    await resetAccounts();
  });

  it("redirects to the trusted callback URL with error=BANNED_USER and sets no session", async () => {
    const { body, link } = await unverifiedAccount({ banned: true });

    const response = await openLink(link, `${webOrigin}/verify-email`).expect(302);

    expect(response.headers.location).toBe(`${webOrigin}/verify-email?error=BANNED_USER`);
    expect(response.headers["set-cookie"]).toBeUndefined();

    const { account, sessions } = await accountState(body.email);
    expect(sessions).toHaveLength(0);
    expect(account.banned).toBe(true);
    // Better Auth marks the email verified before it tries to sign in; the link did prove it.
    expect(account.emailVerified).toBe(true);
  });

  it("keeps the callback URL's existing query", async () => {
    const { link } = await unverifiedAccount({ banned: true });

    const response = await openLink(
      link,
      `${env.ADMIN_ORIGIN}/login?next=%2Fusers`
    ).expect(302);

    const location = new URL(response.headers.location);
    expect(location.origin).toBe(env.ADMIN_ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/users");
    expect(location.searchParams.get("error")).toBe("BANNED_USER");
  });

  it("does not redirect to an untrusted callback URL", async () => {
    const { body, link } = await unverifiedAccount({ banned: true });

    const response = await openLink(link, "https://evil.example/verify-email");

    expect(response.status).toBe(403);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await accountState(body.email)).sessions).toHaveLength(0);
  });

  it("keeps Better Auth's error when there is no callback URL", async () => {
    const { body, link } = await unverifiedAccount({ banned: true });

    const response = await openLink(link);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("BANNED_USER");
    expect(response.headers.location).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await accountState(body.email)).sessions).toHaveLength(0);
  });
});

describe("email verification of an Account that is not banned", () => {
  beforeEach(async () => {
    await resetAccounts();
  });

  it("verifies, signs in and redirects to the callback URL without an error", async () => {
    const { body, link } = await unverifiedAccount({ banned: false });

    const response = await openLink(link, `${webOrigin}/verify-email`).expect(302);

    expect(response.headers.location).toBe(`${webOrigin}/verify-email`);
    expect(response.headers["set-cookie"]?.join(";")).toContain("session_token");

    const { account, sessions } = await accountState(body.email);
    expect(account.emailVerified).toBe(true);
    expect(sessions).toHaveLength(1);
  });
});

describe("appendErrorParam", () => {
  it("adds the error to an absolute URL and keeps its query and hash", () => {
    expect(appendErrorParam("https://app.example/path?a=1#top", "X")).toBe(
      "https://app.example/path?a=1&error=X#top"
    );
  });

  it("keeps a relative path relative", () => {
    expect(appendErrorParam("/verify-email?a=1", "X")).toBe("/verify-email?a=1&error=X");
  });
});
