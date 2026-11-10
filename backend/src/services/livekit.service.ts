import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import { deleteLivekitRoom, mintLivekitToken } from "../lib/livekit.js";
import {
  findChapter,
  findChapterWithEnrollment
} from "../repositories/livekit.repository.js";
import { lockCurrentPlanAssignment } from "../repositories/plan.repository.js";
import {
  findUnendedSessions,
  endSessionsWithoutLeave,
  insertStudySession,
  readSessionUsage,
  supersedeSessions
} from "../repositories/study-session.repository.js";
import { isUnlimitedAccount } from "./permission.service.js";
import { AppError } from "../utils/app-error.js";
import { livekitRoomName } from "../utils/livekit-room.js";
import { currentPeriod } from "../utils/current-period.js";
import { sessionSecondsUsed, studySessionState } from "../utils/study-session.js";

// The grant of every Admin Session, in seconds (3 hours). The agent has no "unlimited" value, so an
// Admin Session gets a long finite grant with `session_limit` "session".
export const ADMIN_SESSION_GRANT_SECONDS = 10800;

export type LivekitTokenInput = {
  courseId: string;
  chapterNumber: number;
  language: "Arabic" | "English";
  experience: "quick" | "relaxed";
};

export async function createLivekitToken(
  account: { id: string; name: string },
  input: LivekitTokenInput
): Promise<{ token: string; serverUrl: string }> {
  // Read fresh from the database: a demoted Admin is a Student on the very next request.
  const admin = await isUnlimitedAccount(account.id);
  const kind = admin ? "admin" : "student";
  const chapter = admin
    ? await findChapter(input.courseId, input.chapterNumber)
    : await findChapterWithEnrollment(account.id, input.courseId, input.chapterNumber);
  if (!chapter) throw new AppError(404, "Chapter not found", "CHAPTER_NOT_FOUND");
  if (!admin) {
    if (!("enrollmentId" in chapter) || !chapter.enrollmentId) {
      throw new AppError(403, "Active Enrollment required", "NOT_ENROLLED");
    }
    if (!chapter.published) {
      throw new AppError(409, "Chapter is not published", "CHAPTER_NOT_PUBLISHED");
    }
  }

  const issued = await db.transaction(async (tx) => {
    const assignment = await lockCurrentPlanAssignment(tx, account.id);
    if (!assignment) {
      logger.error({ userId: account.id }, "Current Plan assignment missing");
      throw new AppError(500, "Internal server error", "PLAN_ASSIGNMENT_MISSING");
    }
    // A backwards clock must not place issuance before the Plan's first Period.
    const now = new Date(Math.max(Date.now(), assignment.startsAt.getTime()));
    const unended = await findUnendedSessions(tx, account.id);
    const expiredIds = await endSessionsWithoutLeave(tx, unended, now);
    const sessions = unended.filter(
      (session) =>
        !expiredIds.includes(session.id) && studySessionState(session, now) !== "ended"
    );
    const continued = sessions.find(
      (session) =>
        // A Session of the other kind is not continued: a demoted Admin must not keep an
        // Admin grant, and an Admin starts a fresh Admin Session.
        session.kind === kind &&
        session.courseId === chapter.courseId &&
        session.chapterNumber === chapter.number &&
        sessionSecondsUsed(session, now) < session.grantedSeconds
    );
    if (continued) {
      return {
        session: continued,
        remainingSeconds: continued.grantedSeconds - sessionSecondsUsed(continued, now),
        supersededIds: [] as string[],
        expiredIds
      };
    }
    const supersededIds = sessions.map((session) => session.id);
    if (admin) {
      await supersedeSessions(tx, supersededIds, now);
      const session = await insertStudySession(tx, {
        userId: account.id,
        courseId: chapter.courseId,
        chapterNumber: chapter.number,
        grantedSeconds: ADMIN_SESSION_GRANT_SECONDS,
        sessionLimit: "session",
        issuedAt: now,
        kind
      });
      return {
        session,
        remainingSeconds: ADMIN_SESSION_GRANT_SECONDS,
        supersededIds,
        expiredIds
      };
    }
    const period = currentPeriod(assignment.startsAt, now);
    const usage = await readSessionUsage(tx, account.id, period, now);
    // Defer supersession until issuance succeeds; missing-leave cleanup still commits on denial.
    const heldToSupersede = sessions.filter(
      (session) =>
        session.kind === "student" &&
        session.firstJoinedAt === null &&
        session.issuedAt >= period.start &&
        session.issuedAt < period.end
    ).length;
    if (
      assignment.sessionsPerPeriod !== null &&
      usage.sessions - heldToSupersede >= assignment.sessionsPerPeriod
    ) {
      return {
        error: new AppError(403, "Session Allowance used up", "SESSIONS_USED_UP"),
        expiredIds
      };
    }
    const secondsLeft = (assignment.secondsPerPeriod ?? Infinity) - usage.seconds;
    // Presence can include fractional seconds; stored grants are whole seconds.
    const grantedSeconds = Math.floor(
      Math.min(secondsLeft, assignment.maxSessionSeconds ?? Infinity)
    );
    if (secondsLeft < (assignment.minStartSeconds ?? 1) || grantedSeconds <= 0) {
      return {
        error: new AppError(403, "Session time Allowance used up", "MINUTES_USED_UP"),
        expiredIds
      };
    }
    await supersedeSessions(tx, supersededIds, now);
    const session = await insertStudySession(tx, {
      userId: account.id,
      courseId: chapter.courseId,
      chapterNumber: chapter.number,
      grantedSeconds,
      sessionLimit:
        secondsLeft <= (assignment.maxSessionSeconds ?? Infinity)
          ? "allowance"
          : "session",
      issuedAt: now,
      kind
    });
    return { session, remainingSeconds: grantedSeconds, supersededIds, expiredIds };
  });

  for (const sessionId of issued.expiredIds) {
    logger.warn({ userId: account.id, sessionId }, "Session ended without a leave event");
  }
  if (issued.error) throw issued.error;

  await Promise.all(
    issued.supersededIds.map((id) => deleteLivekitRoom(livekitRoomName(id)))
  );
  const { session } = issued;

  const token = await mintLivekitToken({
    identity: account.id,
    name: account.name,
    room: livekitRoomName(session.id),
    // These attribute names are a contract with the LiveKit agent.
    attributes: {
      course_id: chapter.courseId,
      chapter_id: `ch_${chapter.number}`,
      language: input.language,
      experience: input.experience,
      user_id: account.id,
      user_name: account.name,
      session_seconds: String(issued.remainingSeconds),
      session_limit: session.sessionLimit
    }
  });

  return { token, serverUrl: env.LIVEKIT_URL };
}
