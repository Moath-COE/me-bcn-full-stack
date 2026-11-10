import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { requireSession } from "../src/middlewares/require-session.middleware.js";
import { resetAccounts, signedInStudent, webOrigin } from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

// No app route uses requireSession yet, so mount it on a probe route.
const probe = express()
  .get("/probe", requireSession, (_req, res) => {
    res.json({ email: res.locals.session?.user.email });
  })
  .use(errorHandler);

describe("requireSession", () => {
  beforeEach(resetAccounts);

  it("responds 401 UNAUTHENTICATED without a session cookie", async () => {
    const response = await request(probe).get("/probe").expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("exposes the signed-in Account's session to the route", async () => {
    const { body, cookie } = await signedInStudent();

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(200);

    expect(response.body.email).toBe(body.email);
  });

  describe("after an Admin ends the Student's sessions", () => {
    // The Student's Device, with the session_data cache cookie Better Auth sets on sign-in.
    async function studentWithCachedSession() {
      const student = await signedInStudent();
      expect(student.cookie).toContain("session_data=");

      // Both gates still let the cached session through before the Admin acts.
      await request(app)
        .get("/api/v1/me/allowance")
        .set("Cookie", student.cookie)
        .expect(200);
      await request(probe).get("/probe").set("Cookie", student.cookie).expect(200);

      const studentId = (await db.query.user.findFirst({
        where: { email: student.body.email }
      }))!.id;

      return { ...student, studentId };
    }

    async function expectUnauthenticated(cookie: string) {
      const allowance = await request(app)
        .get("/api/v1/me/allowance")
        .set("Cookie", cookie)
        .expect(401);
      expect(allowance.body.error.code).toBe("UNAUTHENTICATED");

      const response = await request(probe)
        .get("/probe")
        .set("Cookie", cookie)
        .expect(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    }

    it("responds 401 on the next request once the Admin revokes the Student's sessions", async () => {
      const { agent } = await adminWithTwoFactor();
      const { cookie, studentId } = await studentWithCachedSession();

      await agent
        .post("/api/auth/admin/revoke-user-sessions")
        .set("Origin", webOrigin)
        .send({ userId: studentId })
        .expect(200);

      await expectUnauthenticated(cookie);
    });

    it("responds 401 on the next request once the Admin bans the Student", async () => {
      const { agent } = await adminWithTwoFactor();
      const { cookie, studentId } = await studentWithCachedSession();

      await agent
        .post("/api/auth/admin/ban-user")
        .set("Origin", webOrigin)
        .send({ userId: studentId })
        .expect(200);

      await expectUnauthenticated(cookie);
    });
  });
});
