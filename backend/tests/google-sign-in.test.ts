import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../src/db/index.js";
import { account, planAssignment, session, user } from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { resetAccounts, signUp, signUpBody } from "./support/accounts.js";
import {
  callbackURL,
  errorCallbackURL,
  googleProfile,
  newUserCallbackURL,
  signInWithGoogle
} from "./support/google.js";

// Email delivery is fire-and-forget and logged in tests; capture the links instead.
const emails = vi.hoisted(() => ({ verify: [] as string[] }));

vi.mock("../src/services/email/email.service.js", () => ({
  sendVerifyEmail: (_recipient: unknown, url: string) => emails.verify.push(url),
  sendResetPasswordEmail: () => undefined,
  sendChangeEmailVerification: () => undefined
}));

const joinData = {
  phoneNumber: "+966512345678",
  institutionId: "ksu",
  majorId: "ksu-cs"
};

function joinWithGoogle(
  profile = googleProfile(),
  signUpData: Record<string, unknown> = joinData
) {
  return signInWithGoogle({ profile, signUpData, requestSignUp: true });
}

async function accountsWithEmail(email: string) {
  return db.select().from(user).where(eq(user.email, email));
}

// A Student who signed up with a password and confirmed the address.
async function emailStudent(overrides: Record<string, unknown> = {}) {
  const body = signUpBody(overrides);
  const response = await signUp(body).expect(200);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, body.email));

  return { body, id: response.body.user.id as string };
}

describe("Google sign-in", () => {
  beforeEach(async () => {
    emails.verify.length = 0;
    await resetAccounts();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("sign-up from the join page", () => {
    it("creates an Account from Google's profile and the join page's fields", async () => {
      const profile = googleProfile({ name: "Noura Ahmad" });

      const result = await joinWithGoogle(profile);

      expect(result.location?.href).toBe(newUserCallbackURL);
      expect(result.hasSessionCookie).toBe(true);

      const [created] = await accountsWithEmail(profile.email);
      expect(created).toMatchObject({
        name: "Noura Ahmad",
        emailVerified: true,
        role: "user",
        ...joinData
      });
      expect(
        await db.select().from(account).where(eq(account.userId, created.id))
      ).toMatchObject([{ providerId: "google", accountId: profile.sub }]);
    });

    it("assigns the Free Plan", async () => {
      const profile = googleProfile();
      await joinWithGoogle(profile);

      const [created] = await accountsWithEmail(profile.email);
      const assignments = await db
        .select({ planId: planAssignment.planId, endsAt: planAssignment.endsAt })
        .from(planAssignment)
        .where(eq(planAssignment.userId, created.id));

      expect(assignments).toEqual([{ planId: "free", endsAt: null }]);
    });

    it("stores nothing from additionalData but the three Account fields", async () => {
      const profile = googleProfile();

      await joinWithGoogle(profile, {
        ...joinData,
        role: "admin",
        email: "someone-else@example.com",
        emailVerified: false,
        banned: true
      });

      expect(await accountsWithEmail("someone-else@example.com")).toEqual([]);
      expect(await accountsWithEmail(profile.email)).toMatchObject([
        { role: "user", emailVerified: true, banned: false }
      ]);
    });

    it.each([
      ["no additionalData", undefined, "INVALID_PHONE_NUMBER"],
      ["an empty additionalData", {}, "INVALID_PHONE_NUMBER"],
      [
        "a phone number that is not a Saudi mobile",
        { ...joinData, phoneNumber: "0512345678" },
        "INVALID_PHONE_NUMBER"
      ],
      [
        "a phone number that is not a string",
        { ...joinData, phoneNumber: 966512345678 },
        "INVALID_PHONE_NUMBER"
      ],
      [
        "an unknown institution",
        { ...joinData, institutionId: "nope" },
        "INVALID_INSTITUTION"
      ],
      [
        "an institution that is not a string",
        { ...joinData, institutionId: { id: "ksu" } },
        "INVALID_INSTITUTION"
      ],
      [
        "a major from another institution",
        { ...joinData, majorId: "kau-cs" },
        "INVALID_MAJOR"
      ],
      ["no major", { ...joinData, majorId: undefined }, "INVALID_MAJOR"]
    ])("refuses %s as %s", async (_label, signUpData, code) => {
      const profile = googleProfile();

      const result = await signInWithGoogle({
        profile,
        signUpData: signUpData as Record<string, unknown> | undefined,
        requestSignUp: true
      });

      expect(result.location?.origin + result.location?.pathname).toBe(errorCallbackURL);
      expect(result.error).toBe(code);
      expect(result.hasSessionCookie).toBe(false);
      expect(await accountsWithEmail(profile.email)).toEqual([]);
    });

    it("refuses a phone number another Account uses as PHONE_NUMBER_TAKEN", async () => {
      await emailStudent({ phoneNumber: joinData.phoneNumber });
      const profile = googleProfile();

      const result = await joinWithGoogle(profile);

      expect(result.error).toBe("PHONE_NUMBER_TAKEN");
      expect(await accountsWithEmail(profile.email)).toEqual([]);
    });

    it("creates the Account but no session when Google's address is unverified, and mails the link", async () => {
      const profile = googleProfile({ email_verified: false });

      const result = await joinWithGoogle(profile);

      expect(result.error).toBe("email_not_verified");
      expect(result.hasSessionCookie).toBe(false);
      expect(await accountsWithEmail(profile.email)).toMatchObject([
        { emailVerified: false }
      ]);
      expect(await db.select().from(session)).toEqual([]);
      await vi.waitFor(() => expect(emails.verify).toHaveLength(1));
      expect(new URL(emails.verify[0]).pathname).toBe("/api/auth/verify-email");
    });
  });

  describe("sign-in from the sign-in page", () => {
    it("does not create an Account: signup_disabled", async () => {
      const profile = googleProfile();

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("signup_disabled");
      expect(result.hasSessionCookie).toBe(false);
      expect(await accountsWithEmail(profile.email)).toEqual([]);
    });

    it("signs a returning Google Account in and sends it to the callback URL", async () => {
      const profile = googleProfile();
      await joinWithGoogle(profile);

      const result = await signInWithGoogle({ profile });

      expect(result.location?.href).toBe(callbackURL);
      expect(result.hasSessionCookie).toBe(true);
      expect(await accountsWithEmail(profile.email)).toHaveLength(1);
    });
  });

  describe("an email that already has an Account", () => {
    it("links Google to it and signs in", async () => {
      const student = await emailStudent();
      const profile = googleProfile({ email: student.body.email, name: "Other Name" });

      const result = await signInWithGoogle({ profile });

      expect(result.location?.href).toBe(callbackURL);
      expect(result.hasSessionCookie).toBe(true);
      expect(await accountsWithEmail(student.body.email)).toMatchObject([
        { id: student.id, name: student.body.name }
      ]);
      expect(
        await db.select().from(account).where(eq(account.userId, student.id))
      ).toMatchObject(
        expect.arrayContaining([
          expect.objectContaining({ providerId: "google", accountId: profile.sub }),
          expect.objectContaining({ providerId: "credential" })
        ])
      );
    });

    it("links from the join page too, ignoring its fields", async () => {
      const student = await emailStudent();
      const profile = googleProfile({ email: student.body.email });

      const result = await joinWithGoogle(profile, { ...joinData, phoneNumber: "bad" });

      expect(result.location?.href).toBe(callbackURL);
      expect(await accountsWithEmail(student.body.email)).toMatchObject([
        { id: student.id, phoneNumber: student.body.phoneNumber }
      ]);
    });

    it("does not link when Google reports the address as unverified", async () => {
      const student = await emailStudent();
      const profile = googleProfile({ email: student.body.email, email_verified: false });

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("account_not_linked");
      expect(result.hasSessionCookie).toBe(false);
      expect(
        await db.select().from(account).where(eq(account.userId, student.id))
      ).toMatchObject([{ providerId: "credential" }]);
    });

    it("does not link to an Account whose own address is unverified", async () => {
      const body = signUpBody();
      const response = await signUp(body).expect(200);
      const profile = googleProfile({ email: body.email });

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("account_not_linked");
      expect(
        await db.select().from(account).where(eq(account.userId, response.body.user.id))
      ).toMatchObject([{ providerId: "credential" }]);
    });
  });

  describe("Banned Accounts", () => {
    it("are refused as BANNED_USER and get no session", async () => {
      const profile = googleProfile();
      await joinWithGoogle(profile);
      await db.update(user).set({ banned: true }).where(eq(user.email, profile.email));
      await db.delete(session);

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("BANNED_USER");
      expect(result.hasSessionCookie).toBe(false);
      expect(await db.select().from(session)).toEqual([]);
    });
  });

  describe("Admins", () => {
    it("cannot link Google to their Account", async () => {
      const admin = await emailStudent();
      await promoteToAdmin(admin.body.email);
      const profile = googleProfile({ email: admin.body.email });

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("ADMIN_GOOGLE_FORBIDDEN");
      expect(result.hasSessionCookie).toBe(false);
      expect(
        await db.select().from(account).where(eq(account.userId, admin.id))
      ).toMatchObject([{ providerId: "credential" }]);
      expect(await db.select().from(session)).toEqual([]);
    });

    it("cannot sign in with a Google account that was linked before the promotion", async () => {
      const profile = googleProfile();
      await joinWithGoogle(profile);
      const [student] = await accountsWithEmail(profile.email);
      await promoteToAdmin(profile.email);
      await db.delete(session);

      const result = await signInWithGoogle({ profile });

      expect(result.error).toBe("ADMIN_GOOGLE_FORBIDDEN");
      expect(result.hasSessionCookie).toBe(false);
      expect(await db.select().from(session)).toEqual([]);
      expect(student.role).toBe("user");
    });
  });
});
