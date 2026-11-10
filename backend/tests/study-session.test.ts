import { describe, expect, it } from "vitest";

import { studySessionState, studySessionUsage } from "../src/utils/study-session.js";

const issuedAt = new Date("2026-10-13T12:00:00.000Z");
const held = {
  issuedAt,
  firstJoinedAt: null,
  endedAt: null,
  grantedSeconds: 1800,
  presence: [] as { joinedAt: Date; leftAt: Date | null }[]
};

describe("Session state", () => {
  it("holds a Session until the exact ten-minute token expiry", () => {
    expect(studySessionState(held, issuedAt)).toBe("held");
    expect(studySessionState(held, new Date("2026-10-13T12:09:59.999Z"))).toBe("held");
    expect(studySessionState(held, new Date("2026-10-13T12:10:00.000Z"))).toBe("ended");
  });

  it("keeps a joined Session open beyond token expiry until it ends", () => {
    const joined = {
      ...held,
      firstJoinedAt: issuedAt,
      presence: [{ joinedAt: issuedAt, leftAt: null }]
    };
    const now = new Date("2026-10-13T13:00:00.000Z");
    expect(studySessionState(joined, now)).toBe("open");
    expect(studySessionState({ ...joined, endedAt: now }, now)).toBe("ended");
  });

  it("treats a superseded held Session as ended before token expiry", () => {
    expect(studySessionState({ ...held, endedAt: issuedAt }, issuedAt)).toBe("ended");
  });

  it("counts held and joined Sessions, including joined Sessions that have ended", () => {
    const now = new Date("2026-10-13T12:05:00.000Z");
    expect(
      studySessionUsage(
        [
          held,
          { ...held, issuedAt: new Date("2026-10-13T11:55:00.000Z") },
          { ...held, endedAt: now },
          { ...held, firstJoinedAt: issuedAt },
          { ...held, firstJoinedAt: issuedAt, endedAt: now }
        ],
        now
      )
    ).toEqual({ sessions: 3, seconds: 0 });
  });
});
