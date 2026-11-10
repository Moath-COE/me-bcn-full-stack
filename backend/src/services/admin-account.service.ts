// What an Admin sees and does on one Account's detail page: Enrollments, Allowance, Sessions, and
// granting or ending an Enrollment, plus the Accounts list. Reads reuse the Student-side logic so the numbers match.
import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import {
  accountExists,
  countAdminAccounts,
  findAdminAccounts,
  type AdminAccountFilters,
  type AdminAccountSort
} from "../repositories/admin-account.repository.js";
import {
  endActiveEnrollment,
  enrollInTransaction,
  findAllEnrollments
} from "../repositories/enrollment.repository.js";
import { findStudySessionsPage } from "../repositories/study-session.repository.js";
import { AppError } from "../utils/app-error.js";
import { livekitRoomName } from "../utils/livekit-room.js";
import { sessionSecondsUsed, studySessionState } from "../utils/study-session.js";
import { readAllowance } from "./allowance.service.js";
import { AuditAction, AuditTargetType, recordAdminAction } from "./audit-log.service.js";

export async function assertAccountExists(accountId: string): Promise<void> {
  if (!(await accountExists(accountId))) {
    throw new AppError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }
}

export type AdminEnrollmentDto = {
  id: string;
  course: { id: string; code: string; name: { ar: string; en: string } };
  enrolledAt: string;
  endedAt: string | null;
  endReason: "unenrolled" | "ended_by_admin" | null;
};

type AdminEnrollmentRow = Awaited<ReturnType<typeof findAllEnrollments>>[number];

function toAdminEnrollmentDto(row: AdminEnrollmentRow): AdminEnrollmentDto {
  return {
    id: row.id,
    course: {
      id: row.courseId,
      code: row.courseCode,
      name: { ar: row.courseNameAr, en: row.courseNameEn }
    },
    enrolledAt: row.enrolledAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason
  };
}

export async function listAccountEnrollments(
  accountId: string
): Promise<AdminEnrollmentDto[]> {
  return (await findAllEnrollments(accountId)).map(toAdminEnrollmentDto);
}

// Exactly what the Student's `GET /me/allowance` returns for the Account, `unlimited` included.
export async function readAccountAllowance(accountId: string) {
  return readAllowance(accountId);
}

export async function listAccountSessions(
  accountId: string,
  limit: number,
  offset: number
) {
  const now = new Date();
  const page = await findStudySessionsPage(accountId, limit, offset);

  return {
    sessions: page.sessions.map((session) => ({
      id: session.id,
      // The LiveKit room name, so an Admin can match the Session to its room.
      room: livekitRoomName(session.id),
      course: {
        id: session.courseId,
        code: session.courseCode,
        name: { ar: session.courseNameAr, en: session.courseNameEn }
      },
      chapterNumber: session.chapterNumber,
      kind: session.kind,
      grantedSeconds: session.grantedSeconds,
      sessionLimit: session.sessionLimit,
      issuedAt: session.issuedAt.toISOString(),
      firstJoinedAt: session.firstJoinedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      endReason: session.endReason,
      // The same presence arithmetic as Usage.
      connectedSeconds: sessionSecondsUsed(session, now),
      state: studySessionState(session, now)
    })),
    total: page.total,
    limit,
    offset
  };
}

// Follows the Account's Plan slot limit, as the Student's own enrollment does. A Course already held
// changes nothing, so it writes no Audit log entry.
export async function grantEnrollment(
  actorId: string,
  accountId: string,
  courseId: string
) {
  const result = await db.transaction(async (tx) => {
    const outcome = await enrollInTransaction(tx, accountId, courseId);

    if (outcome.kind === "ok" && outcome.created) {
      await recordAdminAction(
        {
          actorId,
          action: AuditAction.ENROLLMENT_GRANT,
          targetType: AuditTargetType.ACCOUNT,
          targetId: accountId,
          after: { courseId, enrollmentId: outcome.enrollment.enrollmentId }
        },
        tx
      );
    }

    return outcome;
  });

  if (result.kind === "course-missing") {
    throw new AppError(404, "Course not found", "COURSE_NOT_FOUND");
  }
  if (result.kind === "assignment-missing") {
    logger.error({ userId: accountId }, "Current Plan assignment missing");
    throw new AppError(500, "Internal server error", "PLAN_ASSIGNMENT_MISSING");
  }

  if (result.created) {
    logger.info({ userId: accountId, courseId, actorId }, "Enrollment granted by Admin");
  }

  const enrollment: AdminEnrollmentDto = {
    id: result.enrollment.enrollmentId,
    course: {
      id: result.enrollment.id,
      code: result.enrollment.code,
      name: { ar: result.enrollment.nameAr, en: result.enrollment.nameEn }
    },
    enrolledAt: result.enrollment.enrolledAt.toISOString(),
    endedAt: null,
    endReason: null
  };

  return { created: result.created, enrollment };
}

// Ends the active Enrollment and keeps the row, with the Admin end reason.
export async function endEnrollmentByAdmin(
  actorId: string,
  accountId: string,
  courseId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const enrollmentId = await endActiveEnrollment(
      accountId,
      courseId,
      "ended_by_admin",
      tx
    );
    if (enrollmentId === undefined) {
      throw new AppError(404, "Enrollment not found", "ENROLLMENT_NOT_FOUND");
    }

    await recordAdminAction(
      {
        actorId,
        action: AuditAction.ENROLLMENT_END,
        targetType: AuditTargetType.ACCOUNT,
        targetId: accountId,
        before: { courseId, enrollmentId },
        after: { courseId, enrollmentId, endReason: "ended_by_admin" }
      },
      tx
    );
  });

  logger.info({ userId: accountId, courseId, actorId }, "Enrollment ended by Admin");
}

// The Accounts list. Reads are not audited.
export type AdminAccountsQuery = AdminAccountFilters &
  AdminAccountSort & { limit: number; offset: number };

export async function listAdminAccounts({
  limit,
  offset,
  sortBy,
  sortDirection,
  ...filters
}: AdminAccountsQuery) {
  const [rows, total] = await Promise.all([
    findAdminAccounts(filters, { sortBy, sortDirection }, limit, offset),
    countAdminAccounts(filters)
  ]);

  return {
    accounts: rows.map(
      ({
        institutionId,
        institutionNameAr,
        institutionNameEn,
        majorId,
        majorNameAr,
        majorNameEn,
        ...account
      }) => ({
        ...account,
        institution: {
          id: institutionId,
          name: { ar: institutionNameAr, en: institutionNameEn }
        },
        major: { id: majorId, name: { ar: majorNameAr, en: majorNameEn } }
      })
    ),
    total,
    limit,
    offset
  };
}
