import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { resetAccounts, signedInStudent } from "./support/accounts.js";
import { adminWithTwoFactor } from "./support/two-factor.js";

const accountsUrl = "/api/v1/admin/accounts";

let sequence = 0;

// Inserts a user row directly, so a test controls every field the list filters and sorts on.
async function insertAccount(overrides: Partial<typeof user.$inferInsert> = {}) {
  sequence += 1;
  const id = `acct-${sequence}`;

  await db.insert(user).values({
    id,
    name: `Person ${sequence}`,
    email: `person${sequence}@example.com`,
    phoneNumber: `+96651${String(sequence).padStart(7, "0")}`,
    institutionId: "ksu",
    majorId: "ksu-cs",
    ...overrides
  });

  return id;
}

type ListedAccount = { id: string; name: string; email: string };

function ids(body: { accounts: ListedAccount[] }, prefix = ""): string[] {
  return body.accounts.map((account) => account.id).filter((id) => id.startsWith(prefix));
}

describe("GET /api/v1/admin/accounts", () => {
  beforeEach(resetAccounts);

  function read(cookie: string, query = "") {
    return request(app).get(`${accountsUrl}${query}`).set("Cookie", cookie);
  }

  // The Admin is itself a row in the list; tests look only at the rows they inserted (`acct-`).
  async function admin() {
    return adminWithTwoFactor();
  }

  describe("the Admin gate", () => {
    it("answers 401 UNAUTHENTICATED without a session", async () => {
      const response = await request(app).get(accountsUrl).expect(401);

      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("refuses a Student with ADMIN_PERMISSION_REQUIRED", async () => {
      const { cookie } = await signedInStudent();

      const response = await read(cookie).expect(403);

      expect(response.body.error.code).toBe("ADMIN_PERMISSION_REQUIRED");
    });

    it("refuses an Admin without two-factor with ADMIN_TWO_FACTOR_REQUIRED", async () => {
      const { body, cookie } = await signedInStudent();
      await promoteToAdmin(body.email);

      const response = await read(cookie).expect(403);

      expect(response.body.error.code).toBe("ADMIN_TWO_FACTOR_REQUIRED");
    });
  });

  it("returns each Account with its Institution and Major and no secret fields", async () => {
    const { cookie } = await admin();
    const banExpires = new Date("2027-01-01T00:00:00Z");
    const id = await insertAccount({
      name: "سارة",
      email: "sara@example.com",
      phoneNumber: "+966512345678",
      emailVerified: true,
      role: "user",
      banned: true,
      banReason: "private reason",
      banExpires,
      twoFactorEnabled: true,
      institutionId: "kau",
      majorId: "kau-med",
      createdAt: new Date("2026-10-01T09:00:00Z")
    });

    const response = await read(cookie, "?search=sara@example").expect(200);

    expect(response.body).toEqual({
      accounts: [
        {
          id,
          name: "سارة",
          email: "sara@example.com",
          emailVerified: true,
          phoneNumber: "+966512345678",
          role: "user",
          banned: true,
          banExpires: "2027-01-01T00:00:00.000Z",
          twoFactorEnabled: true,
          createdAt: "2026-10-01T09:00:00.000Z",
          institution: {
            id: "kau",
            name: { ar: expect.any(String), en: expect.any(String) }
          },
          major: { id: "kau-med", name: { ar: "الطب", en: "Medicine" } }
        }
      ],
      total: 1,
      limit: 25,
      offset: 0
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("includes the signed-in Admin and never returns password, token or secret fields", async () => {
    const { cookie, userId } = await admin();

    const response = await read(cookie).expect(200);

    expect(ids(response.body)).toContain(userId);
    const text = JSON.stringify(response.body);
    for (const field of ["password", "token", "secret", "backupCodes", "banReason"]) {
      expect(text).not.toContain(field);
    }
    expect(Object.keys(response.body.accounts[0]).sort()).toEqual(
      [
        "banExpires",
        "banned",
        "createdAt",
        "email",
        "emailVerified",
        "id",
        "institution",
        "major",
        "name",
        "phoneNumber",
        "role",
        "twoFactorEnabled"
      ].sort()
    );
  });

  describe("filters", () => {
    it("filters by role", async () => {
      const { cookie, userId } = await admin();
      const student = await insertAccount();

      const admins = await read(cookie, "?role=admin").expect(200);
      expect(ids(admins.body)).toEqual([userId]);
      expect(admins.body.total).toBe(1);

      const students = await read(cookie, "?role=user").expect(200);
      expect(ids(students.body)).toEqual([student]);
    });

    it("filters by institution", async () => {
      const { cookie } = await admin();
      const kau = await insertAccount({ institutionId: "kau", majorId: "kau-cs" });
      await insertAccount();

      const response = await read(cookie, "?institutionId=kau").expect(200);

      expect(ids(response.body)).toEqual([kau]);
      expect(response.body.total).toBe(1);
    });

    it("filters by major", async () => {
      const { cookie } = await admin();
      const is = await insertAccount({ majorId: "ksu-is" });
      await insertAccount({ majorId: "ksu-cs" });

      const response = await read(cookie, "?majorId=ksu-is").expect(200);

      expect(ids(response.body)).toEqual([is]);
    });

    it("filters by ban status", async () => {
      const { cookie, userId } = await admin();
      const banned = await insertAccount({ banned: true });
      const free = await insertAccount();

      const bannedOnly = await read(cookie, "?banned=true").expect(200);
      expect(ids(bannedOnly.body)).toEqual([banned]);

      const notBanned = await read(cookie, "?banned=false&sortBy=email").expect(200);
      expect(ids(notBanned.body).sort()).toEqual([free, userId].sort());
      expect(notBanned.body.total).toBe(2);
    });

    it("combines filters and search", async () => {
      const { cookie } = await admin();
      const match = await insertAccount({
        name: "Layla Match",
        institutionId: "kau",
        majorId: "kau-cs",
        banned: true
      });
      await insertAccount({
        name: "Layla Unbanned",
        institutionId: "kau",
        majorId: "kau-cs"
      });
      await insertAccount({ name: "Layla Other", institutionId: "ksu", banned: true });
      await insertAccount({
        name: "Omar Match",
        institutionId: "kau",
        majorId: "kau-cs",
        banned: true
      });

      const response = await read(
        cookie,
        "?search=layla&role=user&institutionId=kau&majorId=kau-cs&banned=true"
      ).expect(200);

      expect(ids(response.body)).toEqual([match]);
      expect(response.body.total).toBe(1);
    });
  });

  describe("search", () => {
    it("matches the name, case-insensitively, as a substring", async () => {
      const { cookie } = await admin();
      const match = await insertAccount({ name: "Abdulrahman Al-Salem" });
      await insertAccount({ name: "Someone Else" });

      const response = await read(cookie, "?search=DULRAH").expect(200);

      expect(ids(response.body)).toEqual([match]);
    });

    it("matches an Arabic name", async () => {
      const { cookie } = await admin();
      const match = await insertAccount({ name: "محمد الأحمد" });
      await insertAccount();

      const response = await read(
        cookie,
        `?search=${encodeURIComponent("الأحمد")}`
      ).expect(200);

      expect(ids(response.body)).toEqual([match]);
    });

    it("matches the email, case-insensitively", async () => {
      const { cookie } = await admin();
      const match = await insertAccount({ email: "unique.address@example.org" });
      await insertAccount();

      const response = await read(cookie, "?search=UNIQUE.ADDRESS@").expect(200);

      expect(ids(response.body)).toEqual([match]);
    });

    it("matches part of the phone number", async () => {
      const { cookie } = await admin();
      const match = await insertAccount({ phoneNumber: "+966599887766" });
      await insertAccount();

      const response = await read(
        cookie,
        `?search=${encodeURIComponent("98877")}`
      ).expect(200);

      expect(ids(response.body)).toEqual([match]);
    });

    it("treats % and _ as plain characters", async () => {
      const { cookie } = await admin();
      const literal = await insertAccount({ name: "100% sure" });
      await insertAccount({ name: "1000 sure" });
      const underscore = await insertAccount({ name: "a_b" });
      await insertAccount({ name: "axb" });

      const percent = await read(cookie, `?search=${encodeURIComponent("0% s")}`).expect(
        200
      );
      expect(ids(percent.body)).toEqual([literal]);

      const under = await read(cookie, "?search=a_b").expect(200);
      expect(ids(under.body)).toEqual([underscore]);
    });

    it("returns nothing for a search that matches no one", async () => {
      const { cookie } = await admin();

      const response = await read(cookie, "?search=zzzznomatch").expect(200);

      expect(response.body).toEqual({ accounts: [], total: 0, limit: 25, offset: 0 });
    });
  });

  describe("sorting and paging", () => {
    async function seedThree() {
      const b = await insertAccount({
        name: "Bravo",
        email: "c@example.com",
        createdAt: new Date("2026-01-02T00:00:00Z")
      });
      const c = await insertAccount({
        name: "Charlie",
        email: "a@example.com",
        createdAt: new Date("2026-01-03T00:00:00Z")
      });
      const a = await insertAccount({
        name: "Alpha",
        email: "b@example.com",
        createdAt: new Date("2026-01-01T00:00:00Z")
      });

      return { a, b, c };
    }

    // Sorting is checked on the inserted rows alone, by searching for their shared domain.
    const only = "search=example.com&role=user";

    it("sorts by creation date, newest first by default", async () => {
      const { cookie } = await admin();
      const { a, b, c } = await seedThree();

      const response = await read(cookie, `?${only}`).expect(200);

      expect(ids(response.body, "acct-")).toEqual([c, b, a]);
    });

    it("sorts by creation date ascending", async () => {
      const { cookie } = await admin();
      const { a, b, c } = await seedThree();

      const response = await read(cookie, `?${only}&sortDirection=asc`).expect(200);

      expect(ids(response.body, "acct-")).toEqual([a, b, c]);
    });

    it("sorts by name in both directions", async () => {
      const { cookie } = await admin();
      const { a, b, c } = await seedThree();

      const asc = await read(cookie, `?${only}&sortBy=name&sortDirection=asc`).expect(
        200
      );
      expect(ids(asc.body, "acct-")).toEqual([a, b, c]);

      const desc = await read(cookie, `?${only}&sortBy=name&sortDirection=desc`).expect(
        200
      );
      expect(ids(desc.body, "acct-")).toEqual([c, b, a]);
    });

    it("sorts by email in both directions", async () => {
      const { cookie } = await admin();
      const { a, b, c } = await seedThree();

      const asc = await read(cookie, `?${only}&sortBy=email&sortDirection=asc`).expect(
        200
      );
      expect(ids(asc.body, "acct-")).toEqual([c, a, b]);

      const desc = await read(cookie, `?${only}&sortBy=email&sortDirection=desc`).expect(
        200
      );
      expect(ids(desc.body, "acct-")).toEqual([b, a, c]);
    });

    it("pages with limit and offset and keeps the total", async () => {
      const { cookie } = await admin();
      const created = [];
      for (let index = 0; index < 5; index += 1) {
        created.push(
          await insertAccount({ createdAt: new Date(Date.UTC(2026, 0, index + 1)) })
        );
      }
      // Newest first: created[4] ... created[0].
      const newestFirst = [...created].reverse();
      const query = "search=example.com&role=user&limit=2";

      const first = await read(cookie, `?${query}&offset=0`).expect(200);
      expect(first.body).toMatchObject({ total: 5, limit: 2, offset: 0 });
      expect(ids(first.body)).toEqual(newestFirst.slice(0, 2));

      const second = await read(cookie, `?${query}&offset=2`).expect(200);
      expect(ids(second.body)).toEqual(newestFirst.slice(2, 4));

      const last = await read(cookie, `?${query}&offset=4`).expect(200);
      expect(ids(last.body)).toEqual(newestFirst.slice(4));
      expect(last.body.total).toBe(5);

      const past = await read(cookie, `?${query}&offset=10`).expect(200);
      expect(past.body).toMatchObject({ accounts: [], total: 5, offset: 10 });
    });

    it("breaks ties on the sort key by id, so pages never repeat a row", async () => {
      const { cookie } = await admin();
      const sameTime = new Date("2026-02-02T00:00:00Z");
      for (let index = 0; index < 4; index += 1) {
        await insertAccount({ createdAt: sameTime });
      }
      const query = "search=example.com&role=user&limit=2";

      const first = await read(cookie, `?${query}&offset=0`).expect(200);
      const second = await read(cookie, `?${query}&offset=2`).expect(200);

      expect(new Set([...ids(first.body), ...ids(second.body)]).size).toBe(4);
    });

    it("uses the defaults: 25 per page, newest first", async () => {
      const { cookie } = await admin();

      const response = await read(cookie).expect(200);

      expect(response.body).toMatchObject({ limit: 25, offset: 0 });
    });
  });

  describe("invalid queries", () => {
    it.each([
      "limit=0",
      "limit=101",
      "offset=-1",
      "role=owner",
      "banned=maybe",
      "sortBy=password",
      "sortDirection=up",
      "search="
    ])("answers 400 for ?%s", async (query) => {
      const { cookie } = await admin();

      await read(cookie, `?${query}`).expect(400);
    });

    it("accepts the maximum limit", async () => {
      const { cookie } = await admin();

      const response = await read(cookie, "?limit=100").expect(200);

      expect(response.body.limit).toBe(100);
    });
  });
});
