import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  password,
  resetAccounts,
  signUp,
  signUpBody,
  webOrigin
} from "./support/accounts.js";

// Email delivery is fire-and-forget and logged in tests; capture the links instead.
const emails = vi.hoisted(() => ({
  verify: [] as string[],
  reset: [] as string[]
}));

vi.mock("../src/services/email/email.service.js", () => ({
  sendVerifyEmail: (_recipient: unknown, url: string) => emails.verify.push(url),
  sendResetPasswordEmail: (_recipient: unknown, url: string) => emails.reset.push(url),
  sendChangeEmailVerification: () => undefined
}));

const adminOrigin = env.ADMIN_ORIGIN;
const unknownOrigin = "https://evil.example";

// What the Next.js rewrite proxy sends: its own backend host in `Host`, the browser's in
// `x-forwarded-host`. Supertest already sets `Host` to the test server.
function viaHost(origin: string) {
  return { Origin: origin, "X-Forwarded-Host": new URL(origin).host };
}

describe("admin origin", () => {
  beforeEach(async () => {
    emails.verify.length = 0;
    emails.reset.length = 0;
    await resetAccounts();
  });

  describe("auth origin check", () => {
    it("accepts an auth POST from the admin origin", async () => {
      await request(app)
        .post("/api/auth/sign-up/email")
        .set(viaHost(adminOrigin))
        .send(signUpBody())
        .expect(200);
    });

    it("accepts an auth POST from the web origin", async () => {
      await request(app)
        .post("/api/auth/sign-up/email")
        .set(viaHost(webOrigin))
        .send(signUpBody())
        .expect(200);
    });

    // Better Auth checks Origin on requests that carry cookies (the CSRF case); a cookie-less POST
    // cannot ride on a victim's session, so it passes. Browsers send the cookie, so tests do too.
    const cookie = "better-auth.session_token=stale";

    it("accepts a cookie-bearing auth POST from the admin origin", async () => {
      await request(app)
        .post("/api/auth/sign-up/email")
        .set({ ...viaHost(adminOrigin), Cookie: cookie })
        .send(signUpBody())
        .expect(200);
    });

    it("rejects a cookie-bearing auth POST from an unknown origin", async () => {
      const response = await request(app)
        .post("/api/auth/sign-up/email")
        .set({ Origin: unknownOrigin, Cookie: cookie })
        .send(signUpBody())
        .expect(403);

      expect(response.body.code).toBe("INVALID_ORIGIN");
    });

    it("rejects an unknown origin even when it claims an allowed host", async () => {
      await request(app)
        .post("/api/auth/sign-up/email")
        .set({
          Origin: unknownOrigin,
          Cookie: cookie,
          "X-Forwarded-Host": new URL(adminOrigin).host
        })
        .send(signUpBody())
        .expect(403);
    });

    it("rejects a redirect target outside the trusted origins", async () => {
      const body = signUpBody();
      await signUp(body).expect(200);

      await request(app)
        .post("/api/auth/request-password-reset")
        .set(viaHost(adminOrigin))
        .send({ email: body.email, redirectTo: `${unknownOrigin}/reset` })
        .expect(403);
    });
  });

  describe("CORS", () => {
    function preflight(origin: string) {
      return request(app)
        .options("/api/v1/me/allowance")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "GET");
    }

    it("allows a preflight from the admin origin, with credentials", async () => {
      const response = await preflight(adminOrigin).expect(204);

      expect(response.headers["access-control-allow-origin"]).toBe(adminOrigin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("allows a preflight from the web origin, with credentials", async () => {
      const response = await preflight(webOrigin).expect(204);

      expect(response.headers["access-control-allow-origin"]).toBe(webOrigin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not allow a preflight from an unknown origin", async () => {
      const response = await preflight(unknownOrigin);

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("answers a simple request with only the requesting allowed origin", async () => {
      const response = await request(app)
        .get("/api/v1/health")
        .set("Origin", unknownOrigin);

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("email links", () => {
    async function requestReset(headers: Record<string, string>) {
      const body = signUpBody();
      await signUp(body).expect(200);
      emails.verify.length = 0;

      await request(app)
        .post("/api/auth/request-password-reset")
        .set(headers)
        .send({ email: body.email })
        .expect(200);

      await vi.waitFor(() => expect(emails.reset).toHaveLength(1));

      return new URL(emails.reset[0]);
    }

    it("links a password reset requested through the admin host to the admin origin", async () => {
      const link = await requestReset(viaHost(adminOrigin));

      expect(link.origin).toBe(adminOrigin);
      expect(link.pathname).toMatch(/^\/api\/auth\/reset-password\//);
    });

    it("links a password reset requested through the web host to the web origin", async () => {
      const link = await requestReset(viaHost(webOrigin));

      expect(link.origin).toBe(new URL(webOrigin).origin);
    });

    it("links a request that carries no forwarded host to the web origin", async () => {
      const link = await requestReset({ Origin: webOrigin });

      expect(link.origin).toBe(new URL(webOrigin).origin);
    });

    it("ignores a forwarded host outside the allowed hosts", async () => {
      const link = await requestReset({
        Origin: webOrigin,
        "X-Forwarded-Host": "evil.example"
      });

      expect(link.origin).toBe(new URL(webOrigin).origin);
    });

    it("links a verification email sent at sign-up to the app the request came from", async () => {
      await request(app)
        .post("/api/auth/sign-up/email")
        .set(viaHost(adminOrigin))
        .send(signUpBody())
        .expect(200);

      await vi.waitFor(() => expect(emails.verify).toHaveLength(1));
      expect(new URL(emails.verify[0]).origin).toBe(adminOrigin);

      emails.verify.length = 0;

      await request(app)
        .post("/api/auth/sign-up/email")
        .set(viaHost(webOrigin))
        .send(signUpBody())
        .expect(200);

      await vi.waitFor(() => expect(emails.verify).toHaveLength(1));
      expect(new URL(emails.verify[0]).origin).toBe(new URL(webOrigin).origin);
    });
  });

  it("signs in from the admin origin", async () => {
    const body = signUpBody();
    await signUp(body).expect(200);

    await request(app)
      .post("/api/auth/sign-in/email")
      .set(viaHost(adminOrigin))
      .send({ email: body.email, password })
      .expect(403); // Unverified: reached the handler, past the origin check.
  });
});
