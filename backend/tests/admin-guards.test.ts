import { describe, expect, it } from "vitest";

import {
  assertFreshSession,
  assertNotSelfTarget,
  assertTwoFactorEnabled,
  FRESH_SESSION_MAX_AGE_SECONDS
} from "../src/utils/admin-guards.js";

describe("assertFreshSession", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const createdSecondsAgo = (seconds: number) => ({
    createdAt: new Date(now.getTime() - seconds * 1000)
  });

  it("accepts a session created inside the window", () => {
    expect(() =>
      assertFreshSession(createdSecondsAgo(FRESH_SESSION_MAX_AGE_SECONDS - 1), now)
    ).not.toThrow();
  });

  it("rejects a session created at or beyond the window with FRESH_SESSION_REQUIRED", () => {
    expect(() =>
      assertFreshSession(createdSecondsAgo(FRESH_SESSION_MAX_AGE_SECONDS), now)
    ).toThrow(
      expect.objectContaining({ statusCode: 403, code: "FRESH_SESSION_REQUIRED" })
    );
  });

  it("reads the creation time from an ISO string, as a cookie-cached session carries it", () => {
    expect(() => assertFreshSession({ createdAt: "2026-10-15T11:00:00Z" }, now)).toThrow(
      expect.objectContaining({ code: "FRESH_SESSION_REQUIRED" })
    );
  });
});

describe("assertTwoFactorEnabled", () => {
  it("accepts only an explicit true", () => {
    expect(() => assertTwoFactorEnabled(true)).not.toThrow();

    for (const value of [false, null, undefined]) {
      expect(() => assertTwoFactorEnabled(value)).toThrow(
        expect.objectContaining({ statusCode: 403, code: "ADMIN_TWO_FACTOR_REQUIRED" })
      );
    }
  });
});

describe("assertNotSelfTarget", () => {
  it("refuses the caller's own id with 403 ADMIN_SELF_TARGET", () => {
    expect(() => assertNotSelfTarget("a1", "a1")).toThrow(
      expect.objectContaining({ statusCode: 403, code: "ADMIN_SELF_TARGET" })
    );
  });

  it("accepts another Account and leaves a missing or non-string id to the endpoint", () => {
    expect(() => assertNotSelfTarget("a1", "b2")).not.toThrow();
    expect(() => assertNotSelfTarget("a1", undefined)).not.toThrow();
    expect(() => assertNotSelfTarget("a1", 7)).not.toThrow();
  });
});
