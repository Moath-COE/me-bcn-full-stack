import { and, count, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { db, type DbTransaction } from "../db/index.js";
import {
  course,
  livekitWebhookEvent,
  studySession,
  studySessionPresence
} from "../db/schema/index.js";
import { sessionNoLeaveEnd, studySessionUsage } from "../utils/study-session.js";

export async function readSessionUsage(
  connection: Pick<typeof db, "select">,
  userId: string,
  period: { start: Date; end: Date },
  now: Date
) {
  const sessions = await connection
    .select()
    .from(studySession)
    .where(
      and(
        eq(studySession.userId, userId),
        // Admin Sessions are recorded but never count toward Usage.
        eq(studySession.kind, "student"),
        gte(studySession.issuedAt, period.start),
        lt(studySession.issuedAt, period.end)
      )
    );
  return studySessionUsage(await loadPresence(connection, sessions), now);
}

// One page of an Account's Sessions of either kind, newest issued first, each with its Course and
// presence intervals, plus the Account's total. Read-only: Admin Sessions are included here even
// though they never count toward Usage.
export async function findStudySessionsPage(
  userId: string,
  limit: number,
  offset: number
) {
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        session: studySession,
        courseCode: course.code,
        courseNameAr: course.nameAr,
        courseNameEn: course.nameEn
      })
      .from(studySession)
      .innerJoin(course, eq(studySession.courseId, course.id))
      .where(eq(studySession.userId, userId))
      .orderBy(desc(studySession.issuedAt), desc(studySession.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(studySession)
      .where(eq(studySession.userId, userId))
  ]);

  const withPresence = await loadPresence(
    db,
    rows.map((row) => row.session)
  );

  return {
    total: totalRow?.total ?? 0,
    sessions: rows.map((row, index) => ({
      ...withPresence[index]!,
      courseCode: row.courseCode,
      courseNameAr: row.courseNameAr,
      courseNameEn: row.courseNameEn
    }))
  };
}

export async function findUnendedSessions(tx: DbTransaction, userId: string) {
  const sessions = await tx
    .select()
    .from(studySession)
    .where(and(eq(studySession.userId, userId), isNull(studySession.endedAt)))
    .for("update");
  return loadPresence(tx, sessions);
}

// Chunked so a bulk caller (Admin Insights) stays under the driver's bind-parameter limit.
const PRESENCE_CHUNK_SIZE = 5000;

export async function loadPresence(
  connection: Pick<typeof db, "select">,
  sessions: (typeof studySession.$inferSelect)[]
) {
  const intervals: (typeof studySessionPresence.$inferSelect)[] = [];
  for (let start = 0; start < sessions.length; start += PRESENCE_CHUNK_SIZE) {
    intervals.push(
      ...(await connection
        .select()
        .from(studySessionPresence)
        .where(
          inArray(
            studySessionPresence.sessionId,
            sessions
              .slice(start, start + PRESENCE_CHUNK_SIZE)
              .map((session) => session.id)
          )
        ))
    );
  }
  const bySession = new Map<string, (typeof intervals)[number][]>();
  for (const interval of intervals) {
    const list = bySession.get(interval.sessionId);
    if (list) list.push(interval);
    else bySession.set(interval.sessionId, [interval]);
  }
  return sessions.map((session) => ({
    ...session,
    presence: bySession.get(session.id) ?? []
  }));
}

export async function insertWebhookEvent(tx: DbTransaction, id: string) {
  const inserted = await tx
    .insert(livekitWebhookEvent)
    .values({ id })
    .onConflictDoNothing()
    .returning({ id: livekitWebhookEvent.id });
  return inserted.length !== 0;
}

export async function findStudySession(tx: DbTransaction, id: string) {
  const [session] = await tx.select().from(studySession).where(eq(studySession.id, id));
  return session;
}

export async function recordSessionPresence(
  tx: DbTransaction,
  sessionId: string,
  event: "participant_joined" | "participant_left",
  at: Date
) {
  // The caller holds the Account's Plan assignment lock, as token issuance does.
  await tx
    .select({ id: studySession.id })
    .from(studySession)
    .where(eq(studySession.id, sessionId))
    .for("update");
  const [open] = await tx
    .select()
    .from(studySessionPresence)
    .where(
      and(
        eq(studySessionPresence.sessionId, sessionId),
        isNull(studySessionPresence.leftAt)
      )
    )
    .orderBy(desc(studySessionPresence.joinedAt))
    .limit(1);
  if (event === "participant_joined") {
    await tx
      .update(studySession)
      .set({ firstJoinedAt: at })
      .where(and(eq(studySession.id, sessionId), isNull(studySession.firstJoinedAt)));
    if (!open) await tx.insert(studySessionPresence).values({ sessionId, joinedAt: at });
    return true;
  }
  if (!open) return false;
  await tx
    .update(studySessionPresence)
    .set({ leftAt: at })
    .where(eq(studySessionPresence.id, open.id));
  return true;
}

export async function insertStudySession(
  tx: DbTransaction,
  values: typeof studySession.$inferInsert
) {
  const [session] = await tx.insert(studySession).values(values).returning();
  return session!;
}

export async function supersedeSessions(tx: DbTransaction, ids: string[], now: Date) {
  if (ids.length === 0) return;
  await tx
    .update(studySession)
    .set({ endedAt: now, endReason: "superseded" })
    .where(inArray(studySession.id, ids));
  await tx
    .update(studySessionPresence)
    .set({ leftAt: now })
    .where(
      and(
        inArray(studySessionPresence.sessionId, ids),
        isNull(studySessionPresence.leftAt)
      )
    );
}

export async function endSessionsWithoutLeave(
  tx: DbTransaction,
  sessions: Awaited<ReturnType<typeof findUnendedSessions>>,
  now: Date
) {
  const endedIds: string[] = [];
  for (const session of sessions) {
    const endedAt = sessionNoLeaveEnd(session, now);
    if (!endedAt) continue;
    await tx
      .update(studySession)
      .set({ endedAt, endReason: "no_leave_event" })
      .where(eq(studySession.id, session.id));
    await tx
      .update(studySessionPresence)
      .set({ leftAt: endedAt })
      .where(
        and(
          eq(studySessionPresence.sessionId, session.id),
          isNull(studySessionPresence.leftAt)
        )
      );
    endedIds.push(session.id);
  }
  return endedIds;
}
