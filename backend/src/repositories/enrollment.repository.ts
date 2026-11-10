import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db, type DbTransaction } from "../db/index.js";
import { chapter, course, enrollment, institution } from "../db/schema/index.js";
import { AppError } from "../utils/app-error.js";
import { courseSummarySelection } from "./catalog.repository.js";
import { lockCurrentPlanAssignment } from "./plan.repository.js";

function activeEnrollmentsQuery(
  connection: Pick<typeof db, "select">,
  userId: string,
  courseId?: string
) {
  return connection
    .select({
      ...courseSummarySelection,
      enrollmentId: enrollment.id,
      enrolledAt: enrollment.enrolledAt
    })
    .from(enrollment)
    .innerJoin(course, eq(enrollment.courseId, course.id))
    .innerJoin(institution, eq(course.institutionId, institution.id))
    .leftJoin(chapter, eq(chapter.courseId, course.id))
    .where(
      and(
        eq(enrollment.userId, userId),
        isNull(enrollment.endedAt),
        courseId === undefined ? undefined : eq(enrollment.courseId, courseId)
      )
    )
    .groupBy(enrollment.id, course.id, institution.id)
    .orderBy(desc(enrollment.enrolledAt));
}

export async function findActiveEnrollments(userId: string) {
  return activeEnrollmentsQuery(db, userId);
}

export async function countActiveEnrollments(userId: string): Promise<number> {
  const [usage] = await db
    .select({ enrollments: count() })
    .from(enrollment)
    .where(and(eq(enrollment.userId, userId), isNull(enrollment.endedAt)));

  return usage!.enrollments;
}

export type EnrollmentRow = Awaited<ReturnType<typeof findActiveEnrollments>>[number];

type InsertEnrollmentResult =
  | { kind: "course-missing" }
  | { kind: "assignment-missing" }
  | { kind: "ok"; created: boolean; enrollment: EnrollmentRow };

// Enrolls inside the caller's transaction, so an Admin grant can write its Audit log entry in the
// same one. Locks the Account's current Plan assignment and enforces its Enrollment limit.
export async function enrollInTransaction(
  tx: DbTransaction,
  userId: string,
  courseId: string
): Promise<InsertEnrollmentResult> {
  const assignment = await lockCurrentPlanAssignment(tx, userId);
  const [existingCourse] = await tx
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, courseId));
  if (!existingCourse) return { kind: "course-missing" };
  if (!assignment) return { kind: "assignment-missing" };

  const [existing] = await activeEnrollmentsQuery(tx, userId, courseId);
  if (existing) return { kind: "ok", created: false, enrollment: existing };

  if (assignment.maxActiveEnrollments !== null) {
    const [usage] = await tx
      .select({ enrollments: count() })
      .from(enrollment)
      .where(and(eq(enrollment.userId, userId), isNull(enrollment.endedAt)));

    if (usage!.enrollments >= assignment.maxActiveEnrollments) {
      throw new AppError(409, "Enrollment limit reached", "ENROLLMENT_LIMIT_REACHED");
    }
  }

  const inserted = await tx
    .insert(enrollment)
    .values({ userId, courseId })
    .onConflictDoNothing({
      target: [enrollment.userId, enrollment.courseId],
      where: isNull(enrollment.endedAt)
    })
    .returning({ id: enrollment.id });

  const [active] = await activeEnrollmentsQuery(tx, userId, courseId);
  if (!active) throw new Error("Active Enrollment missing after insert");

  return { kind: "ok", created: inserted.length > 0, enrollment: active };
}

export async function insertEnrollment(userId: string, courseId: string) {
  return db.transaction((tx) => enrollInTransaction(tx, userId, courseId));
}

export type EnrollmentEndReason = (typeof enrollment.$inferSelect)["endReason"];

// Ends the active Enrollment for the Course, keeping the row. Returns its id, or undefined when the
// Account holds none. `connection` lets an Admin end write its Audit log entry in the same transaction.
export async function endActiveEnrollment(
  userId: string,
  courseId: string,
  endReason: NonNullable<EnrollmentEndReason>,
  connection: Pick<typeof db, "update"> = db
): Promise<string | undefined> {
  const [ended] = await connection
    .update(enrollment)
    .set({ endedAt: sql`now()`, endReason })
    .where(
      and(
        eq(enrollment.userId, userId),
        eq(enrollment.courseId, courseId),
        isNull(enrollment.endedAt)
      )
    )
    .returning({ id: enrollment.id });

  return ended?.id;
}

export async function endEnrollment(userId: string, courseId: string): Promise<boolean> {
  return (await endActiveEnrollment(userId, courseId, "unenrolled")) !== undefined;
}

// Every Enrollment of the Account, active and ended, newest first.
export async function findAllEnrollments(userId: string) {
  return db
    .select({
      id: enrollment.id,
      courseId: course.id,
      courseCode: course.code,
      courseNameAr: course.nameAr,
      courseNameEn: course.nameEn,
      enrolledAt: enrollment.enrolledAt,
      endedAt: enrollment.endedAt,
      endReason: enrollment.endReason
    })
    .from(enrollment)
    .innerJoin(course, eq(enrollment.courseId, course.id))
    .where(eq(enrollment.userId, userId))
    .orderBy(desc(enrollment.enrolledAt), desc(enrollment.id));
}
