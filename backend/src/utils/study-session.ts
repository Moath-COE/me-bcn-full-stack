import { LIVEKIT_TOKEN_TTL_SECONDS } from "./livekit-token-ttl.js";

export const STUDY_SESSION_RESUME_WINDOW_SECONDS = 120;

type SessionTimes = {
  issuedAt: Date;
  firstJoinedAt: Date | null;
  endedAt: Date | null;
  grantedSeconds: number;
  presence: { joinedAt: Date; leftAt: Date | null }[];
};

export function studySessionState(
  session: SessionTimes,
  now: Date
): "held" | "open" | "ended" {
  if (session.endedAt !== null) return "ended";
  if (session.firstJoinedAt !== null) {
    if (session.presence.some((interval) => interval.leftAt === null)) return "open";
    const lastLeft = Math.max(
      ...session.presence.map((interval) => interval.leftAt!.getTime())
    );
    return now.getTime() - lastLeft < STUDY_SESSION_RESUME_WINDOW_SECONDS * 1000
      ? "open"
      : "ended";
  }
  const age = now.getTime() - session.issuedAt.getTime();
  // A persisted Session has been issued; a backwards clock must not expire it.
  return age < LIVEKIT_TOKEN_TTL_SECONDS * 1000 ? "held" : "ended";
}

export function sessionSecondsUsed(session: SessionTimes, now: Date): number {
  const end = Math.min(now.getTime(), session.endedAt?.getTime() ?? Infinity);
  return Math.min(
    session.grantedSeconds,
    session.presence.reduce(
      (seconds, interval) =>
        seconds +
        Math.max(
          0,
          (Math.min(interval.leftAt?.getTime() ?? end, end) -
            interval.joinedAt.getTime()) /
            1000
        ),
      0
    )
  );
}

export function sessionNoLeaveEnd(session: SessionTimes, now: Date): Date | null {
  if (session.endedAt !== null) return null;
  const open = session.presence.find((interval) => interval.leftAt === null);
  if (!open) return null;
  const closedSeconds = sessionSecondsUsed(
    {
      ...session,
      presence: session.presence.filter((interval) => interval.leftAt !== null)
    },
    now
  );
  const end = new Date(
    open.joinedAt.getTime() + (session.grantedSeconds - closedSeconds) * 1000
  );
  return now.getTime() > end.getTime() ? end : null;
}

export function studySessionUsage(sessions: SessionTimes[], now: Date) {
  return sessions.reduce(
    (usage, session) => ({
      sessions:
        usage.sessions +
        Number(
          session.firstJoinedAt !== null || studySessionState(session, now) === "held"
        ),
      seconds: usage.seconds + sessionSecondsUsed(session, now)
    }),
    { sessions: 0, seconds: 0 }
  );
}
