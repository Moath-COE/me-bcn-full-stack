import { eq } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import request from "supertest";
import type { Response } from "supertest";

import app from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { twoFactor } from "../../src/db/schema/index.js";
import { auth } from "../../src/lib/auth.js";
import { promoteToAdmin } from "../../src/services/account.service.js";
import { password, signedInStudent, webOrigin } from "./accounts.js";

// The `name=value` pairs of a response's Set-Cookie headers, as a Cookie header for requests
// that don't go through a supertest agent.
export function cookieHeader(response: Response): string {
  return ([] as string[])
    .concat(response.headers["set-cookie"] ?? [])
    .map((header) => header.split(";")[0])
    .join("; ");
}

// The code an authenticator app would show now. The secret is stored encrypted, so read it back
// the way the plugin does and let Better Auth's own TOTP generator compute the code.
export async function currentTotpCode(userId: string): Promise<string> {
  const row = await db.query.twoFactor.findFirst({ where: { userId } });
  if (!row) throw new Error(`No two-factor row for ${userId}`);

  const context = await auth.$context;
  const secret = await symmetricDecrypt({ key: context.secretConfig, data: row.secret });
  const { code } = await auth.api.generateTOTP({ body: { secret } });

  return code;
}

// An Admin whose Account has TOTP turned on: enables it with the password, then verifies a code.
// Enabling signs the Device in again, so the returned cookie belongs to a fresh session.
export async function adminWithTwoFactor() {
  const { agent, body } = await signedInStudent();
  const { userId } = await promoteToAdmin(body.email);

  const enabled = await agent
    .post("/api/auth/two-factor/enable")
    .set("Origin", webOrigin)
    .send({ password })
    .expect(200);

  const verified = await agent
    .post("/api/auth/two-factor/verify-totp")
    .set("Origin", webOrigin)
    .send({ code: await currentTotpCode(userId) })
    .expect(200);

  return {
    agent,
    body,
    userId,
    cookie: cookieHeader(verified),
    totpURI: enabled.body.totpURI as string,
    backupCodes: enabled.body.backupCodes as string[]
  };
}

// Password sign-in only, on a new agent: for an Account with two-factor on, the response is the
// challenge and the agent holds the challenge cookie rather than a session.
export async function startSignIn(email: string) {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/auth/sign-in/email")
    .set("Origin", webOrigin)
    .send({ email, password })
    .expect(200);

  return { agent, response };
}

export async function twoFactorRowCount(userId: string): Promise<number> {
  return (await db.select().from(twoFactor).where(eq(twoFactor.userId, userId))).length;
}
