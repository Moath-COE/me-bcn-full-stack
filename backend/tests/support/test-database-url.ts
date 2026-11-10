import { config } from "dotenv";

// Tests truncate the user row tables, so refuse anything that isn't a dedicated *_test database.
export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? config({ quiet: true }).parsed?.TEST_DATABASE_URL;

  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  }

  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must name a database ending in _test");
  }

  return url;
}
