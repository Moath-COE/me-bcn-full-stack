import request from "supertest";
import { vi } from "vitest";

import app from "../../src/app.js";
import { webOrigin } from "./accounts.js";

export const callbackURL = `${webOrigin}/dashboard`;
export const errorCallbackURL = `${webOrigin}/sign-in`;
export const newUserCallbackURL = `${webOrigin}/welcome`;

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
};

let sequence = 0;

export function googleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  sequence += 1;

  return {
    sub: `google-sub-${sequence}`,
    email: `google${sequence}@example.com`,
    email_verified: true,
    name: "Sara Google",
    ...overrides
  };
}

// Real Google cannot be called. Better Auth exchanges the code at Google's token endpoint and then
// reads the profile from the (unverified) ID token it gets back, so answering that one request
// stands in for Google. Every other request goes through.
export function stubGoogleToken(profile: GoogleProfile): void {
  const realFetch = globalThis.fetch;
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const idToken = [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      ...profile,
      iss: "https://accounts.google.com",
      aud: "google-test-client-id",
      picture: "https://example.com/avatar.png"
    }),
    "signature"
  ].join(".");

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url === "https://oauth2.googleapis.com/token") {
      return Promise.resolve(
        Response.json({
          access_token: "google-access-token",
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile"
        })
      );
    }

    return realFetch(input, init);
  });
}

export type GoogleSignInOptions = {
  profile: GoogleProfile;
  // Sent as `additionalData` on a sign-up. Leave out for the sign-in page.
  signUpData?: Record<string, unknown>;
  requestSignUp?: boolean;
};

// Runs the whole browser flow against the app: the client call, Google's redirect back (with the
// state and cookie the first step set), and the callback's answer.
export async function signInWithGoogle(options: GoogleSignInOptions) {
  stubGoogleToken(options.profile);

  const agent = request.agent(app);
  const start = await agent
    .post("/api/auth/sign-in/social")
    .set("Origin", webOrigin)
    .send({
      provider: "google",
      callbackURL,
      errorCallbackURL,
      newUserCallbackURL,
      ...(options.requestSignUp ? { requestSignUp: true } : {}),
      ...(options.signUpData ? { additionalData: options.signUpData } : {})
    })
    .expect(200);

  const state = new URL(start.body.url).searchParams.get("state");
  const callback = await agent
    .get("/api/auth/callback/google")
    .query({ code: "google-code", state })
    .set("Origin", webOrigin);

  const location = callback.headers.location ? new URL(callback.headers.location) : null;
  const cookies: string[] = ([] as string[]).concat(callback.headers["set-cookie"] ?? []);

  return {
    start,
    callback,
    location,
    // Whether the callback signed the browser in.
    hasSessionCookie: cookies.some((cookie) =>
      cookie.startsWith("better-auth.session_token=")
    ),
    error: location?.searchParams.get("error") ?? null
  };
}
