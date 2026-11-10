import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { chapter, course, institution, major, plan } from "../src/db/schema/index.js";
import { seed, seedCatalog, seedInstitutions, seedPlans } from "../src/db/seed.js";
import { freePlan, litePlan, planSeed, proPlan } from "../src/db/seed-data/plans.js";

// ADR 0007: the Catalog, Institutions and Majors are edited by hand with SQL, so a seed run only
// inserts what is missing. Plans are the exception and stay upserted.
describe("seed", () => {
  afterEach(async () => {
    await db
      .update(chapter)
      .set({ titleEn: "Units and Dimensions", published: true })
      .where(and(eq(chapter.courseId, "becan-test"), eq(chapter.number, 1)));
    await db
      .update(course)
      .set({ nameEn: "Principles of Accounting 1" })
      .where(eq(course.id, "acct-101"));
    await db
      .update(institution)
      .set({ nameEn: "King Saud University" })
      .where(eq(institution.id, "ksu"));
    await db
      .update(major)
      .set({ nameEn: "Computer Science" })
      .where(eq(major.id, "ksu-cs"));
    await db
      .update(plan)
      .set({ secondsPerPeriod: freePlan.secondsPerPeriod })
      .where(eq(plan.id, freePlan.id));
    await seedPlans();
  });

  it("leaves hand-edited Courses, Chapters, Institutions and Majors alone", async () => {
    await db.update(course).set({ nameEn: "Edited" }).where(eq(course.id, "acct-101"));
    await db
      .update(chapter)
      .set({ titleEn: "Edited", published: false })
      .where(and(eq(chapter.courseId, "becan-test"), eq(chapter.number, 1)));
    await db
      .update(institution)
      .set({ nameEn: "Edited" })
      .where(eq(institution.id, "ksu"));
    await db.update(major).set({ nameEn: "Edited" }).where(eq(major.id, "ksu-cs"));

    await seed();

    const [editedCourse] = await db
      .select()
      .from(course)
      .where(eq(course.id, "acct-101"));
    const [editedChapter] = await db
      .select()
      .from(chapter)
      .where(and(eq(chapter.courseId, "becan-test"), eq(chapter.number, 1)));
    const [editedInstitution] = await db
      .select()
      .from(institution)
      .where(eq(institution.id, "ksu"));
    const [editedMajor] = await db.select().from(major).where(eq(major.id, "ksu-cs"));
    expect(editedCourse?.nameEn).toBe("Edited");
    expect(editedChapter).toMatchObject({ titleEn: "Edited", published: false });
    expect(editedInstitution?.nameEn).toBe("Edited");
    expect(editedMajor?.nameEn).toBe("Edited");
  });

  it("inserts a missing Chapter, Course and Major", async () => {
    await db
      .delete(chapter)
      .where(and(eq(chapter.courseId, "acct-101"), eq(chapter.number, 10)));
    await db.delete(chapter).where(eq(chapter.courseId, "cs-101"));
    await db.delete(course).where(eq(course.id, "cs-101"));
    // Accounts reference Majors (restrict), so only remove Majors nobody holds.
    const removedMajors = await db
      .delete(major)
      .where(sql`NOT EXISTS (SELECT 1 FROM "user" WHERE "user"."major_id" = ${major.id})`)
      .returning({ id: major.id });
    expect(removedMajors.length).toBeGreaterThan(0);

    await seedInstitutions();
    await seedCatalog();

    const [restoredChapter] = await db
      .select()
      .from(chapter)
      .where(and(eq(chapter.courseId, "acct-101"), eq(chapter.number, 10)));
    const [restoredCourse] = await db
      .select()
      .from(course)
      .where(eq(course.id, "cs-101"));
    const restoredChapters = await db
      .select()
      .from(chapter)
      .where(eq(chapter.courseId, "cs-101"));
    const majorIds = (await db.select({ id: major.id }).from(major)).map((row) => row.id);
    expect(restoredChapter).toBeDefined();
    expect(restoredCourse).toBeDefined();
    expect(restoredChapters.length).toBeGreaterThan(0);
    expect(majorIds).toEqual(expect.arrayContaining(removedMajors.map((row) => row.id)));
  });

  it("still upserts Plans", async () => {
    await db.update(plan).set({ secondsPerPeriod: 1 }).where(eq(plan.id, freePlan.id));

    await seedPlans();

    const [free] = await db.select().from(plan).where(eq(plan.id, freePlan.id));
    expect(free?.secondsPerPeriod).toBe(freePlan.secondsPerPeriod);
  });

  it("upserts every column of all three Plans, including price and listing", async () => {
    await db
      .update(plan)
      .set({
        priceHalalas: 1,
        sortOrder: 9,
        isListed: false,
        featured: false,
        badgeAr: null,
        badgeEn: null,
        maxActiveEnrollments: 3
      })
      .where(eq(plan.id, litePlan.id));
    await db.update(plan).set({ priceHalalas: 5 }).where(eq(plan.id, proPlan.id));
    await db.delete(plan).where(eq(plan.id, proPlan.id));

    await seedPlans();

    const rows = await db.select().from(plan);
    for (const expected of planSeed) {
      expect(rows.find((row) => row.id === expected.id)).toEqual(expected);
    }
  });

  it("seeds Plans idempotently", async () => {
    await seedPlans();
    const first = await db.select().from(plan).orderBy(plan.id);
    await seedPlans();
    const second = await db.select().from(plan).orderBy(plan.id);

    expect(second).toEqual(first);
    expect(second.map((row) => row.id)).toEqual(["free", "lite", "pro"]);
  });
});
