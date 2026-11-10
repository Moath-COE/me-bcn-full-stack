import type { TestProject } from "vitest/node";

import { testDatabaseUrl } from "./test-database-url.js";

// Migrates and seeds the test database once per run.
export default async function setup(project: TestProject): Promise<void> {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl();
  // test.env applies to workers; global setup also imports the validated app env.
  for (const key of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) {
    process.env[key] = project.config.env[key];
  }

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("../../src/db/index.js");
  const { seed } = await import("../../src/db/seed.js");

  try {
    await migrate(db, { migrationsFolder: "src/db/drizzle" });
    await seed();
  } finally {
    await db.$client.end();
  }
}
