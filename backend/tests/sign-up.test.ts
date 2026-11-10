import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { plan, planAssignment, user } from "../src/db/schema/index.js";
import { resetAccounts, signUp, signUpBody } from "./support/accounts.js";

describe("POST /api/auth/sign-up/email", () => {
  beforeEach(resetAccounts);

  it("creates a current Free Plan assignment anchored at the Account's creation", async () => {
    const response = await signUp(signUpBody()).expect(200);
    const assignments = await db
      .select({
        planId: planAssignment.planId,
        startsAt: planAssignment.startsAt,
        endsAt: planAssignment.endsAt,
        source: planAssignment.source
      })
      .from(planAssignment)
      .where(eq(planAssignment.userId, response.body.user.id));

    expect(assignments).toEqual([
      {
        planId: "free",
        startsAt: new Date(response.body.user.createdAt),
        endsAt: null,
        source: "default"
      }
    ]);
  });

  it("erases Plan assignments when their Account is deleted and preserves the Plan", async () => {
    const response = await signUp(signUpBody()).expect(200);
    await db.delete(user).where(eq(user.id, response.body.user.id));

    expect(await db.select().from(planAssignment)).toEqual([]);
    expect(await db.select().from(plan).where(eq(plan.id, "free"))).toHaveLength(1);
  });

  it("creates an Account with phone number, institution and major", async () => {
    const body = signUpBody({
      phoneNumber: "+966512345678",
      institutionId: "kau",
      majorId: "kau-ee"
    });

    const response = await signUp(body).expect(200);

    expect(response.body.user).toMatchObject({
      name: "Sara",
      phoneNumber: "+966512345678",
      phoneNumberVerified: false,
      institutionId: "kau",
      majorId: "kau-ee"
    });
  });

  it("rejects an email another Account uses as USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", async () => {
    const body = signUpBody({ phoneNumber: "+966512345678" });
    await signUp(body).expect(200);

    const response = await signUp(
      signUpBody({ email: body.email, phoneNumber: "+966512345679" })
    ).expect(422);

    expect(response.body.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
  });

  it("rejects an existing email with different letter case as USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", async () => {
    const body = signUpBody({ phoneNumber: "+966512345678" });
    await signUp(body).expect(200);

    const response = await signUp(
      signUpBody({ email: body.email.toUpperCase(), phoneNumber: "+966512345679" })
    ).expect(422);

    expect(response.body.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
  });

  it.each(["0512345678", "+966 51 234 5678", "+966412345678", "+9665123456789"])(
    "rejects %s as INVALID_PHONE_NUMBER",
    async (phoneNumber) => {
      const response = await signUp(signUpBody({ phoneNumber })).expect(400);

      expect(response.body.code).toBe("INVALID_PHONE_NUMBER");
    }
  );

  it("rejects an unknown institution as INVALID_INSTITUTION", async () => {
    const response = await signUp(
      signUpBody({ institutionId: "nope", majorId: "ksu-cs" })
    ).expect(400);

    expect(response.body.code).toBe("INVALID_INSTITUTION");
  });

  it("rejects a major from another institution as INVALID_MAJOR", async () => {
    const response = await signUp(
      signUpBody({ institutionId: "ksu", majorId: "kau-cs" })
    ).expect(400);

    expect(response.body.code).toBe("INVALID_MAJOR");
  });

  it("rejects an unknown major as INVALID_MAJOR", async () => {
    const response = await signUp(signUpBody({ majorId: "ksu-astrology" })).expect(400);

    expect(response.body.code).toBe("INVALID_MAJOR");
  });

  it("rejects a phone number another Account uses as PHONE_NUMBER_TAKEN", async () => {
    await signUp(signUpBody({ phoneNumber: "+966512345678" })).expect(200);

    const response = await signUp(signUpBody({ phoneNumber: "+966512345678" })).expect(
      400
    );

    expect(response.body.code).toBe("PHONE_NUMBER_TAKEN");
  });

  it("does not let the client mark the phone number verified", async () => {
    const response = await signUp(signUpBody({ phoneNumberVerified: true }));

    expect(response.body.user?.phoneNumberVerified ?? false).toBe(false);
  });
});
