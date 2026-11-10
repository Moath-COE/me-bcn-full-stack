import {
  countHeldSessionsByBucket,
  countHeldSessionsByChapter,
  countHeldSessionsByCourse,
  countHeldSessionsTotal,
  countSignupsByBucket,
  countStudents,
  countStudentsByPlacement,
  findCoursesWithChapters,
  findHeldSessionsWithPresence,
  findInstitutionsWithMajors,
  findStudentSessionsIssuedSince
} from "../repositories/admin-insights.repository.js";
import {
  findAllPlans,
  findStudentPlanAssignments
} from "../repositories/plan.repository.js";
import { currentPeriod } from "../utils/current-period.js";
import {
  INSIGHTS_TIME_ZONE,
  insightsWindow,
  type InsightsRange
} from "../utils/insights-range.js";
import { sessionSecondsUsed, studySessionUsage } from "../utils/study-session.js";

type Name = { ar: string; en: string };

export const allowanceBands = ["0", "1-25", "26-50", "51-75", "76-99", "100"] as const;
type Band = (typeof allowanceBands)[number];

function bandOf(percent: number): Band {
  if (percent <= 0) return "0";
  if (percent <= 25) return "1-25";
  if (percent <= 50) return "26-50";
  if (percent <= 75) return "51-75";
  if (percent < 100) return "76-99";
  return "100";
}

// Whole percent of one limit, rounded down and capped at 100. A limit of 0 is full from the start.
function percentOfLimit(used: number, limit: number): number {
  return limit === 0 ? 100 : Math.min(100, Math.floor((used * 100) / limit));
}

// The larger share over the limits that are not null; a Plan with neither has nothing to use up.
export function allowanceShare(
  usage: { sessions: number; seconds: number },
  limits: { sessions: number | null; seconds: number | null }
): { percent: number; atLimit: boolean } {
  const parts: { used: number; limit: number }[] = [];
  if (limits.sessions !== null)
    parts.push({ used: usage.sessions, limit: limits.sessions });
  if (limits.seconds !== null) parts.push({ used: usage.seconds, limit: limits.seconds });

  return {
    percent: Math.max(0, ...parts.map(({ used, limit }) => percentOfLimit(used, limit))),
    atLimit: parts.some(({ used, limit }) => used >= limit)
  };
}

function bySortedKey<T>(rows: T[], key: (row: T) => string) {
  return new Map(rows.map((row) => [key(row), row]));
}

async function readAllowanceBands(now: Date) {
  const [plans, assignments] = await Promise.all([
    findAllPlans(),
    findStudentPlanAssignments()
  ]);

  // The same clock floor and Period as `readAllowance`, per Student.
  const periods = assignments.map((assignment) => {
    const studentNow = new Date(Math.max(now.getTime(), assignment.startsAt.getTime()));

    return {
      ...assignment,
      now: studentNow,
      period: currentPeriod(assignment.startsAt, studentNow)
    };
  });

  const earliest = periods.reduce<Date | null>(
    (min, { period }) => (min === null || period.start < min ? period.start : min),
    null
  );
  const sessions =
    earliest === null ? [] : await findStudentSessionsIssuedSince(earliest);
  const sessionsByStudent = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const list = sessionsByStudent.get(session.userId);
    if (list) list.push(session);
    else sessionsByStudent.set(session.userId, [session]);
  }

  const tallies = new Map(
    plans.map((plan) => [
      plan.id,
      { students: 0, atLimit: 0, bands: new Map<Band, number>() }
    ])
  );
  for (const student of periods) {
    const tally = tallies.get(student.planId)!;
    const usage = studySessionUsage(
      (sessionsByStudent.get(student.userId) ?? []).filter(
        (session) =>
          session.issuedAt >= student.period.start &&
          session.issuedAt < student.period.end
      ),
      student.now
    );
    const { percent, atLimit } = allowanceShare(usage, {
      sessions: student.sessionsPerPeriod,
      seconds: student.secondsPerPeriod
    });
    tally.students += 1;
    tally.atLimit += Number(atLimit);
    const band = bandOf(percent);
    tally.bands.set(band, (tally.bands.get(band) ?? 0) + 1);
  }

  return {
    plans: plans.map((plan) => {
      const tally = tallies.get(plan.id)!;

      return {
        id: plan.id,
        name: { ar: plan.nameAr, en: plan.nameEn } as Name,
        students: tally.students,
        atLimit: tally.atLimit,
        usage: allowanceBands.map((band) => ({
          band,
          students: tally.bands.get(band) ?? 0
        }))
      };
    })
  };
}

export async function readAdminInsights(range: InsightsRange, now = new Date()) {
  const window = insightsWindow(range, now);

  const [
    students,
    signupRows,
    totalRow,
    bucketRows,
    chapterRows,
    courseRows,
    heldSessions,
    placementRows,
    placement,
    catalog,
    allowance
  ] = await Promise.all([
    countStudents(),
    countSignupsByBucket(window),
    countHeldSessionsTotal(window),
    countHeldSessionsByBucket(window),
    countHeldSessionsByChapter(window),
    countHeldSessionsByCourse(window),
    findHeldSessionsWithPresence(window),
    countStudentsByPlacement(window),
    findInstitutionsWithMajors(),
    findCoursesWithChapters(),
    readAllowanceBands(now)
  ]);

  // Study seconds, counted exactly as Usage counts them, by bucket, Course and Chapter.
  const secondsByBucket = new Map<string, number>();
  const secondsByCourse = new Map<string, number>();
  const secondsByChapter = new Map<string, number>();
  let studySeconds = 0;
  for (const { session, bucket } of heldSessions) {
    const seconds = sessionSecondsUsed(session, now);
    const chapterKey = `${session.courseId}/${session.chapterNumber}`;
    studySeconds += seconds;
    secondsByBucket.set(bucket, (secondsByBucket.get(bucket) ?? 0) + seconds);
    secondsByCourse.set(
      session.courseId,
      (secondsByCourse.get(session.courseId) ?? 0) + seconds
    );
    secondsByChapter.set(chapterKey, (secondsByChapter.get(chapterKey) ?? 0) + seconds);
  }

  const signups = new Map(signupRows.map((row) => [row.bucket, row.signups]));
  const held = bySortedKey(bucketRows, (row) => row.bucket);
  const series = window.buckets.map((date) => ({
    date,
    signups: signups.get(date) ?? 0,
    activeStudents: held.get(date)?.activeStudents ?? 0,
    heldSessions: held.get(date)?.heldSessions ?? 0,
    studySeconds: secondsByBucket.get(date) ?? 0
  }));

  const placementByMajor = new Map<string, { students: number; signups: number }>();
  const placementByInstitution = new Map<string, { students: number; signups: number }>();
  for (const row of placementRows) {
    const institutionTotal = placementByInstitution.get(row.institutionId) ?? {
      students: 0,
      signups: 0
    };
    institutionTotal.students += row.students;
    institutionTotal.signups += row.signups;
    placementByInstitution.set(row.institutionId, institutionTotal);
    const majorTotal = placementByMajor.get(row.majorId) ?? { students: 0, signups: 0 };
    majorTotal.students += row.students;
    majorTotal.signups += row.signups;
    placementByMajor.set(row.majorId, majorTotal);
  }
  const noCounts = { students: 0, signups: 0 };
  const institutions = placement.institutions.map((institution) => ({
    id: institution.id,
    name: { ar: institution.nameAr, en: institution.nameEn } as Name,
    ...(placementByInstitution.get(institution.id) ?? noCounts),
    majors: placement.majors
      .filter((major) => major.institutionId === institution.id)
      .map((major) => ({
        id: major.id,
        name: { ar: major.nameAr, en: major.nameEn } as Name,
        ...(placementByMajor.get(major.id) ?? noCounts)
      }))
  }));

  const chapterCounts = bySortedKey(
    chapterRows,
    (row) => `${row.courseId}/${row.chapterNumber}`
  );
  const courseCounts = bySortedKey(courseRows, (row) => row.courseId);
  const courses = catalog.courses
    .map((course) => ({
      id: course.id,
      code: course.code,
      name: { ar: course.nameAr, en: course.nameEn } as Name,
      heldSessions: courseCounts.get(course.id)?.heldSessions ?? 0,
      studySeconds: secondsByCourse.get(course.id) ?? 0,
      activeStudents: courseCounts.get(course.id)?.activeStudents ?? 0,
      chapters: catalog.chapters
        .filter((chapter) => chapter.courseId === course.id)
        .map((chapter) => {
          const key = `${course.id}/${chapter.number}`;

          return {
            number: chapter.number,
            title: { ar: chapter.titleAr, en: chapter.titleEn } as Name,
            published: chapter.published,
            heldSessions: chapterCounts.get(key)?.heldSessions ?? 0,
            studySeconds: secondsByChapter.get(key) ?? 0,
            activeStudents: chapterCounts.get(key)?.activeStudents ?? 0
          };
        })
    }))
    .sort((a, b) => b.heldSessions - a.heldSessions || a.code.localeCompare(b.code));

  return {
    range,
    timeZone: INSIGHTS_TIME_ZONE,
    bucket: window.bucket,
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    generatedAt: now.toISOString(),
    totals: {
      students,
      signups: signupRows.reduce((sum, row) => sum + row.signups, 0),
      activeStudents: totalRow.activeStudents,
      heldSessions: totalRow.heldSessions,
      studySeconds
    },
    series,
    institutions,
    courses,
    allowance
  };
}
