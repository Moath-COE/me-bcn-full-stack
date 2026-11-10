import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import { countActiveEnrollments } from "../repositories/enrollment.repository.js";
import { findCurrentPlanAssignment } from "../repositories/plan.repository.js";
import { readSessionUsage } from "../repositories/study-session.repository.js";
import { isUnlimitedAccount } from "./permission.service.js";
import { AppError } from "../utils/app-error.js";
import { currentPeriod } from "../utils/current-period.js";

export async function readAllowance(userId: string) {
  const assignment = await findCurrentPlanAssignment(userId);
  if (!assignment) {
    logger.error({ userId }, "Current Plan assignment missing");
    throw new AppError(500, "Internal server error", "PLAN_ASSIGNMENT_MISSING");
  }

  // Use the same clock floor as issuance when the wall clock moves behind the anchor.
  const now = new Date(Math.max(Date.now(), assignment.startsAt.getTime()));
  const period = currentPeriod(assignment.startsAt, now);
  return {
    // True only for an Admin with two-factor: the web skips its own gates for them.
    unlimited: await isUnlimitedAccount(userId),
    plan: { id: assignment.id, name: { ar: assignment.nameAr, en: assignment.nameEn } },
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    limits: {
      sessions: assignment.sessionsPerPeriod,
      seconds: assignment.secondsPerPeriod,
      enrollments: assignment.maxActiveEnrollments,
      sessionSeconds: assignment.maxSessionSeconds,
      minStartSeconds: assignment.minStartSeconds
    },
    usage: {
      ...(await readSessionUsage(db, userId, period, now)),
      enrollments: await countActiveEnrollments(userId)
    }
  };
}
