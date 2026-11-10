import { and, asc, count, eq, gte, isNotNull, sql, type SQL } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  chapter,
  course,
  institution,
  major,
  studySession,
  user
} from "../db/schema/index.js";
import { INSIGHTS_TIME_ZONE } from "../utils/insights-range.js";
import { loadPresence } from "./study-session.repository.js";

type Window = { bucket: "day" | "week"; from: Date; to: Date };

const zone = sql.raw(`'${INSIGHTS_TIME_ZONE}'`);

const countDistinct = (column: SQL | typeof studySession.userId) =>
  sql<number>`count(distinct ${column})`.mapWith(Number);

// `user.created_at` is `timestamp` without time zone, which the app reads and writes as UTC.
const createdAtInstant = sql`(${user.createdAt} AT TIME ZONE 'UTC')`;

// The bucket an instant falls in, as `YYYY-MM-DD` of its first local day. A week starts on Sunday,
// and `extract(dow ...)` counts Sunday as 0 (`date_trunc('week')` would start on Monday).
function bucketOf(
  instant: SQL | typeof studySession.firstJoinedAt,
  bucket: "day" | "week"
) {
  const day = sql`((${instant} AT TIME ZONE ${zone})::date)`;
  const first = bucket === "week" ? sql`(${day} - extract(dow from ${day})::int)` : day;

  return sql<string>`to_char(${first}, 'YYYY-MM-DD')`;
}

function between(instant: SQL | typeof studySession.firstJoinedAt, window: Window) {
  return and(
    sql`${instant} >= ${window.from.toISOString()}::timestamptz`,
    sql`${instant} <= ${window.to.toISOString()}::timestamptz`
  );
}

export async function countStudents(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(eq(user.role, "user"));

  return row?.total ?? 0;
}

export async function countSignupsByBucket(window: Window) {
  const bucket = bucketOf(createdAtInstant, window.bucket);

  return db
    .select({ bucket, signups: count() })
    .from(user)
    .where(and(eq(user.role, "user"), between(createdAtInstant, window)))
    .groupBy(bucket);
}

// Held Sessions of Students (Admin Sessions and Admin Accounts excluded) with `first_joined_at`
// in the window.
function heldSessionsWhere(window: Window) {
  return and(
    eq(studySession.kind, "student"),
    eq(user.role, "user"),
    isNotNull(studySession.firstJoinedAt),
    between(studySession.firstJoinedAt, window)
  );
}

export async function countHeldSessionsTotal(window: Window) {
  const [row] = await db
    .select({
      heldSessions: count(),
      activeStudents: countDistinct(studySession.userId)
    })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(heldSessionsWhere(window));

  return row ?? { heldSessions: 0, activeStudents: 0 };
}

export async function countHeldSessionsByBucket(window: Window) {
  const bucket = bucketOf(studySession.firstJoinedAt, window.bucket);

  return db
    .select({
      bucket,
      heldSessions: count(),
      activeStudents: countDistinct(studySession.userId)
    })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(heldSessionsWhere(window))
    .groupBy(bucket);
}

export async function countHeldSessionsByChapter(window: Window) {
  return db
    .select({
      courseId: studySession.courseId,
      chapterNumber: studySession.chapterNumber,
      heldSessions: count(),
      activeStudents: countDistinct(studySession.userId)
    })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(heldSessionsWhere(window))
    .groupBy(studySession.courseId, studySession.chapterNumber);
}

// Distinct across the Course's Chapters, so it cannot be summed from the Chapter rows.
export async function countHeldSessionsByCourse(window: Window) {
  return db
    .select({
      courseId: studySession.courseId,
      heldSessions: count(),
      activeStudents: countDistinct(studySession.userId)
    })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(heldSessionsWhere(window))
    .groupBy(studySession.courseId);
}

// The Held Sessions in the window with their presence and bucket, for study seconds: those are
// counted by `sessionSecondsUsed` in TypeScript, exactly as Usage counts them.
export async function findHeldSessionsWithPresence(window: Window) {
  const rows = await db
    .select({
      session: studySession,
      bucket: bucketOf(studySession.firstJoinedAt, window.bucket)
    })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(heldSessionsWhere(window));
  const sessions = await loadPresence(
    db,
    rows.map((row) => row.session)
  );

  return sessions.map((session, index) => ({ session, bucket: rows[index]!.bucket }));
}

// Per Institution and Major, all-time Students and signups in the window.
export async function countStudentsByPlacement(window: Window) {
  return db
    .select({
      institutionId: user.institutionId,
      majorId: user.majorId,
      students: count(),
      signups:
        sql<number>`count(*) filter (where ${between(createdAtInstant, window)})`.mapWith(
          Number
        )
    })
    .from(user)
    .where(eq(user.role, "user"))
    .groupBy(user.institutionId, user.majorId);
}

export async function findInstitutionsWithMajors() {
  const [institutions, majors] = await Promise.all([
    db
      .select()
      .from(institution)
      .orderBy(asc(institution.sortOrder), asc(institution.id)),
    db.select().from(major).orderBy(asc(major.sortOrder), asc(major.id))
  ]);

  return { institutions, majors };
}

export async function findCoursesWithChapters() {
  const [courses, chapters] = await Promise.all([
    db.select().from(course).orderBy(asc(course.sortOrder), asc(course.id)),
    db.select().from(chapter).orderBy(asc(chapter.courseId), asc(chapter.number))
  ]);

  return { courses, chapters };
}

// Student Sessions issued at or after `since`, with presence, for the Allowance bands.
export async function findStudentSessionsIssuedSince(since: Date) {
  const rows = await db
    .select({ session: studySession })
    .from(studySession)
    .innerJoin(user, eq(studySession.userId, user.id))
    .where(
      and(
        eq(studySession.kind, "student"),
        eq(user.role, "user"),
        gte(studySession.issuedAt, since)
      )
    );

  return loadPresence(
    db,
    rows.map((row) => row.session)
  );
}
