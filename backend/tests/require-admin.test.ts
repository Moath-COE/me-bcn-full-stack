import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/index.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { requireAdmin } from "../src/middlewares/require-admin.middleware.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

// No production route uses the Admin gate yet, so mount it on a probe route.
const probe = express()
  .get("/probe", requireAdmin({ course: ["update"] }), (_req, res) => {
    res.json({ email: res.locals.session?.user.email });
  })
  .use(errorHandler);

describe("requireAdmin", () => {
  beforeEach(resetAccounts);

  it("responds 401 UNAUTHENTICATED without a session cookie", async () => {
    const response = await request(probe).get("/probe").expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("refuses a Student with ADMIN_PERMISSION_REQUIRED", async () => {
    const { cookie } = await signedInStudent();

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  it("refuses an Admin without two-factor with ADMIN_TWO_FACTOR_REQUIRED", async () => {
    const { body, cookie } = await signedInStudent();
    await promoteToAdmin(body.email);

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });

  it("lets an Admin with two-factor through and exposes the session", async () => {
    const { body, cookie } = await adminWithTwoFactor();

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(200);

    expect(response.body.email).toBe(body.email);
  });

  it("refuses a demoted Admin on the very next request, despite a cookie-cached session", async () => {
    const { body, cookie } = await adminWithTwoFactor();
    await request(probe).get("/probe").set("Cookie", cookie).expect(200);

    await db.update(user).set({ role: "user" }).where(eq(user.email, body.email));

    // The cookie cache still says Admin: this is the stale read the gate must not trust.
    const cached = await request(app)
      .get("/api/auth/get-session")
      .set("Cookie", cookie)
      .expect(200);
    expect(cached.body.user.role).toBe("admin");

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  it("refuses an Admin whose two-factor was turned off after sign-in", async () => {
    const { body, cookie } = await adminWithTwoFactor();

    await db
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.email, body.email));

    const response = await request(probe).get("/probe").set("Cookie", cookie).expect(403);

    expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
  });
});
