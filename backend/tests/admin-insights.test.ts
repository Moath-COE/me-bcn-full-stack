import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import {
  plan,
  planAssignment,
  studySession,
  studySessionPresence,
  user
} from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { allowanceShare } from "../src/services/admin-insights.service.js";
import { insightsWindow } from "../src/utils/insights-range.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

const url = "/api/v1/admin/insights";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// The UTC instant of Riyadh midnight, `daysAgo` local days before today. Riyadh is UTC+3 all year.
function localMidnight(daysAgo: number, now = new Date()): Date {
  const local = new Date(now.getTime() + 3 * HOUR);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  return new Date(today - daysAgo * DAY - 3 * HOUR);
}

// The local date, `YYYY-MM-DD`, of the day that starts at `midnight`.
function localDate(midnight: Date): string {
  return new Date(midnight.getTime() + 3 * HOUR).toISOString().slice(0, 10);
}

// The Sunday on or before a `YYYY-MM-DD` date.
function sundayOnOrBefore(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);

  return new Date(ms - new Date(ms).getUTCDay() * DAY).toISOString().slice(0, 10);
}

let sequence = 0;

// A Student row inserted directly (no sign-in), so a test controls `createdAt`.
async function insertStudent(overrides: Partial<typeof user.$inferInsert> = {}) {
  sequence += 1;
  const id = `ins-${sequence}`;

  await db.insert(user).values({
    id,
    name: `Student ${sequence}`,
    email: `ins${sequence}@example.com`,
    phoneNumber: `+96653${String(sequence).padStart(7, "0")}`,
    institutionId: "ksu",
    majorId: "ksu-cs",
    ...overrides
  });

  return id;
}

// A Session first joined at `joinedAt` with one presence interval of `seconds`.
async function insertHeld(
  userId: string,
  joinedAt: Date,
  options: {
    courseId?: string;
    chapterNumber?: number;
    seconds?: number;
    kind?: "student" | "admin";
  } = {}
) {
  const seconds = options.seconds ?? 600;
  const [session] = await db
    .insert(studySession)
    .values({
      userId,
      courseId: options.courseId ?? "becan-test",
      chapterNumber: options.chapterNumber ?? 1,
      grantedSeconds: 1800,
      sessionLimit: "allowance",
      issuedAt: new Date(joinedAt.getTime() - 5000),
      firstJoinedAt: joinedAt,
      endedAt: new Date(joinedAt.getTime() + seconds * 1000),
      kind: options.kind ?? "student"
    })
    .returning();
  await db.insert(studySessionPresence).values({
    sessionId: session!.id,
    joinedAt,
    leftAt: new Date(joinedAt.getTime() + seconds * 1000)
  });

  return session!;
}

type Body = Awaited<ReturnType<typeof read>>["body"];

function read(cookie: string, query = "") {
  return request(app).get(`${url}${query}`).set("Cookie", cookie);
}

describe("insightsWindow", () => {
  const now = new Date("2026-10-25T15:40:00.000Z");

  it("covers the last 30 local days including today, one day bucket each", () => {
    const window = insightsWindow("30d", now);

    expect(window.bucket).toBe("day");
    expect(window.from.toISOString()).toBe("2026-09-25T21:00:00.000Z");
    expect(window.buckets).toHaveLength(30);
    expect(window.buckets[0]).toBe("2026-09-26");
    expect(window.buckets.at(-1)).toBe("2026-10-25");
  });

  it("reads the local day, not the UTC day", () => {
    // 21:30 UTC is already 00:30 the next day in Riyadh.
    const window = insightsWindow("7d", new Date("2026-10-25T21:30:00.000Z"));

    expect(window.buckets.at(-1)).toBe("2026-10-26");
    expect(window.from.toISOString()).toBe("2026-10-19T21:00:00.000Z");
  });

  it("starts each 90d week bucket on a Sunday, the first before the range start", () => {
    const window = insightsWindow("90d", now);

    // 2026-10-25 is a Sunday; the range starts on Tuesday 2026-07-28.
    expect(window.bucket).toBe("week");
    expect(window.from.toISOString()).toBe("2026-07-27T21:00:00.000Z");
    expect(window.buckets[0]).toBe("2026-07-26");
    expect(window.buckets.at(-1)).toBe("2026-10-25");
    expect(window.buckets).toHaveLength(14);
  });
});

describe("allowanceShare", () => {
  it("takes the larger share, rounds down and caps at 100", () => {
    expect(
      allowanceShare({ sessions: 1, seconds: 3000 }, { sessions: 6, seconds: 3600 })
    ).toEqual({ percent: 83, atLimit: false });
    expect(
      allowanceShare({ sessions: 9, seconds: 0 }, { sessions: 6, seconds: 3600 })
    ).toEqual({ percent: 100, atLimit: true });
  });

  it("ignores null limits, and a Plan with none is never at its limit", () => {
    expect(
      allowanceShare({ sessions: 50, seconds: 9999 }, { sessions: null, seconds: null })
    ).toEqual({ percent: 0, atLimit: false });
    expect(
      allowanceShare({ sessions: 3, seconds: 9999 }, { sessions: 6, seconds: null })
    ).toEqual({ percent: 50, atLimit: false });
  });
});

describe("GET /api/v1/admin/insights", () => {
  beforeEach(resetAccounts);

  describe("the Admin gate and the query", () => {
    it("answers 401 without a session", async () => {
      const response = await request(app).get(url).expect(401);

      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("refuses a Student with 403 ADMIN_PERMISSION_REQUIRED", async () => {
      const { cookie } = await signedInStudent();

      const response = await read(cookie).expect(403);

      expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
    });

    it("refuses an Admin without two-factor", async () => {
      const { body, cookie } = await signedInStudent();
      await promoteToAdmin(body.email);

      const response = await read(cookie).expect(403);

      expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
    });

    it("answers 400 INVALID_REQUEST for a bad range", async () => {
      const { cookie } = await adminWithTwoFactor();

      for (const range of ["1y", "", "7", "30D"]) {
        const response = await read(cookie, `?range=${range}`).expect(400);

        expect(response.body.error.code).toBe("INVALID_REQUEST");
      }
    });

    it("defaults to 30d and answers the contract's top level", async () => {
      const { cookie } = await adminWithTwoFactor();

      const response = await read(cookie).expect(200);

      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body).toMatchObject({
        range: "30d",
        timeZone: "Asia/Riyadh",
        bucket: "day",
        from: localMidnight(29).toISOString()
      });
      expect(response.body.series).toHaveLength(30);
      expect(Object.keys(response.body).sort()).toEqual(
        [
          "allowance",
          "bucket",
          "courses",
          "from",
          "generatedAt",
          "institutions",
          "range",
          "series",
          "timeZone",
          "to",
          "totals"
        ].sort()
      );
    });
  });

  describe("who is counted", () => {
    it("excludes Admin Accounts and Admin Sessions everywhere", async () => {
      const { cookie, userId: adminId } = await adminWithTwoFactor();
      const studentId = await insertStudent();
      const joinedAt = new Date(localMidnight(1).getTime() + 10 * HOUR);
      // An Admin studying as a Student-kind Session, and a Student's Admin Session.
      await insertHeld(adminId, joinedAt);
      await insertHeld(studentId, joinedAt, { kind: "admin" });
      await insertHeld(studentId, joinedAt);

      const { body } = await read(cookie).expect(200);

      expect(body.totals).toEqual({
        students: 1,
        signups: 1,
        activeStudents: 1,
        heldSessions: 1,
        studySeconds: 600
      });
      const free = body.allowance.plans.find(
        (entry: { id: string }) => entry.id === "free"
      );
      // The Student has no Plan assignment (inserted directly); the Admin is never counted.
      expect(free.students).toBe(0);
    });

    it("includes banned Students and counts Sessions that were never held out", async () => {
      const { cookie } = await adminWithTwoFactor();
      const studentId = await insertStudent({ banned: true });
      await db.insert(studySession).values({
        userId: studentId,
        courseId: "becan-test",
        chapterNumber: 1,
        grantedSeconds: 1800,
        sessionLimit: "allowance"
      });

      const { body } = await read(cookie).expect(200);

      expect(body.totals).toMatchObject({
        students: 1,
        activeStudents: 0,
        heldSessions: 0,
        studySeconds: 0
      });
    });
  });

  describe("day buckets in Riyadh time", () => {
    it("puts a Session at 22:30 UTC on the next local day and zero-fills the rest", async () => {
      const { cookie } = await adminWithTwoFactor();
      const studentId = await insertStudent({ createdAt: localMidnight(40) });
      // 22:30 UTC on the UTC day before local day D-2 is 01:30 local on D-2.
      const late = new Date(localMidnight(2).getTime() + 1.5 * HOUR);
      expect(late.toISOString().slice(11, 16)).toBe("22:30");
      // One millisecond before local midnight is still the previous local day.
      const early = new Date(localMidnight(2).getTime() - 1);
      await insertHeld(studentId, late, { seconds: 120 });
      await insertHeld(studentId, early, { seconds: 60 });

      const { body } = await read(cookie, "?range=30d").expect(200);

      const series = body.series as Body["series"];
      expect(series).toHaveLength(30);
      expect(series.map((entry: { date: string }) => entry.date)).toEqual(
        Array.from({ length: 30 }, (_, index) => localDate(localMidnight(29 - index)))
      );
      const byDate = new Map(
        series.map((entry: { date: string }) => [entry.date, entry])
      );
      expect(byDate.get(localDate(localMidnight(2)))).toEqual({
        date: localDate(localMidnight(2)),
        signups: 0,
        activeStudents: 1,
        heldSessions: 1,
        studySeconds: 120
      });
      expect(byDate.get(localDate(localMidnight(3)))).toMatchObject({
        heldSessions: 1,
        studySeconds: 60
      });
      const empty = series.filter(
        (entry: { heldSessions: number }) => entry.heldSessions === 0
      );
      expect(empty).toHaveLength(28);
      expect(
        empty.every((entry: { studySeconds: number }) => entry.studySeconds === 0)
      ).toBe(true);
      // One Active Student on two days is one in the total.
      expect(body.totals).toMatchObject({
        activeStudents: 1,
        heldSessions: 2,
        studySeconds: 180
      });
    });

    it("counts a Student once per bucket and signups by local day", async () => {
      const { cookie } = await adminWithTwoFactor();
      const day = localMidnight(5);
      const a = await insertStudent({ createdAt: new Date(day.getTime() - 1) });
      const b = await insertStudent({ createdAt: new Date(day.getTime() + HOUR) });
      await insertStudent({ createdAt: localMidnight(60) });
      await insertHeld(a, new Date(day.getTime() + 2 * HOUR));
      await insertHeld(a, new Date(day.getTime() + 3 * HOUR));
      await insertHeld(b, new Date(day.getTime() + 4 * HOUR));

      const { body } = await read(cookie, "?range=7d").expect(200);

      const byDate = new Map(
        body.series.map((entry: { date: string }) => [entry.date, entry])
      );
      expect(body.series).toHaveLength(7);
      expect(byDate.get(localDate(day))).toMatchObject({
        signups: 1,
        activeStudents: 2,
        heldSessions: 3
      });
      expect(byDate.get(localDate(localMidnight(6)))).toMatchObject({ signups: 1 });
      expect(body.totals).toMatchObject({ students: 3, signups: 2 });
    });

    it("leaves out Sessions before the range start", async () => {
      const { cookie } = await adminWithTwoFactor();
      const studentId = await insertStudent({ createdAt: localMidnight(100) });
      await insertHeld(studentId, new Date(localMidnight(7).getTime() - 1));
      await insertHeld(studentId, new Date(localMidnight(6).getTime() + HOUR));

      const { body } = await read(cookie, "?range=7d").expect(200);

      expect(body.totals.heldSessions).toBe(1);
    });
  });

  describe("week buckets", () => {
    it("starts every 90d bucket on a Sunday and counts only data inside the range", async () => {
      const { cookie } = await adminWithTwoFactor();
      const studentId = await insertStudent({ createdAt: localMidnight(200) });
      // Inside the range, mid-week.
      const inside = new Date(localMidnight(10).getTime() + 5 * HOUR);
      // Before the range start, but in the same week as the first bucket's start.
      const first = insightsWindow("90d", new Date()).buckets[0]!;
      const before = new Date(localMidnight(90).getTime() - HOUR);
      expect(localDate(localMidnight(90)) >= first).toBe(true);
      await insertHeld(studentId, inside, { seconds: 300 });
      await insertHeld(studentId, before, { seconds: 300 });

      const { body } = await read(cookie, "?range=90d").expect(200);

      expect(body.bucket).toBe("week");
      expect(body.from).toBe(localMidnight(89).toISOString());
      const dates = body.series.map((entry: { date: string }) => entry.date);
      expect(dates[0]).toBe(first);
      expect(dates.at(-1)).toBe(sundayOnOrBefore(localDate(localMidnight(0))));
      for (const date of dates) {
        expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(0);
      }
      for (let index = 1; index < dates.length; index += 1) {
        expect(Date.parse(dates[index]) - Date.parse(dates[index - 1])).toBe(7 * DAY);
      }
      const week = body.series.find(
        (entry: { date: string }) =>
          entry.date === sundayOnOrBefore(localDate(localMidnight(10)))
      );
      expect(week).toMatchObject({
        heldSessions: 1,
        activeStudents: 1,
        studySeconds: 300
      });
      expect(body.totals).toMatchObject({ heldSessions: 1, studySeconds: 300 });
    });
  });

  describe("Courses and Chapters", () => {
    it("lists every Course and Chapter, with counts, sorted by Held Sessions then code", async () => {
      const { cookie } = await adminWithTwoFactor();
      const a = await insertStudent();
      const b = await insertStudent();
      const at = new Date(localMidnight(1).getTime() + 8 * HOUR);
      await insertHeld(a, at, { courseId: "acct-101", chapterNumber: 2, seconds: 100 });
      await insertHeld(a, at, { courseId: "acct-101", chapterNumber: 2, seconds: 50 });
      await insertHeld(a, at, { courseId: "acct-101", chapterNumber: 3, seconds: 25 });
      await insertHeld(b, at, { courseId: "acct-101", chapterNumber: 2, seconds: 10 });
      await insertHeld(b, at, { courseId: "becan-test", chapterNumber: 1, seconds: 7 });
      // Outside the range and an Admin Session: neither counts.
      await insertHeld(b, localMidnight(60), { courseId: "econ-101", chapterNumber: 1 });
      await insertHeld(b, at, { courseId: "econ-101", chapterNumber: 1, kind: "admin" });

      const { body } = await read(cookie).expect(200);

      const courses = body.courses as {
        id: string;
        code: string;
        heldSessions: number;
        studySeconds: number;
        activeStudents: number;
        chapters: {
          number: number;
          published: boolean;
          heldSessions: number;
          studySeconds: number;
          activeStudents: number;
        }[];
      }[];
      expect(courses.map((course) => course.id).slice(0, 2)).toEqual([
        "acct-101",
        "becan-test"
      ]);
      // All other Courses are listed with no activity, by code.
      const rest = courses.slice(2);
      expect(rest.length).toBeGreaterThanOrEqual(2);
      expect(rest.every((course) => course.heldSessions === 0)).toBe(true);
      expect(rest.map((course) => course.code)).toEqual(
        [...rest.map((course) => course.code)].sort((x, y) => x.localeCompare(y))
      );

      const acct = courses[0]!;
      expect(acct).toMatchObject({
        heldSessions: 4,
        studySeconds: 185,
        activeStudents: 2
      });
      expect(acct.chapters.map((chapter) => chapter.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ]);
      expect(acct.chapters[0]).toMatchObject({
        published: false,
        heldSessions: 0,
        studySeconds: 0,
        activeStudents: 0
      });
      expect(acct.chapters[1]).toMatchObject({
        heldSessions: 3,
        studySeconds: 160,
        activeStudents: 2
      });
      expect(acct.chapters[2]).toMatchObject({
        heldSessions: 1,
        studySeconds: 25,
        activeStudents: 1
      });

      const test = courses[1]!;
      expect(test.chapters[0]).toMatchObject({
        published: true,
        heldSessions: 1,
        studySeconds: 7,
        activeStudents: 1
      });
      expect(test.chapters[0]).toHaveProperty("title.ar");
      expect(test).toHaveProperty("name.en");
      const econ = courses.find((course) => course.id === "econ-101")!;
      expect(econ.heldSessions).toBe(0);
      expect(econ.chapters.length).toBeGreaterThan(0);
    });

    it("counts study seconds as Usage does, capped at the grant", async () => {
      const { cookie } = await adminWithTwoFactor();
      const studentId = await insertStudent();
      const at = new Date(localMidnight(1).getTime() + 8 * HOUR);
      // 1800 seconds are granted; 5000 seconds of presence count as 1800.
      const session = await insertHeld(studentId, at, { seconds: 5000 });
      expect(session.grantedSeconds).toBe(1800);
      await db
        .update(studySession)
        .set({ endedAt: new Date(at.getTime() + 5000 * 1000) })
        .where(eq(studySession.id, session.id));

      const { body } = await read(cookie).expect(200);

      expect(body.totals.studySeconds).toBe(1800);
    });
  });

  describe("Institutions and Majors", () => {
    it("lists every Institution and Major with all-time Students and in-range signups", async () => {
      const { cookie } = await adminWithTwoFactor();
      await insertStudent({ institutionId: "ksu", majorId: "ksu-cs" });
      await insertStudent({ institutionId: "ksu", majorId: "ksu-cs" });
      await insertStudent({
        institutionId: "ksu",
        majorId: "ksu-is",
        createdAt: localMidnight(100)
      });
      await insertStudent({ institutionId: "kau", majorId: "kau-it" });

      const { body } = await read(cookie).expect(200);

      const institutions = body.institutions as {
        id: string;
        name: { ar: string; en: string };
        students: number;
        signups: number;
        majors: { id: string; students: number; signups: number }[];
      }[];
      const ksu = institutions.find((entry) => entry.id === "ksu")!;
      expect(ksu).toMatchObject({ students: 3, signups: 2 });
      expect(ksu.name).toEqual({ ar: expect.any(String), en: expect.any(String) });
      expect(ksu.majors.map((major) => major.id)).toEqual([
        "ksu-cs",
        "ksu-is",
        "ksu-se",
        "ksu-med",
        "ksu-ba"
      ]);
      expect(ksu.majors.find((major) => major.id === "ksu-cs")).toMatchObject({
        students: 2,
        signups: 2
      });
      expect(ksu.majors.find((major) => major.id === "ksu-is")).toMatchObject({
        students: 1,
        signups: 0
      });
      expect(ksu.majors.find((major) => major.id === "ksu-se")).toMatchObject({
        students: 0,
        signups: 0
      });
      expect(institutions.find((entry) => entry.id === "kau")).toMatchObject({
        students: 1,
        signups: 1
      });
      expect(institutions.find((entry) => entry.id === "imamu")).toMatchObject({
        students: 0,
        signups: 0
      });
    });
  });

  describe("Allowance", () => {
    function expectedBand(allowance: {
      limits: { sessions: number | null; seconds: number | null };
      usage: { sessions: number; seconds: number };
    }) {
      const { percent, atLimit } = allowanceShare(allowance.usage, allowance.limits);
      const band =
        percent === 0
          ? "0"
          : percent <= 25
            ? "1-25"
            : percent <= 50
              ? "26-50"
              : percent <= 75
                ? "51-75"
                : percent < 100
                  ? "76-99"
                  : "100";

      return { band, atLimit };
    }

    async function issue(userId: string, issuedAt: Date, held: boolean, seconds = 0) {
      const [session] = await db
        .insert(studySession)
        .values({
          userId,
          courseId: "becan-test",
          chapterNumber: 1,
          grantedSeconds: 1800,
          sessionLimit: "allowance",
          issuedAt,
          firstJoinedAt: held ? issuedAt : null,
          endedAt: held ? new Date(issuedAt.getTime() + seconds * 1000) : null
        })
        .returning();
      if (held && seconds > 0) {
        await db.insert(studySessionPresence).values({
          sessionId: session!.id,
          joinedAt: issuedAt,
          leftAt: new Date(issuedAt.getTime() + seconds * 1000)
        });
      }
    }

    it("bands each Student by the same Usage that GET /me/allowance reports", async () => {
      const { cookie } = await adminWithTwoFactor();
      const hour = new Date(Date.now() - HOUR);
      const students = await Promise.all(
        Array.from({ length: 5 }, () => signedInStudent())
      );
      const idOf = async (email: string) =>
        (await db.select().from(user).where(eq(user.email, email)))[0]!.id;
      const [unused, some, half, full, over] = students as [
        (typeof students)[number],
        (typeof students)[number],
        (typeof students)[number],
        (typeof students)[number],
        (typeof students)[number]
      ];
      // Sign-up just happened, so move every Period's start back to cover the Sessions below.
      await db.update(planAssignment).set({ startsAt: new Date(Date.now() - 10 * DAY) });
      // "some": one Session, 100 seconds -> 16%.
      await issue(await idOf(some.body.email), hour, true, 100);
      // "half": three Sessions of 600 seconds -> 50% of the sessions limit, 50% of seconds.
      for (const offset of [0, 1, 2]) {
        await issue(
          await idOf(half.body.email),
          new Date(hour.getTime() - offset * 1000 * 700),
          true,
          600
        );
      }
      // "full": six Sessions, exactly at the sessions limit.
      for (let index = 0; index < 6; index += 1) {
        await issue(
          await idOf(full.body.email),
          new Date(hour.getTime() - index * 5000),
          true,
          1
        );
      }
      // "over": 3600 seconds of presence across three Sessions, exactly at the seconds limit.
      for (let index = 0; index < 3; index += 1) {
        await issue(
          await idOf(over.body.email),
          new Date(hour.getTime() - index * 1000 * 2000),
          true,
          1200
        );
      }
      // A held Session that was never joined still counts toward Sessions started.
      await issue(await idOf(unused.body.email), new Date(Date.now() - 60 * 1000), false);

      const expected = { atLimit: 0, bands: new Map<string, number>() };
      for (const student of students) {
        const { body: allowance } = await student.agent
          .get("/api/v1/me/allowance")
          .expect(200);
        const { band, atLimit } = expectedBand(allowance);
        expected.atLimit += Number(atLimit);
        expected.bands.set(band, (expected.bands.get(band) ?? 0) + 1);
      }
      expect(expected.atLimit).toBe(2);

      const { body } = await read(cookie).expect(200);

      const free = body.allowance.plans.find(
        (entry: { id: string }) => entry.id === "free"
      );
      expect(free.students).toBe(5);
      expect(free.atLimit).toBe(expected.atLimit);
      expect(free.usage.map((entry: { band: string }) => entry.band)).toEqual([
        "0",
        "1-25",
        "26-50",
        "51-75",
        "76-99",
        "100"
      ]);
      expect(
        Object.fromEntries(
          free.usage.map((entry: { band: string; students: number }) => [
            entry.band,
            entry.students
          ])
        )
      ).toEqual({
        "0": expected.bands.get("0") ?? 0,
        "1-25": expected.bands.get("1-25") ?? 0,
        "26-50": expected.bands.get("26-50") ?? 0,
        "51-75": expected.bands.get("51-75") ?? 0,
        "76-99": expected.bands.get("76-99") ?? 0,
        "100": expected.bands.get("100") ?? 0
      });
      // Pinned values, so the helper above cannot hide a shared mistake.
      expect(expected.bands.get("100")).toBe(2);
      expect(expected.bands.get("26-50")).toBe(1);
      expect(expected.bands.get("1-25")).toBe(2);
      expect(expected.bands.get("0")).toBeUndefined();
    });

    it("counts only Sessions issued in the current Period", async () => {
      const { cookie } = await adminWithTwoFactor();
      const student = await signedInStudent();
      const [row] = await db
        .select()
        .from(user)
        .where(eq(user.email, student.body.email));
      // Assigned 45 days ago: the current Period began 15 days ago.
      await db
        .update(planAssignment)
        .set({ startsAt: new Date(Date.now() - 45 * DAY) })
        .where(eq(planAssignment.userId, row!.id));
      await issue(row!.id, new Date(Date.now() - 20 * DAY), true, 600);
      await issue(row!.id, new Date(Date.now() - 5 * DAY), true, 600);
      await issue(row!.id, new Date(Date.now() - 4 * DAY), true, 600);

      const { body: allowance } = await student.agent
        .get("/api/v1/me/allowance")
        .expect(200);
      expect(allowance.usage).toMatchObject({ sessions: 2, seconds: 1200 });

      const { body } = await read(cookie).expect(200);
      const free = body.allowance.plans.find(
        (entry: { id: string }) => entry.id === "free"
      );
      // 2 of 6 Sessions = 33%, 1200 of 3600 seconds = 33%.
      expect(
        free.usage.find((entry: { band: string }) => entry.band === "26-50")
      ).toEqual({
        band: "26-50",
        students: 1
      });
      // The 20 days ago Session is outside this Period, but inside the 30d range of Insights.
      expect(body.totals.heldSessions).toBe(3);
    });

    it("lists every Plan, and a Plan with no limits is band 0 and never at its limit", async () => {
      const { cookie } = await adminWithTwoFactor();
      const planId = "insights-open-test";
      const student = await signedInStudent();
      const [row] = await db
        .select()
        .from(user)
        .where(eq(user.email, student.body.email));
      await db.insert(plan).values({
        id: planId,
        nameAr: "باقة مفتوحة",
        nameEn: "Open test",
        sessionsPerPeriod: null,
        secondsPerPeriod: null,
        maxSessionSeconds: 1800
      });
      try {
        await db
          .update(planAssignment)
          .set({ planId })
          .where(eq(planAssignment.userId, row!.id));
        await issue(row!.id, new Date(Date.now() - HOUR), true, 900);

        const { body } = await read(cookie).expect(200);

        const open = body.allowance.plans.find(
          (entry: { id: string }) => entry.id === planId
        );
        expect(open).toMatchObject({
          name: { ar: "باقة مفتوحة", en: "Open test" },
          students: 1,
          atLimit: 0
        });
        expect(open.usage).toEqual([
          { band: "0", students: 1 },
          { band: "1-25", students: 0 },
          { band: "26-50", students: 0 },
          { band: "51-75", students: 0 },
          { band: "76-99", students: 0 },
          { band: "100", students: 0 }
        ]);
        const free = body.allowance.plans.find(
          (entry: { id: string }) => entry.id === "free"
        );
        expect(free).toMatchObject({ students: 0, atLimit: 0 });
      } finally {
        await db.delete(planAssignment).where(eq(planAssignment.userId, row!.id));
        await db.delete(plan).where(eq(plan.id, planId));
      }
    });
  });
});
