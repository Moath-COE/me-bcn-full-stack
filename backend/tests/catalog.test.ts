import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app.js";
import type { ChapterDto, CourseSummary } from "../src/services/catalog.service.js";

const cacheControl = "public, max-age=60, s-maxage=300";
const ksuCourses = [
  "becan-test",
  "acct-101",
  "econ-101",
  "mgt-101",
  "math-101",
  "chem-101",
  "cs-101"
];
const kauCourses = ["phys-101", "stat-101", "ee-201"];

describe("Catalog", () => {
  it("lists every Course in Institution and Course display order with localized summaries and counts", async () => {
    const response = await request(app).get("/api/v1/courses").expect(200);
    const courses: CourseSummary[] = response.body;

    expect(courses.map((course) => course.id)).toEqual([...ksuCourses, ...kauCourses]);
    expect(courses[0]).toEqual({
      id: "becan-test",
      code: "TEST 101",
      name: { ar: "مقرر تجريبي — فيزياء عامة", en: "Test Course — General Physics" },
      institution: {
        id: "ksu",
        name: { ar: "جامعة الملك سعود", en: "King Saud University" }
      },
      icon: "atom",
      tone: "deep",
      chapterCount: 1,
      publishedChapterCount: 1
    });
    expect(courses[1]).toEqual({
      id: "acct-101",
      code: "ACCT 101",
      name: { ar: "مبادئ المحاسبة 1", en: "Principles of Accounting 1" },
      institution: {
        id: "ksu",
        name: { ar: "جامعة الملك سعود", en: "King Saud University" }
      },
      icon: "coins",
      tone: "deep",
      chapterCount: 10,
      publishedChapterCount: 0
    });
    expect(courses.slice(1).every((course) => course.publishedChapterCount === 0)).toBe(
      true
    );
    expect(response.headers["cache-control"]).toBe(cacheControl);
  });

  it.each([
    ["ksu", ksuCourses],
    ["kau", kauCourses]
  ])("filters by Institution %s", async (institution, ids) => {
    const response = await request(app)
      .get("/api/v1/courses")
      .query({ institution })
      .expect(200);
    const courses: CourseSummary[] = response.body;

    expect(courses.map((course) => course.id)).toEqual(ids);
    expect(courses.every((course) => course.institution.id === institution)).toBe(true);
    expect(response.headers["cache-control"]).toBe(cacheControl);
  });

  it("returns an empty list for an unknown Institution", async () => {
    const response = await request(app)
      .get("/api/v1/courses?institution=unknown")
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it.each(["Bad Slug", "", "a".repeat(81), "-ksu"])(
    "rejects the invalid Institution slug %j",
    async (institution) => {
      const response = await request(app)
        .get("/api/v1/courses")
        .query({ institution })
        .expect(400);
      expect(response.body.error.message).toBe("Invalid request");
    }
  );

  it("rejects repeated Institution query parameters", async () => {
    await request(app).get("/api/v1/courses?institution=ksu&institution=kau").expect(400);
  });

  it("returns ordered Chapters with the copied minutes and lesson counts", async () => {
    const response = await request(app).get("/api/v1/courses/acct-101").expect(200);
    const chapters: ChapterDto[] = response.body.chapters;

    expect(response.body).toMatchObject({
      id: "acct-101",
      chapterCount: 10,
      publishedChapterCount: 0
    });
    expect(chapters.map((chapter) => chapter.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    ]);
    expect(chapters[0]).toEqual({
      number: 1,
      title: { ar: "المعادلة المحاسبية", en: "The Accounting Equation" },
      minutes: 20,
      lessonCount: 9,
      published: false
    });
    expect(chapters[2]).toEqual({
      number: 3,
      title: { ar: "الأصول والخصوم", en: "Assets and Liabilities" },
      minutes: 25,
      lessonCount: 12,
      published: false
    });
    expect(chapters.every((chapter) => chapter.published === false)).toBe(true);
    expect(response.headers["cache-control"]).toBe(cacheControl);
  });

  it("publishes the becan-test Chapter", async () => {
    const response = await request(app).get("/api/v1/courses/becan-test").expect(200);
    expect(response.body.chapters).toEqual([
      {
        number: 1,
        title: { ar: "الوحدات والأبعاد", en: "Units and Dimensions" },
        minutes: 20,
        lessonCount: 2,
        published: true
      }
    ]);
    expect(response.headers["cache-control"]).toBe(cacheControl);
  });

  it("returns COURSE_NOT_FOUND for an unknown Course", async () => {
    const response = await request(app).get("/api/v1/courses/unknown").expect(404);
    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
  });
});
