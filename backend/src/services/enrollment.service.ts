import { logger } from "../config/logger.js";
import {
  endEnrollment,
  findActiveEnrollments,
  insertEnrollment,
  type EnrollmentRow
} from "../repositories/enrollment.repository.js";
import { AppError } from "../utils/app-error.js";
import { toCourseSummary, type CourseSummary } from "./catalog.service.js";

export type EnrollmentDto = { enrolledAt: string; course: CourseSummary };

function toEnrollmentDto(row: EnrollmentRow): EnrollmentDto {
  return { enrolledAt: row.enrolledAt.toISOString(), course: toCourseSummary(row) };
}

export async function listEnrollments(userId: string): Promise<EnrollmentDto[]> {
  return (await findActiveEnrollments(userId)).map(toEnrollmentDto);
}

export async function enroll(userId: string, courseId: string) {
  const result = await insertEnrollment(userId, courseId);
  if (result.kind === "course-missing") {
    throw new AppError(404, "Course not found", "COURSE_NOT_FOUND");
  }
  if (result.kind === "assignment-missing") {
    logger.error({ userId }, "Current Plan assignment missing");
    throw new AppError(500, "Internal server error", "PLAN_ASSIGNMENT_MISSING");
  }

  if (result.created) logger.info({ userId, courseId }, "Enrollment created");
  return { created: result.created, enrollment: toEnrollmentDto(result.enrollment) };
}

export async function unenroll(userId: string, courseId: string): Promise<void> {
  if (await endEnrollment(userId, courseId)) {
    logger.info({ userId, courseId }, "Enrollment ended");
  }
}
