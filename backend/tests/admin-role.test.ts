import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/index.js";
import { promoteToAdmin } from "../src/services/account.service.js";
import { accountHasPermission } from "../src/services/permission.service.js";
import {
  resetAccounts,
  signedInStudent,
  signUp,
  signUpBody
} from "./support/accounts.js";
import { testDatabaseUrl } from "./support/test-database-url.js";

const run = promisify(execFile);

async function storedRole(userId: string) {
  const row = await db.query.user.findFirst({
    columns: { role: true, banned: true },
    where: { id: userId }
  });

  return row;
}

describe("Admin Role", () => {
  beforeEach(resetAccounts);

  it("gives a new Account the Student Role and no Ban", async () => {
    const response = await signUp(signUpBody()).expect(200);

    expect(await storedRole(response.body.user.id)).toEqual({
      role: "user",
      banned: false
    });
  });

  it("keeps sign-in working and reports the Student Role on the session", async () => {
    const { agent } = await signedInStudent();

    const session = await agent
      .get("/api/auth/get-session?disableCookieCache=true")
      .set("Origin", "http://localhost:3001")
      .expect(200);

    expect(session.body.user).toMatchObject({ role: "user", banned: false });
  });

  it("denies a Student every permission", async () => {
    const response = await signUp(signUpBody()).expect(200);
    const userId = response.body.user.id;

    expect(await accountHasPermission(userId, { tutor: ["unlimited"] })).toBe(false);
    expect(await accountHasPermission(userId, { course: ["update"] })).toBe(false);
    expect(await accountHasPermission(userId, { user: ["list"] })).toBe(false);
  });

  it("grants an Admin tutor:unlimited and course:update but not impersonation or passwords", async () => {
    const body = signUpBody();
    const response = await signUp(body).expect(200);
    const userId = response.body.user.id;

    await promoteToAdmin(body.email);

    expect(await accountHasPermission(userId, { tutor: ["unlimited"] })).toBe(true);
    expect(await accountHasPermission(userId, { course: ["update"] })).toBe(true);
    expect(
      await accountHasPermission(userId, { course: ["create", "publish"], user: ["ban"] })
    ).toBe(true);
    expect(await accountHasPermission(userId, { user: ["impersonate"] })).toBe(false);
    expect(await accountHasPermission(userId, { user: ["set-password"] })).toBe(false);
  });

  it("answers false for an Account that does not exist", async () => {
    expect(await accountHasPermission("no-such-account", { tutor: ["unlimited"] })).toBe(
      false
    );
  });

  it("shows the Admin Role on the Admin's next session read", async () => {
    const { agent, body } = await signedInStudent();
    await promoteToAdmin(body.email);

    const session = await agent
      .get("/api/auth/get-session?disableCookieCache=true")
      .set("Origin", "http://localhost:3001")
      .expect(200);

    expect(session.body.user.role).toBe("admin");
  });
});

describe("promoteToAdmin", () => {
  beforeEach(resetAccounts);

  it("matches the email regardless of letter case and is idempotent", async () => {
    const body = signUpBody();
    const response = await signUp(body).expect(200);
    const userId = response.body.user.id;

    expect(await promoteToAdmin(body.email.toUpperCase())).toEqual({
      userId,
      alreadyAdmin: false
    });
    expect(await promoteToAdmin(body.email)).toEqual({ userId, alreadyAdmin: true });
    expect((await storedRole(userId))?.role).toBe("admin");
  });

  it("leaves other Accounts as Students", async () => {
    const admin = signUpBody();
    const other = signUpBody();
    await signUp(admin).expect(200);
    const otherResponse = await signUp(other).expect(200);

    await promoteToAdmin(admin.email);

    expect((await storedRole(otherResponse.body.user.id))?.role).toBe("user");
  });

  it("fails with ACCOUNT_NOT_FOUND for an unknown email", async () => {
    await expect(promoteToAdmin("nobody@example.com")).rejects.toMatchObject({
      statusCode: 404,
      code: "ACCOUNT_NOT_FOUND"
    });
    expect(await db.select().from(user)).toEqual([]);
  });
});

describe("pnpm admin:promote", () => {
  beforeEach(resetAccounts);

  function promote(email?: string) {
    return run(
      process.execPath,
      ["--import", "tsx", "src/scripts/promote-admin.ts", ...(email ? [email] : [])],
      { env: { ...process.env, NODE_ENV: "test", DATABASE_URL: testDatabaseUrl() } }
    );
  }

  it("makes the Account with that email an Admin", async () => {
    const body = signUpBody();
    const response = await signUp(body).expect(200);

    await promote(body.email);

    expect((await storedRole(response.body.user.id))?.role).toBe("admin");
  });

  it("exits with an error for an unknown email and without an email", async () => {
    await expect(promote("nobody@example.com")).rejects.toMatchObject({ code: 1 });
    await expect(promote()).rejects.toMatchObject({ code: 1 });
  });
});

describe("Admin Role migration", () => {
  it("gives existing Accounts the Student Role and adds the columns with defaults only", async () => {
    const migration = await readFile(
      new URL(
        "../src/db/drizzle/20261015115949_clammy_roland_deschain/migration.sql",
        import.meta.url
      ),
      "utf8"
    );
    const client = await db.$client.connect();

    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA admin_role_migration_test");
      await client.query("SET LOCAL search_path TO admin_role_migration_test");
      await client.query('CREATE TABLE "user" (id text PRIMARY KEY)');
      await client.query('CREATE TABLE "session" (id text PRIMARY KEY)');
      await client.query(`INSERT INTO "user" VALUES ('legacy-one'), ('legacy-two')`);
      await client.query(`INSERT INTO "session" VALUES ('legacy-session')`);

      await client.query(migration);

      const users = await client.query(
        'SELECT id, role, banned, ban_reason, ban_expires FROM "user" ORDER BY id'
      );
      expect(users.rows).toEqual([
        {
          id: "legacy-one",
          role: "user",
          banned: false,
          ban_reason: null,
          ban_expires: null
        },
        {
          id: "legacy-two",
          role: "user",
          banned: false,
          ban_reason: null,
          ban_expires: null
        }
      ]);

      // Code from before this migration inserts rows without the new columns.
      await client.query(`INSERT INTO "user" (id) VALUES ('deployed-code')`);
      await client.query(`INSERT INTO "session" (id) VALUES ('deployed-session')`);
      const inserted = await client.query(
        `SELECT role FROM "user" WHERE id = 'deployed-code'`
      );
      expect(inserted.rows).toEqual([{ role: "user" }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
