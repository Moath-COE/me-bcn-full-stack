import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

import { db } from "../src/db/index.js";

it("migrates existing Accounts to Free with UTC anchors and idempotent backfill SQL", async () => {
  const migration = await readFile(
    new URL(
      "../src/db/drizzle/20261013145744_zippy_arclight/migration.sql",
      import.meta.url
    ),
    "utf8"
  );
  const client = await db.$client.connect();

  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA plan_migration_test");
    await client.query("SET LOCAL search_path TO plan_migration_test");
    await client.query("SET LOCAL TIME ZONE 'Asia/Riyadh'");
    await client.query(
      'CREATE TABLE "user" (id text PRIMARY KEY, created_at timestamp NOT NULL)'
    );
    await client.query(`INSERT INTO "user" VALUES
      ('legacy-one', '2025-01-01 12:34:56.789'),
      ('legacy-two', '2026-09-01 00:00:00')`);

    await client.query(migration);
    const plans = await client.query('SELECT * FROM "plan"');
    expect(plans.rows).toEqual([
      {
        id: "free",
        name_ar: "الباقة المجانية",
        name_en: "Free plan",
        sessions_per_period: 6,
        seconds_per_period: 3600,
        max_active_enrollments: 1,
        max_session_seconds: 1800,
        min_start_seconds: 180
      }
    ]);
    const assignments = await client.query(`
      SELECT user_id, plan_id, starts_at, ends_at, source
      FROM plan_assignment ORDER BY user_id
    `);
    expect(
      assignments.rows.map((row) => ({
        ...row,
        starts_at: new Date(row.starts_at).toISOString()
      }))
    ).toEqual([
      {
        user_id: "legacy-one",
        plan_id: "free",
        starts_at: "2025-01-01T12:34:56.789Z",
        ends_at: null,
        source: "default"
      },
      {
        user_id: "legacy-two",
        plan_id: "free",
        starts_at: "2026-09-01T00:00:00.000Z",
        ends_at: null,
        source: "default"
      }
    ]);

    const backfill = migration
      .split("--> statement-breakpoint")
      .filter((statement) => /INSERT INTO "(?:plan|plan_assignment)"/.test(statement));
    expect(backfill).toHaveLength(2);
    for (const statement of backfill) await client.query(statement);
    expect(
      (await client.query("SELECT count(*)::integer AS count FROM plan_assignment")).rows
    ).toEqual([{ count: 2 }]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
