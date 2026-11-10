import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";

import { logger } from "../config/logger.js";
import { db } from "./index.js";
import { chapter, course, institution, major, plan } from "./schema/index.js";
import { catalogSeed } from "./seed-data/catalog.js";
import { institutionSeed } from "./seed-data/institutions.js";
import { planSeed } from "./seed-data/plans.js";

// Inserts only the rows that are missing (ON CONFLICT DO NOTHING) and never overwrites, so a
// hand-edited Institution or Major in a deployed database survives every seed run (ADR 0007).
// Editing a row in seed-data/ changes nothing in a database that already has it.
export async function seedInstitutions(): Promise<void> {
  const institutionRows = institutionSeed.map(({ majors: _majors, ...row }, index) => ({
    ...row,
    sortOrder: index * 10
  }));

  const majorRows = institutionSeed.flatMap(({ id: institutionId, majors }) =>
    majors.map((row, index) => ({ ...row, institutionId, sortOrder: index * 10 }))
  );

  const inserted = await db.transaction(async (tx) => {
    const institutions = await tx
      .insert(institution)
      .values(institutionRows)
      .onConflictDoNothing({ target: institution.id })
      .returning({ id: institution.id });

    const majors = await tx
      .insert(major)
      .values(majorRows)
      .onConflictDoNothing({ target: major.id })
      .returning({ id: major.id });

    return { institutions: institutions.length, majors: majors.length };
  });

  logger.info(
    { seeded: institutionRows.length + majorRows.length, inserted },
    "Seeded institutions and majors (missing rows only)"
  );
}

// Inserts only the Courses and Chapters that are missing; never overwrites or deletes (ADR 0007).
// In particular a Chapter's `published` flag, set by hand, is never reset by a seed run.
export async function seedCatalog(): Promise<void> {
  const courseRows = catalogSeed.map(({ chapters: _chapters, ...row }, index) => ({
    ...row,
    sortOrder: index * 10
  }));
  const chapterRows = catalogSeed.flatMap(({ id: courseId, chapters }) =>
    chapters.map((row) => ({ ...row, courseId }))
  );

  const inserted = await db.transaction(async (tx) => {
    const courses = await tx
      .insert(course)
      .values(courseRows)
      .onConflictDoNothing({ target: course.id })
      .returning({ id: course.id });
    const chapters = await tx
      .insert(chapter)
      .values(chapterRows)
      .onConflictDoNothing({ target: [chapter.courseId, chapter.number] })
      .returning({ courseId: chapter.courseId });

    return { courses: courses.length, chapters: chapters.length };
  });

  logger.info(
    { seeded: courseRows.length + chapterRows.length, inserted },
    "Seeded catalog (missing rows only)"
  );
}

// Plans stay upserted: the code is their source of truth. Never deletes Plans or changes assignments.
export async function seedPlans(): Promise<void> {
  await db
    .insert(plan)
    .values(planSeed)
    .onConflictDoUpdate({
      target: plan.id,
      set: {
        nameAr: sql`excluded.name_ar`,
        nameEn: sql`excluded.name_en`,
        priceHalalas: sql`excluded.price_halalas`,
        sessionsPerPeriod: sql`excluded.sessions_per_period`,
        secondsPerPeriod: sql`excluded.seconds_per_period`,
        maxActiveEnrollments: sql`excluded.max_active_enrollments`,
        maxSessionSeconds: sql`excluded.max_session_seconds`,
        minStartSeconds: sql`excluded.min_start_seconds`,
        sortOrder: sql`excluded.sort_order`,
        isListed: sql`excluded.is_listed`,
        featured: sql`excluded.featured`,
        badgeAr: sql`excluded.badge_ar`,
        badgeEn: sql`excluded.badge_en`
      }
    });

  logger.info({ planIds: planSeed.map((row) => row.id) }, "Seeded Plans");
}

export async function seed(): Promise<void> {
  await seedInstitutions();
  await seedCatalog();
  await seedPlans();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await seed();
  } finally {
    await db.$client.end();
  }
}
