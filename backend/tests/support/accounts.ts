import { sql } from "drizzle-orm";
import request from "supertest";

import app from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { db } from "../../src/db/index.js";

// The web proxies /api/auth/* from its own origin, so every auth call carries it.
export const webOrigin = env.CORS_ORIGIN;

export const password = "correct horse battery";

let sequence = 0;

export function signUpBody(overrides: Record<string, unknown> = {}) {
  sequence += 1;

  return {
    name: "Sara",
    email: `student${sequence}@example.com`,
    password,
    phoneNumber: `+96650${String(sequence).padStart(7, "0")}`,
    institutionId: "ksu",
    majorId: "ksu-cs",
    ...overrides
  };
}

export function signUp(body: Record<string, unknown>) {
  return request(app).post("/api/auth/sign-up/email").set("Origin", webOrigin).send(body);
}

// Signs up and signs in. Returns an agent holding the session cookie, and the
// cookie header itself for requests outside the app.
export async function signedInStudent(overrides: Record<string, unknown> = {}) {
  const body = signUpBody(overrides);

  await signUp(body).expect(200);

  const agent = request.agent(app);

  const signIn = await agent
    .post("/api/auth/sign-in/email")
    .set("Origin", webOrigin)
    .send({ email: body.email, password })
    .expect(200);

  const cookie = ([] as string[])
    .concat(signIn.headers["set-cookie"] ?? [])
    .map((header) => header.split(";")[0])
    .join("; ");

  return { agent, body, cookie };
}

export async function resetAccounts(): Promise<void> {
  if (!new URL(env.DATABASE_URL).pathname.endsWith("_test")) {
    throw new Error("Refusing to truncate a non-test database");
  }

  await db.execute(
    sql`truncate "admin_audit_log", "livekit_webhook_event", "study_session_presence", "study_session", "plan_assignment", "enrollment", "user", "session", "account", "verification", "rate_limit" cascade`
  );
}
